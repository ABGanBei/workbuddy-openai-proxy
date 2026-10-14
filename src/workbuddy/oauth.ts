/**
 * WorkBuddy OAuth 登录(手机号验证码扫码/网页登录),不依赖桌面 App。
 *
 * 移植自 dsh-connect-workbuddy(MIT)的 src/oauth.ts,对照官网 cockpit 的
 * oauth_start / oauth_poll 通行实现:
 *   1. POST {billing_base}/v2/plugin/auth/state?platform=workbuddy 申请 state;
 *   2. 用户在浏览器打开 authUrl(官方登录页)完成手机号验证码登录;
 *   3. 客户端轮询 GET {billing_base}/v2/plugin/auth/token?state={state} 换凭据;
 *   4. 以 Bearer 调 GET /v2/plugin/login/account 拉取账号资料。
 *
 * 区域约定与 client.ts 一致:CN 为 https://www.codebuddy.cn;国际版按凭据域
 * 分家(workbuddy.ai / codebuddy.ai 两把钥匙各自签发,混用会被网关拒绝)。
 * 登录会话状态只在进程内:state 与进度不落盘,拿到凭据即终结;
 * 刷新仍走 client.refreshToken。
 */
import { randomUUID } from 'node:crypto'
import { regionOf, type WorkBuddyRegion } from './client.js'

/** 国内版 billing 基址(与 client.ts 的 CN_BILLING_BASE 一致)。 */
const CN_BILLING_BASE = 'https://www.codebuddy.cn'
/** 国际版默认基址(桌面 App 网关)。 */
const GLOBAL_BILLING_BASE = 'https://www.workbuddy.ai'

/** 两个区域共用的上游 plugin API 前缀。 */
const API_PREFIX = '/v2/plugin'

/** 一次登录的存活时间;过期后客户端必须重新发起。 */
export const OAUTH_LOGIN_TIMEOUT_SECONDS = 600

/** 一次进行中的登录。state 是上游的 CSRF 风格绑定值。 */
interface LoginSession {
  region: WorkBuddyRegion
  /** 签发 state 的基址;向别的基址轮询会被拒绝。 */
  base: string
  state: string
  /** 过期时刻(epoch ms),过了登录即死。 */
  expiresAtMs: number
  done: boolean
  result?: WorkBuddyOAuthSuccess
  error?: string
}

/** 一次完成的登录交给账号库的凭据形态。 */
export interface WorkBuddyOAuthSuccess {
  accessToken: string
  refreshToken: string
  /** access token 过期(epoch ms;0 = 上游未给)。 */
  expiresAtMs: number
  /** refresh token 过期(epoch ms),上游给出时存在。 */
  refreshExpiresAtMs?: number
  /** 上游把 token 绑定到的登录域,决定后续网关路由。 */
  domain: string
  uid: string
  nickname?: string
  uin?: string
  enterpriseId?: string
}

/** 一次轮询的回答;done 是卡片停止轮询的唯一信号。 */
export type WorkBuddyOAuthPollResult =
  | { done: false }
  | { done: true; account: WorkBuddyOAuthSuccess }
  | { done: true; error: string }

/** 进程内会话表;刻意不持久化:重启即取消。 */
const sessions = new Map<string, LoginSession>()

/** 去掉尾部斜杠;不发明 scheme。 */
function normalizeBase(base: string): string {
  return base.trim().replace(/\/+$/, '')
}

/** 某区域的登录 billing 基址。 */
export function oauthBillingBase(region: WorkBuddyRegion, explicitBase?: string): string {
  if (region === 'cn') return CN_BILLING_BASE
  const trimmed = explicitBase?.trim()
  if (trimmed !== undefined && trimmed !== '') return normalizeBase(trimmed)
  return GLOBAL_BILLING_BASE
}

/** 解析一个 JSON 响应体;非 JSON 返回 undefined(严重性由调用方决定)。 */
async function readJson(response: globalThis.Response): Promise<Record<string, unknown> | undefined> {
  try {
    const text = await response.text()
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fall through
  }
  return undefined
}

