/**
 * WorkBuddy 多账号本地存储。
 *
 * 一个 JSON 文件存最多 MAX_ACCOUNTS 个账号,结构:
 * {
 *   "version": 1,
 *   "primaryId": "……" | null,
 *   "accounts": [ { id, domain, uid, nickname, uin, enterpriseId,
 *                   accessToken, refreshToken, expiresAtMs, refreshExpiresAtMs,
 *                   addedAtMs, lastUsedAtMs, lastStatus?, failCount } ]
 * }
 *
 * 安全约定:
 *   - token 只存在这个文件里(不含明文密码;密码从不上传也不落盘);
 *   - 文件权限 0600、目录 0700(UNIX;Termux/Android 上 chmod 到最小权限);
 *   - 写入用"临时文件 + rename"原子替换,绝不半写;
 *   - 敏感字段从不进入日志;对外(API/管理页)只暴露非敏感摘要。
 *
 * 文件位置默认由调用方指定(Server Plugin 场景为
 * <SillyTavern>/data/workbuddy-gateway/accounts.json)。
 */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  chmodSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { createLogger } from '../utils/logger.js'

const log = createLogger('account-store')

export const MAX_ACCOUNTS = 5

/** 一个账号的持久化形态。 */
export interface StoredAccount {
  /** 账号 id(添加时生成,稳定不变)。 */
  id: string
  /** 登录域(决定国内/国际路由)。 */
  domain: string
  uid: string
  nickname?: string
  uin?: string
  enterpriseId?: string
  accessToken: string
  refreshToken: string
  /** epoch ms;0 = 未知(需尽快刷新)。 */
  expiresAtMs: number
  refreshExpiresAtMs?: number
  /** 添加时刻。 */
  addedAtMs: number
  /** 最近一次成功使用(请求级)。 */
  lastUsedAtMs?: number
  /** 最近一次探测结论。 */
  lastStatus?: AccountStatus
  /** 连续失败次数(调度时降权;成功时清零)。 */
  failCount: number
}

/** 一个账号的运行期状态。 */
export interface AccountStatus {
  /** ok | bad_credential | out_of_credits | rate_limited | unreachable */
  kind: 'ok' | 'bad_credential' | 'out_of_credits' | 'rate_limited' | 'unreachable'
  /** 何时得出的结论。 */
  atMs: number
  /** 冷却解除时刻(限流/不可达时给出)。 */
  untilMs?: number
  detail?: string
}

/** 磁盘文件形态。 */
interface StoreFile {
  version: 1
  primaryId: string | null
  accounts: StoredAccount[]
}

/** 对外(管理页/API)暴露的账号摘要,绝不含 token。 */
export interface AccountSummary {
  id: string
  domain: string
  nickname?: string
  uin?: string
  uid: string
  primary: boolean
  addedAtMs: number
  lastUsedAtMs?: number
  lastStatus?: AccountStatus
  failCount: number
  /** token 是否在 5 分钟内过期(客户端可提示刷新)。 */
  expiringSoon: boolean
}

export interface AccountStoreOptions {
  /** 账号文件路径。 */
  filePath: string
}

export class AccountStore {
  private readonly filePath: string
  private data: StoreFile
  /** 串行化写操作,避免并发写撕裂。 */
  private writeQueue: Promise<unknown> = Promise.resolve()

  constructor(options: AccountStoreOptions) {
    this.filePath = options.filePath
    this.data = this.load()
  }

  private load(): StoreFile {
    try {
      if (!existsSync(this.filePath)) return { version: 1, primaryId: null, accounts: [] }
      const raw = readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<StoreFile>
      if (parsed.version !== 1 || !Array.isArray(parsed.accounts)) {
        throw new Error('账号文件格式不识别')
      }
      const accounts = parsed.accounts.filter((account): account is StoredAccount => {
        return typeof account === 'object'
          && account !== null
          && typeof account.id === 'string'
          && typeof account.accessToken === 'string'
          && typeof account.domain === 'string'
      })
      if (accounts.length > MAX_ACCOUNTS) {
        log.warn(`账号文件包含 ${accounts.length} 个账号,截断到 ${MAX_ACCOUNTS}`)
        accounts.length = MAX_ACCOUNTS
      }
      const primaryId = typeof parsed.primaryId === 'string'
        && accounts.some(account => account.id === parsed.primaryId)
        ? parsed.primaryId
        : null
      return { version: 1, primaryId, accounts }
    } catch (error) {
      log.warn(`账号文件不可读,从空账号开始: ${String(error)}`)
      return { version: 1, primaryId: null, accounts: [] }
    }
  }

  /** 原子写盘(临时文件 + rename),串行执行。 */
  private persist(): Promise<void> {
    const payload = JSON.stringify(this.data, null, 2)
    this.writeQueue = this.writeQueue.then(() => {
      try {
        const dir = dirname(this.filePath)
        mkdirSync(dir, { recursive: true, mode: 0o700 })
        const tmp = join(dir, `.accounts.json.${process.pid}.${Date.now()}.tmp`)
        writeFileSync(tmp, payload, { encoding: 'utf8', mode: 0o600 })
        renameSync(tmp, this.filePath)
        try {
          chmodSync(this.filePath, 0o600)
        } catch {
          // Windows 上 chmod 不生效,忽略
        }
      } catch (error) {
        log.error(`账号文件写入失败: ${String(error)}`)
        throw error
      }
    })
    return this.writeQueue as Promise<void>
  }

  /** 账号数。 */
  get count(): number {
    return this.data.accounts.length
  }

  /** 按 id 找账号(内部用,含 token;勿外泄)。 */
  get(id: string): StoredAccount | undefined {
    return this.data.accounts.find(account => account.id === id)
  }

