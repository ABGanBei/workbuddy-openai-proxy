/**
 * 账号池:多账号调度与 failover。
 *
 * 规则(移植自 dsh-connect-workbuddy 的账号池实测结论):
 *   1. 默认优先使用主账号;
 *   2. 请求失败时按失败类别决定是否换号:
 *      - 换号:hard_credit(积分不足)、soft_rate(账号级限流)、
 *        session_dead(token 失效)、server(5xx/网络)——
 *        这些是"某个账号"的状态,换一个账号很可能就过了;
 *      - 不换号:client(HTTP 400,请求本身非法)、model_busy(模型级限流)、
 *        policy_reject(内容策略)——换号没有意义;
 *   3. 每次失败写该账号的测量(冷却期),下一个请求直接跳过冷却中的账号;
 *   4. token 过期前 5 分钟单飞刷新;刷新失败但旧 token 还有余量则继续用;
 *   5. 全部账号都失败时,把最后一个错误报出去(注明尝试了几个账号)。
 */
import type { AccountStore, AccountStatus, StoredAccount } from './account-store.js'
import type { WorkBuddyClient, UpstreamErrorKind } from './client.js'
import type { WorkBuddyCredential } from './auth.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('account-pool')

/** 冷却兜底时长:上游没给恢复时间时的默认值。 */
const DEFAULT_COOLDOWN_MS = 30 * 60_000

export interface AccountPoolOptions {
  store: AccountStore
  client: WorkBuddyClient
}

/** 单飞刷新表:账号 id → in-flight 刷新 promise。 */
type RefreshMap = Map<string, Promise<StoredAccount>>

export interface PooledCredential {
  account: StoredAccount
  /** 是否经过一次自动换号(管理页/日志可见)。 */
  failover: boolean
}

/** 一次失败是否值得换号。 */
export function isFailoverWorthy(kind: UpstreamErrorKind | string): boolean {
  switch (kind) {
    case 'hard_credit':
    case 'soft_rate':
    case 'session_dead':
    case 'server':
      return true
    case 'model_busy':
    case 'policy_reject':
    case 'not_found':
    case 'client':
    default:
      return false
  }
}

/** 失败类别 → 账号状态(记录进 store,影响后续排序)。 */
function statusForFailure(kind: UpstreamErrorKind, message: string): AccountStatus {  switch (kind) {
    case 'hard_credit':
      return { kind: 'out_of_credits', atMs: Date.now(), detail: message.slice(0, 200) }
    case 'soft_rate':
      return { kind: 'rate_limited', atMs: Date.now(), untilMs: Date.now() + DEFAULT_COOLDOWN_MS, detail: message.slice(0, 200) }
    case 'session_dead':
      return { kind: 'bad_credential', atMs: Date.now(), detail: message.slice(0, 200) }
    case 'server':
      return { kind: 'unreachable', atMs: Date.now(), untilMs: Date.now() + DEFAULT_COOLDOWN_MS, detail: message.slice(0, 200) }
    default:
      return { kind: 'unreachable', atMs: Date.now(), untilMs: Date.now() + DEFAULT_COOLDOWN_MS, detail: message.slice(0, 200) }
  }
}

export class AccountPool {
  private readonly store: AccountStore
  private readonly client: WorkBuddyClient
  private readonly inflightRefresh: RefreshMap = new Map()

  constructor(options: AccountPoolOptions) {
    this.store = options.store
    this.client = options.client
  }