/** 信封的 data 对象;非对象 data 视为空。 */
function envelopeData(document: Record<string, unknown>): Record<string, unknown> {
  const data = document['data']
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {}
}

/** keys 里第一个非空字符串,否则 ''。数字也接受(转字符串)。 */
function firstString(source: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

/** 可选字符串字段。 */
function optionalString(source: Record<string, unknown>, keys: readonly string[]): string | undefined {
  const value = firstString(source, keys)
  return value === '' ? undefined : value
}

/**
 * 过期字段:可能是绝对时间戳(s 或 ms)或相对 TTL 秒,
 * 与 client.ts 的 expiryToMs 同样宽容。
 */
function expiryMs(
  source: Record<string, unknown>,
  absoluteKeys: readonly string[],
  ttlKeys: readonly string[],
): number | undefined {
  for (const key of absoluteKeys) {
    const value = source[key]
    if (typeof value === 'number' && value > 0) {
      return value > 1e12 ? value : value * 1000
    }
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      const parsed = Number(value)
      return parsed > 1e12 ? parsed : parsed * 1000
    }
  }
  for (const key of ttlKeys) {
    const value = source[key]
    if (typeof value === 'number' && value > 0) return Date.now() + value * 1000
  }
  return undefined
}

/**
 * 发起一次登录:向上游申请 state,返回用户要打开的授权 URL。
 * 会话绑定 region 与 base,每次轮询都会校验。
 *
 * 对上游拒绝不抛异常——错误作为返回值的 error 字段,
 * 便于管理页直接内联渲染原因。
 */