  /** 主账号。 */
  get primary(): StoredAccount | undefined {
    if (this.data.primaryId === null) return this.data.accounts[0]
    return this.data.accounts.find(account => account.id === this.data.primaryId)
  }

  /** 全部账号(内部)。 */
  all(): readonly StoredAccount[] {
    return this.data.accounts
  }

  /** 无 token 的账号摘要列表,可直接暴露给前端。 */
  summaries(): AccountSummary[] {
    return this.data.accounts.map(account => this.summaryOf(account))
  }

  private summaryOf(account: StoredAccount): AccountSummary {
    return {
      id: account.id,
      domain: account.domain,
      ...(account.nickname === undefined ? {} : { nickname: account.nickname }),
      ...(account.uin === undefined ? {} : { uin: account.uin }),
      uid: account.uid,
      primary: this.data.primaryId === account.id
        || (this.data.primaryId === null && account === this.data.accounts[0]),
      addedAtMs: account.addedAtMs,
      ...(account.lastUsedAtMs === undefined ? {} : { lastUsedAtMs: account.lastUsedAtMs }),
      ...(account.lastStatus === undefined ? {} : { lastStatus: account.lastStatus }),
      failCount: account.failCount,
      expiringSoon: account.expiresAtMs > 0 && account.expiresAtMs - Date.now() < 5 * 60_000,
    }
  }

  /** 添加账号(去重:同 uid+domain 覆盖;满员时报错)。 */
  async add(input: {
    domain: string
    uid: string
    nickname?: string
    uin?: string
    enterpriseId?: string
    accessToken: string
    refreshToken: string
    expiresAtMs: number
    refreshExpiresAtMs?: number
  }): Promise<StoredAccount> {
    const existing = this.data.accounts.find(account =>
      account.uid === input.uid && account.domain === input.domain)
    if (existing !== undefined) {
      // 覆盖更新:同账号重新登录
      existing.accessToken = input.accessToken
      existing.refreshToken = input.refreshToken
      existing.expiresAtMs = input.expiresAtMs
      existing.refreshExpiresAtMs = input.refreshExpiresAtMs
      existing.nickname = input.nickname ?? existing.nickname
      existing.uin = input.uin ?? existing.uin
      existing.enterpriseId = input.enterpriseId ?? existing.enterpriseId
      existing.lastStatus = undefined
      existing.failCount = 0
      await this.persist()
      return existing
    }
    if (this.data.accounts.length >= MAX_ACCOUNTS) {
      throw new Error(`最多支持 ${MAX_ACCOUNTS} 个账号,请先删除一个`)
    }
    const id = `acct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const account: StoredAccount = {
      id,
      domain: input.domain,
      uid: input.uid,
      ...(input.nickname === undefined ? {} : { nickname: input.nickname }),
      ...(input.uin === undefined ? {} : { uin: input.uin }),
      ...(input.enterpriseId === undefined ? {} : { enterpriseId: input.enterpriseId }),
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAtMs: input.expiresAtMs,
      ...(input.refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs: input.refreshExpiresAtMs }),
      addedAtMs: Date.now(),
      failCount: 0,
    }
    this.data.accounts.push(account)
    // 第一个账号自动成为主账号
    if (this.data.primaryId === null && this.data.accounts.length === 1) {
      this.data.primaryId = account.id
    }
    await this.persist()
    return account
  }

  /** 删除账号。 */
  async remove(id: string): Promise<void> {
    const index = this.data.accounts.findIndex(account => account.id === id)
    if (index === -1) throw new Error('账号不存在')
    this.data.accounts.splice(index, 1)
    if (this.data.primaryId === id) {
      this.data.primaryId = this.data.accounts.length > 0 ? this.data.accounts[0]!.id : null
    }
    await this.persist()
  }

  /** 设置主账号。 */
  async setPrimary(id: string): Promise<void> {
    if (!this.data.accounts.some(account => account.id === id)) throw new Error('账号不存在')
    this.data.primaryId = id
    await this.persist()
  }

  /** 更新一个账号的 token(刷新后)。 */
  async updateTokens(id: string, patch: {
    accessToken: string
    refreshToken?: string
    expiresAtMs: number
    refreshExpiresAtMs?: number
    domain?: string
  }): Promise<void> {
    const account = this.get(id)
    if (account === undefined) throw new Error('账号不存在')
    account.accessToken = patch.accessToken
    if (patch.refreshToken !== undefined && patch.refreshToken !== '') account.refreshToken = patch.refreshToken
    account.expiresAtMs = patch.expiresAtMs
    if (patch.refreshExpiresAtMs !== undefined) account.refreshExpiresAtMs = patch.refreshExpiresAtMs
    if (patch.domain !== undefined && patch.domain !== '') account.domain = patch.domain
    await this.persist()
  }

  /** 记录一次使用结果(成功清零失败计数;失败记录状态)。 */
  async recordUse(id: string, outcome: { ok: boolean; status?: AccountStatus }): Promise<void> {
    const account = this.get(id)
    if (account === undefined) return
    if (outcome.ok) {
      account.failCount = 0
      account.lastUsedAtMs = Date.now()
      if (account.lastStatus?.kind !== 'ok' || account.lastStatus.kind === undefined) {
        account.lastStatus = { kind: 'ok', atMs: Date.now() }
      }
    } else {
      account.failCount += 1
      if (outcome.status !== undefined) account.lastStatus = outcome.status
    }
    await this.persist()
  }

  /** 清空失败计数/状态(手动重置)。 */
  async resetStatus(id: string): Promise<void> {
    const account = this.get(id)
    if (account === undefined) throw new Error('账号不存在')
    account.failCount = 0
    account.lastStatus = undefined
    await this.persist()
  }
}