  /** StoredAccount → client 需要的 WorkBuddyCredential 形态。 */
  static toCredential(account: StoredAccount): WorkBuddyCredential {
    return {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiresAtMs: account.expiresAtMs,
      ...(account.refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs: account.refreshExpiresAtMs }),
      domain: account.domain,
      uid: account.uid,
      ...(account.enterpriseId === undefined ? {} : { enterpriseId: account.enterpriseId }),
      ...(account.nickname === undefined ? {} : { nickname: account.nickname }),
      ...(account.uin === undefined ? {} : { uin: account.uin }),
      source: 'env' as const,
      filePath: '',
    }
  }

  /** 当前可用账号数。 */
  get size(): number {
    return this.store.count
  }

  /**
   * 候选账号排序:主账号最前,其余按 addedAtMs;
   * 冷却中的账号排最后(仍保留,作为"实在没人可用"的最后手段)。
   */
  private candidates(): StoredAccount[] {
    const all = this.store.all()
    const primary = this.store.primary
    const primaryId = primary?.id ?? null
    const active: StoredAccount[] = []
    const cooling: StoredAccount[] = []
    for (const account of all) {
      const status = account.lastStatus
      const coolingDown = status !== undefined
        && status.untilMs !== undefined
        && status.untilMs > Date.now()
        && status.kind !== 'ok'
      if (coolingDown) {
        cooling.push(account)
      } else {
        active.push(account)
      }
    }
    const sortKey = (account: StoredAccount): number =>
      account.id === primaryId ? 0 : account.addedAtMs
    active.sort((a, b) => sortKey(a) - sortKey(b))
    cooling.sort((a, b) => sortKey(a) - sortKey(b))
    return [...active, ...cooling]
  }

  /**
   * 取一个"准备好"的凭据:token 过期前 5 分钟内会自动刷新(单飞)。
   * 刷新失败时旧 token 还有余量就继续用;refresh token 缺失且即将过期则跳过。
   */
  private async prepare(account: StoredAccount): Promise<StoredAccount> {
    const needsRefresh = account.expiresAtMs <= 0
      || Date.now() + 5 * 60_000 >= account.expiresAtMs
    if (!needsRefresh) return account
    if (account.refreshToken === '') {
      // 无 refresh token:token 已过期就跳过这个账号(避免必然的 401 往返)
      if (account.expiresAtMs > 0 && account.expiresAtMs < Date.now() + 30_000) {
        throw new Error('token 已过期且无 refresh token')
      }
      return account
    }
    let inflight = this.inflightRefresh.get(account.id)
    if (inflight === undefined) {
      inflight = this.refresh(account).finally(() => {
        this.inflightRefresh.delete(account.id)
      })
      this.inflightRefresh.set(account.id, inflight)
    }
    return inflight
  }

  private async refresh(account: StoredAccount): Promise<StoredAccount> {
    try {
      const outcome = await this.client.refreshToken(AccountPool.toCredential(account))
      await this.store.updateTokens(account.id, {
        accessToken: outcome.accessToken,
        ...(outcome.refreshToken === undefined ? {} : { refreshToken: outcome.refreshToken }),
        expiresAtMs: outcome.expiresInSec !== undefined && outcome.expiresInSec > 0
          ? Date.now() + outcome.expiresInSec * 1000
          : account.expiresAtMs,
        ...(outcome.domain === undefined ? {} : { domain: outcome.domain }),
      })
      const refreshed = this.store.get(account.id) ?? account
      log.info(`账号 ${refreshed.nickname ?? refreshed.uin ?? refreshed.id} token 已刷新`)
      return refreshed
    } catch (error) {
      // 刷新失败:旧 token 还有余量就继续用,否则抛给调用方跳过该账号
      if (account.expiresAtMs > Date.now() + 30_000) {
        log.warn(`账号 ${account.nickname ?? account.id} token 刷新失败,继续用旧 token: ${String(error)}`)
        return account
      }
      throw error
    }
  }

  /** 按 id 直接取凭据(管理页"测试账号"用),带刷新。 */
  async resolveById(id: string): Promise<StoredAccount> {
    const account = this.store.get(id)
    if (account === undefined) throw new Error('账号不存在')
    return this.prepare(account)
  }

  /** 主账号凭据(手动操作入口,不做 failover)。 */
  async resolvePrimary(): Promise<StoredAccount> {
    const primary = this.store.primary
    if (primary === undefined) throw new Error('没有可用账号,请先添加并登录一个 WorkBuddy 账号')
    return this.prepare(primary)
  }

  /**
   * 账号池入口:拿一个凭据交给请求;请求失败时按类别换号重试。
   *
   * @param send 用给定账号执行请求,返回 { ok:true, ... } 或
   *             { ok:false, kind, status, message }
   * @returns 成功结果(带 failover 标记)或最后一个失败
   */
  async run<T>(
    send: (account: StoredAccount) => Promise<{ ok: true; value: T } | { ok: false; kind: UpstreamErrorKind; status: number; message: string }>,
  ): Promise<{ ok: true; value: T; failover: boolean } | { ok: false; kind: UpstreamErrorKind; status: number; message: string; attempts: number }> {
    const candidates = this.candidates()
    if (candidates.length === 0) {
      return { ok: false, kind: 'session_dead', status: 401, message: '没有可用账号,请先添加并登录一个 WorkBuddy 账号', attempts: 0 }
    }
    let lastFailure: { kind: UpstreamErrorKind; status: number; message: string } | undefined
    const triedNames: string[] = []
    for (let i = 0; i < candidates.length; i += 1) {
      const account = candidates[i]!
      // 冷却中的账号只作最后手段:前几个候选都失败时才碰
      let prepared: StoredAccount
      try {
        prepared = await this.prepare(account)
      } catch (error) {
        log.warn(`账号 ${account.nickname ?? account.id} 跳过: ${String(error)}`)
        continue
      }
      triedNames.push(prepared.nickname ?? prepared.uin ?? prepared.id)
      const result = await send(prepared)
      if (result.ok) {
        await this.store.recordUse(prepared.id, { ok: true })
        return { ok: true, value: result.value, failover: i > 0 }
      }
      lastFailure = { kind: result.kind, status: result.status, message: result.message }
      await this.store.recordUse(prepared.id, { ok: false, status: statusForFailure(result.kind, result.message) })
      log.warn(`账号 ${prepared.nickname ?? prepared.id} 请求失败(${result.kind}, http ${result.status}),${i + 1 < candidates.length ? '尝试下一个账号' : '无更多账号'}`)
      if (!isFailoverWorthy(result.kind)) {
        // 换号没有意义的失败:立即停止,不浪费后续账号
        break
      }
    }
    return {
      ok: false,
      kind: lastFailure?.kind ?? 'server',
      status: lastFailure?.status ?? 502,
      message: lastFailure?.message ?? '未知错误',
      attempts: triedNames.length,
    }
  }
}