export async function oauthStart(
  region: WorkBuddyRegion,
  options?: { base?: string; fetchImpl?: typeof fetch },
): Promise<{ loginId: string; verificationUri: string; expiresIn: number } | { error: string }> {
  const base = normalizeBase(oauthBillingBase(region, options?.base))
  const doFetch = options?.fetchImpl ?? fetch
  let response: globalThis.Response
  try {
    response = await doFetch(`${base}${API_PREFIX}/auth/state?platform=workbuddy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error: unknown) {
    return { error: `无法连接 ${base} 发起登录 (${error instanceof Error ? error.message : String(error)})` }
  }
  const document = await readJson(response)
  if (document === undefined) {
    return { error: `登录服务返回了非 JSON 响应 (http ${response.status})` }
  }
  const data = envelopeData(document)
  const state = firstString(data, ['state', 'State'])
  if (state === '') {
    return { error: `登录服务没有签发 state (http ${response.status})` }
  }
  const authUrl = firstString(data, ['authUrl', 'auth_url', 'url', 'Url'])
    || `${base}/login?state=${encodeURIComponent(state)}`
  const loginId = `wbo_${randomUUID().replaceAll('-', '')}`
  sessions.set(loginId, {
    region,
    base,
    state,
    expiresAtMs: Date.now() + OAUTH_LOGIN_TIMEOUT_SECONDS * 1000,
    done: false,
  })
  return { loginId, verificationUri: authUrl, expiresIn: OAUTH_LOGIN_TIMEOUT_SECONDS }
}

/** 已完成会话的终态视图(给完成之后到达的轮询)。 */
function terminalOf(session: LoginSession): WorkBuddyOAuthPollResult {
  if (session.result !== undefined) return { done: true, account: session.result }
  return { done: true, error: session.error ?? '登录已结束但没有结果' }
}

/**
 * 轮询一次登录结果。
 * 顺序很重要:会话的 region/base 绑定先于任何 I/O 校验,
 * 所以指向错误区域的轮询根本不会触网。
 */
export async function oauthPoll(
  loginId: string,
  region: WorkBuddyRegion,
  options?: { fetchImpl?: typeof fetch },
): Promise<WorkBuddyOAuthPollResult> {
  const session = sessions.get(loginId)
  if (session === undefined) return { done: true, error: '登录会话不存在,请重新发起' }
  if (session.region !== region) return { done: true, error: '登录会话属于另一个区域' }
  if (session.done) return terminalOf(session)
  if (Date.now() > session.expiresAtMs) {
    session.done = true
    session.error = '登录超时,请重新发起'
    sessions.delete(loginId)
    return { done: true, error: session.error }
  }

  const doFetch = options?.fetchImpl ?? fetch
  let response: globalThis.Response
  try {
    response = await doFetch(`${session.base}${API_PREFIX}/auth/token?state=${encodeURIComponent(session.state)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    // 传输抖动不是死登录:用户可能还在扫码。会话期限最终会终结卡住的登录。
    return { done: false }
  }
  const document = await readJson(response)
  if (document === undefined) return { done: false }
  const code = typeof document['code'] === 'number' ? document['code'] : -1
  // 未完成状态以业务错误码应答;只有 code 0 / 200 携带数据。
  if (code !== 0 && code !== 200) return { done: false }
  const data = envelopeData(document)
  const accessToken = firstString(data, ['accessToken', 'access_token', 'AccessToken'])
  if (accessToken === '') return { done: false }

  session.done = true
  try {
    const account = await collectAccount(session, accessToken, data, doFetch)
    sessions.delete(loginId)
    return { done: true, account }
  } catch (error: unknown) {
    session.error = error instanceof Error ? error.message : String(error)
    sessions.delete(loginId)
    return { done: true, error: session.error }
  }
}

/** 拉取账号资料并组装成功值。 */
async function collectAccount(
  session: LoginSession,
  accessToken: string,
  tokenData: Record<string, unknown>,
  doFetch: typeof fetch,
): Promise<WorkBuddyOAuthSuccess> {
  const headers: Record<string, string> = { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
  const domain = firstString(tokenData, ['domain', 'Domain'])
  if (domain !== '') headers['X-Domain'] = domain
  let profile: Record<string, unknown> = {}
  try {
    const response = await doFetch(`${session.base}${API_PREFIX}/login/account`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30_000),
    })
    const document = await readJson(response)
    if (document !== undefined) profile = envelopeData(document)
  } catch {
    // 资料只是展示元数据;token 已到手,缺资料不该让登录失败。
    // uid 兜底由调用方处理(空 uid 时仍可用 token)。
  }
  const uid = firstString(profile, ['uid', 'Uid', 'userId', 'UserID'])
  const nickname = optionalString(profile, ['nickname', 'NickName', 'ScreenName'])
  const uin = optionalString(profile, ['uin', 'Uin'])
  const enterpriseId = optionalString(profile, ['enterpriseId', 'EnterpriseId'])
  // 0 = 上游未给过期时间;存储层会保留该字段并视为"需尽快刷新"。
  const expiresAtMs = expiryMs(tokenData, ['expiresAt', 'expires_at'], ['expiresIn', 'expires_in']) ?? 0
  const refreshExpiresAtMs = expiryMs(tokenData, ['refreshExpiresAt', 'refresh_expires_at'], ['refreshExpiresIn', 'refresh_expires_in'])
  const refresh = firstString(tokenData, ['refreshToken', 'refresh_token', 'RefreshToken'])
  return {
    accessToken,
    refreshToken: refresh,
    expiresAtMs,
    ...(refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs }),
    // token 自带的 domain 优先:它决定哪扇网关接受这把凭据。
    domain: domain !== '' ? domain : firstString(profile, ['domain', 'Domain']),
    uid,
    ...(nickname === undefined ? {} : { nickname }),
    ...(uin === undefined ? {} : { uin }),
    ...(enterpriseId === undefined ? {} : { enterpriseId }),
  }
}

/** 完成的登录凭据所属区域。 */
export function regionOfOAuthAccount(account: Pick<WorkBuddyOAuthSuccess, 'domain'>): WorkBuddyRegion {
  return regionOf(account.domain)
}
