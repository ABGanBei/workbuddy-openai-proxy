/**
 * WorkBuddy 上游 HTTP 客户端:聊天流、token 刷新、模型目录。
 *
 * 端点与请求头完全对齐 dsh-connect-workbuddy 实测结论(MIT):
 *   - 聊天:POST {base}/v2/chat/completions
 *   - 刷新:POST {base}/v2/plugin/auth/token/refresh(不带 body,凭据走 X-Refresh-Token 头)
 *   - 目录:GET  {base}/v3/config(CN 失败时回退 /v2/enterprises/personal/models)
 *
 * 区域路由由凭据 domain 决定:
 *   workbuddy.ai / codebuddy.ai 系 → 国际版,基址跟凭据域走
 *   其余(含空)→ 国内版,copilot.tencent.com
 *
 * 关键事实(实测):上游只接受 stream:true 的聊天请求,
 * 响应本身就是 OpenAI 兼容的 SSE(data: {...}\n\n ... data: [DONE]\n\n)。
 */
import type { WorkBuddyCredential } from './auth.js'
import { randomUUID } from 'node:crypto'
import { createLogger } from '../utils/logger.js'

const log = createLogger('client')

export const CN_CHAT_BASE = 'https://copilot.tencent.com'
export const CN_BILLING_BASE = 'https://www.codebuddy.cn'
export const GLOBAL_BASE = 'https://www.workbuddy.ai'

/** CLI 渠道 User-Agent:决定 /v3/config 返回的模型清单渠道。 */
const CLIENT_UA = 'CLI/2.63.2 CodeBuddy/2.63.2'
/** 桌面渠道 User-Agent:国际版 /v3/config 必须用它才能拿到完整清单。 */
const DESKTOP_UA = 'WorkBuddy/5.5.2'

/** 元数据类请求(目录/刷新)的超时。 */
const JSON_TIMEOUT_MS = 30_000
/** 失败响应体最多读取的字符数。 */
const ERROR_BODY_LIMIT = 4096

export type WorkBuddyRegion = 'cn' | 'global'

/** 凭据域 → 区域。 */
export function regionOf(domain: string): WorkBuddyRegion {
  const lowered = domain.trim().toLowerCase()
  if (lowered === 'workbuddy.ai' || lowered.endsWith('.workbuddy.ai')) return 'global'
  if (lowered === 'codebuddy.ai' || lowered.endsWith('.codebuddy.ai')) return 'global'
  return 'cn'
}

/** 国际版基址按凭据域分家:codebuddy.ai 的 token 与 workbuddy.ai 互不通用。 */
function globalBase(domain: string): string {
  const lowered = domain.trim().toLowerCase()
  if (lowered === 'codebuddy.ai' || lowered.endsWith('.codebuddy.ai')) return 'https://www.codebuddy.ai'
  return GLOBAL_BASE
}

function chatBase(credential: WorkBuddyCredential): string {
  return regionOf(credential.domain) === 'global' ? globalBase(credential.domain) : CN_CHAT_BASE
}

function billingBase(credential: WorkBuddyCredential): string {
  return regionOf(credential.domain) === 'global' ? globalBase(credential.domain) : CN_BILLING_BASE
}

function originReferer(credential: WorkBuddyCredential): string {
  return regionOf(credential.domain) === 'global' ? globalBase(credential.domain) : CN_BILLING_BASE
}

/** 所有上游请求共享的头。 */
function commonHeaders(credential: WorkBuddyCredential): Record<string, string> {
  return {
    'Accept': 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'Origin': originReferer(credential),
    'Referer': `${originReferer(credential)}/`,
    'User-Agent': CLIENT_UA,
  }
}

/**
 * chat 端点要求的「会话身份三件套」。
 *
 * 上游自 2026-10-16 起对 chat 请求增加渠道校验(400/11128
 * "Illegal API invocation from an unapproved channel"):请求必须携带这三个头,
 * 缺任何一个都会被拒。值由客户端自己生成即可(网关不校验来源),
 * 但必须**每次请求重新生成、三个互不相同**——复用等于拿一个 id 冒充三次会话,
 * 会破坏上游自己的会话关联。
 *
 * 只加在 chat 端点;billing / refresh / 模型目录都不加(它们在网关侧走别的校验)。
 */
function conversationHeaders(): Record<string, string> {
  return {
    'X-Conversation-ID': randomUUID(),
    'X-Conversation-Request-ID': randomUUID(),
    'X-Conversation-Message-ID': randomUUID(),
  }
}

/**
 * 聊天请求头,沿用官方 CLI 的 X-No-* 约定。
 * 导出仅供测试断言使用(生产代码通过 chatStream 间接调用)。
 */
export function chatHeaders(credential: WorkBuddyCredential): Record<string, string> {
  return {
    ...commonHeaders(credential),
    'Content-Type': 'application/json',
    // 安全红线:聊天请求绝不携带 refresh token
    ...(credential.uid === '' ? { 'X-No-User-Id': '1' } : { 'X-User-Id': credential.uid }),
    ...(credential.enterpriseId === undefined || credential.enterpriseId === ''
      ? { 'X-No-Enterprise-Id': '1' }
      : { 'X-Enterprise-Id': credential.enterpriseId }),
    ...(credential.domain === '' ? { 'X-No-Department-Info': '1' } : { 'X-Domain': credential.domain }),
    'X-Product': 'SaaS',
    // 渠道校验三件套:只在这一处展开,保证所有 chat 路径都吃到
    ...conversationHeaders(),
  }
}

/** 刷新端点请求头:X-Refresh-Token 只出现在这里。 */
function refreshHeaders(credential: WorkBuddyCredential): Record<string, string> {
  const headers: Record<string, string> = {
    ...commonHeaders(credential),
    'X-Refresh-Token': credential.refreshToken,
    'X-Auth-Refresh-Source': 'workbuddy',
  }
  if (credential.enterpriseId !== undefined && credential.enterpriseId !== '') {
    headers['X-Enterprise-Id'] = credential.enterpriseId
  }
  return headers
}

/** billing 请求头。 */
function billingHeaders(credential: WorkBuddyCredential): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${credential.accessToken}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }
  if (credential.uid !== '') headers['X-User-Id'] = credential.uid
  if (credential.enterpriseId !== undefined && credential.enterpriseId !== '') {
    headers['X-Enterprise-Id'] = credential.enterpriseId
    headers['X-Tenant-Id'] = credential.enterpriseId
  }
  if (credential.domain !== '') headers['X-Domain'] = credential.domain
  return headers
}

/** 上游失败分类。 */
export type UpstreamErrorKind =
  | 'hard_credit'   // 积分不足(402 / 14018)
  | 'soft_rate'     // 账号级限流(429 / 6004)
  | 'model_busy'    // 模型级限流(429 / 14003)
  | 'session_dead'  // 登录失效
  | 'policy_reject' // 内容策略拒绝
  | 'not_found'     // 模型不存在
  | 'server'        // 上游 5xx / 传输失败
  | 'client'        // 请求本身不合法

export interface WorkBuddyChatFailure {
  ok: false
  status: number
  kind: UpstreamErrorKind
  message: string
}

export interface WorkBuddyChatOk {
  ok: true
  response: globalThis.Response
}

export type WorkBuddyChatResult = WorkBuddyChatOk | WorkBuddyChatFailure

/** 凭据被上游拒绝(401/403)的专用错误。 */
export class WorkBuddyCredentialRejectedError extends Error {
  readonly code = 'WORKBUDDY_CREDENTIAL_REJECTED'
  readonly status: number
  constructor(status: number) {
    super(`workbuddy: 登录凭据被上游拒绝 (http ${status}),请在 WorkBuddy App 重新登录。`)
    this.name = 'WorkBuddyCredentialRejectedError'
    this.status = status
  }
}

const HARD_CREDIT_MARKERS: readonly string[] = [
  'insufficient credit', 'no credit', 'credit exhausted', 'credits exhausted',
  'out of credit', 'quota exceeded', 'quota exhaust', 'payment required',
  'credit not enough', 'not enough credit', 'credits not enough',
  '积分不足', '额度不足', '余额不足', '积分用完', '额度用尽', '没有积分',
]
const CREDITS_EXHAUSTED_CODE = '"code":14018'
const SESSION_DEAD_MARKERS: readonly string[] = ['Offline user session not found', '12153']
const POLICY_REJECT_MARKERS: readonly string[] = ['request illegal', '"code":11140']
const MODEL_BUSY_CODE = '"code":14003'

/**
 * 按 HTTP 状态 + 响应体把上游失败分到可行动的类别。
 * 顺序严格:积分 → 会话失效 → 内容策略 → 模型繁忙 → 限流 → 404 → 5xx → 4xx。
 */
export function classifyUpstreamError(status: number, body: string): UpstreamErrorKind {
  if (status === 402) return 'hard_credit'
  const lower = body.toLowerCase()
  for (const marker of HARD_CREDIT_MARKERS) {
    if (lower.includes(marker.toLowerCase()) || body.includes(marker)) return 'hard_credit'
  }
  if (body.includes(CREDITS_EXHAUSTED_CODE)) return 'hard_credit'
  for (const marker of SESSION_DEAD_MARKERS) {
    if (body.includes(marker)) return 'session_dead'
  }
  for (const marker of POLICY_REJECT_MARKERS) {
    if (body.includes(marker)) return 'policy_reject'
  }
  if (body.includes(MODEL_BUSY_CODE)) return 'model_busy'
  if (status === 429) return 'soft_rate'
  if (status === 404) return 'not_found'
  if (status >= 500) return 'server'
  if (status >= 400) return 'client'
  return 'client'
}

/** 网关(openresty/APISIX)直接拒绝 token:401/403 且非 JSON。 */
function isGatewayAuthRejection(status: number, text: string): boolean {
  if (status !== 401 && status !== 403) return false
  const lower = text.toLowerCase()
  return lower.includes('openresty') || lower.includes('apisix') || lower.includes('authorization required')
}

interface Envelope { code: number; msg: string; data: unknown }

async function readEnvelope(response: globalThis.Response): Promise<Envelope> {
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    if (isGatewayAuthRejection(response.status, text)) {
      throw new WorkBuddyCredentialRejectedError(response.status)
    }
    throw new Error(`workbuddy upstream returned non-JSON (http ${response.status}): ${text.slice(0, 160)}`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`workbuddy upstream returned an unexpected document (http ${response.status})`)
  }
  const document = parsed as Record<string, unknown>
  return {
    code: typeof document['code'] === 'number' ? document['code'] : 0,
    msg: typeof document['msg'] === 'string' ? document['msg'] : '',
    data: 'data' in document ? document['data'] : undefined,
  }
}

function envelopeError(status: number, envelope: Envelope): Error {
  if ((status === 401 || status === 403) && envelope.code !== 0) {
    return new WorkBuddyCredentialRejectedError(status)
  }
  const detail = envelope.msg !== '' ? `: ${envelope.msg}` : ''
  return new Error(`workbuddy upstream error (http ${status}, code ${envelope.code})${detail}`)
}

/** token 刷新结果。 */
export interface WorkBuddyRefreshOutcome {
  accessToken: string
  refreshToken?: string
  expiresInSec?: number
  domain?: string
}

/** 今日签到活动状态(只读查询)。 */
export interface WorkBuddyCheckinStatus {
  active: boolean
  todayCheckedIn: boolean
  streakDays: number
  dailyCredit: number
  todayCredit: number
  isStreakDay: boolean
  nextStreakDay: number
  streakBonusDays: number
  streakBonusCredit: number
}

/** 一个积分包,日期已解析为 epoch ms。 */
export interface WorkBuddyCreditPackage {
  packageName: string
  /** 剩余额度(cycle 家族口径)。 */
  remain: number
  /** 包的容量(同一家族)。 */
  size: number
  /** CapacityType 4:月周期刷新、不过期。 */
  monthly: boolean
  /** 下个周期起点(仅月包)。 */
  refreshAtMs?: number
  /** 一次性过期时刻(仅礼包)。 */
  expiresAtMs?: number
}

/** 一个凭据的聚合积分。 */
export interface WorkBuddyCredits {
  total: number
  packages: readonly WorkBuddyCreditPackage[]
  /** 3 天内过期的积分。 */
  expiringSoon: number
  /** 最近一个包的过期时刻(ms)。 */
  nearestExpiryMs?: number
}

/** 上游目录中的一个可用模型。 */
export interface WorkBuddyUpstreamModel {
  id: string
  name: string
  contextWindow: number
  maxTokens: number
  creditMultiplier?: number
  supportsImages?: boolean
  supportsToolCall?: boolean
  descriptionZh?: string
  descriptionEn?: string
}

function parseCreditMultiplier(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = /x\s*([0-9]*\.?[0-9]+)/iu.exec(value)
  if (match === null) return undefined
  const parsed = Number.parseFloat(match[1]!)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** 解析目录中的一个模型条目;token 限额无效的丢弃。 */
function parseUpstreamModel(value: unknown): WorkBuddyUpstreamModel | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as Record<string, unknown>
  const id = typeof raw['id'] === 'string' ? raw['id'] : ''
  if (id === '' || raw['disabled'] === true) return undefined
  const input = typeof raw['maxInputTokens'] === 'number' ? raw['maxInputTokens'] : 0
  const output = typeof raw['maxOutputTokens'] === 'number' ? raw['maxOutputTokens'] : 0
  if (input <= 0 || output <= 0) return undefined
  const name = typeof raw['name'] === 'string' && raw['name'] !== '' ? raw['name'] : id
  const creditMultiplier = parseCreditMultiplier(raw['credits'])
  const supportsImages = raw['disabledMultimodal'] === true
    ? false
    : typeof raw['supportsImages'] === 'boolean'
      ? raw['supportsImages']
      : undefined
  return {
    id,
    name,
    contextWindow: input,
    maxTokens: output,
    ...(creditMultiplier === undefined ? {} : { creditMultiplier }),
    ...(supportsImages === undefined ? {} : { supportsImages }),
    ...(typeof raw['supportsToolCall'] === 'boolean' ? { supportsToolCall: raw['supportsToolCall'] } : {}),
    ...(typeof raw['descriptionZh'] === 'string' && raw['descriptionZh'] !== '' ? { descriptionZh: raw['descriptionZh'] } : {}),
    ...(typeof raw['descriptionEn'] === 'string' && raw['descriptionEn'] !== '' ? { descriptionEn: raw['descriptionEn'] } : {}),
  }
}

/** 从目录文档里挑出 cli 渠道的模型清单(无 cli 名单时暴露全部)。 */
export function selectCliModels(rawModels: unknown, agents: unknown): WorkBuddyUpstreamModel[] {
  const byId = new Map<string, WorkBuddyUpstreamModel>()
  for (const model of Array.isArray(rawModels) ? rawModels : []) {
    const parsed = parseUpstreamModel(model)
    if (parsed !== undefined) byId.set(parsed.id, parsed)
  }
  let cliIds: readonly string[] | undefined
  for (const agent of Array.isArray(agents) ? agents : []) {
    if (typeof agent === 'object' && agent !== null) {
      const wrapped = agent as Record<string, unknown>
      if (wrapped['name'] === 'cli' && Array.isArray(wrapped['models'])) {
        cliIds = wrapped['models'].filter((id): id is string => typeof id === 'string')
        break
      }
    }
  }
  const ids = cliIds !== undefined && cliIds.length > 0 ? cliIds : [...byId.keys()]
  const models = ids
    .map(id => byId.get(id))
    .filter((model): model is WorkBuddyUpstreamModel => model !== undefined)
  if (models.length === 0) throw new Error('workbuddy model catalog resolved to an empty list')
  return models
}

export class WorkBuddyClient {
  /**
   * 发起聊天请求。成功返回上游的原始 SSE Response,由调用方消费;
   * 失败返回分类后的错误。
   *
   * 本方法刻意不设总超时:一次回答要先预填整个 prompt,
   * 耗时随上下文大小跨数量级变化。超时由调用方注入的
   * AbortSignal(响应首字节超时)与客户端断开取消共同控制。
   */
  async chatStream(
    credential: WorkBuddyCredential,
    bodyJson: string,
    signal?: AbortSignal,
  ): Promise<WorkBuddyChatResult> {
    let response: globalThis.Response
    try {
      response = await fetch(`${chatBase(credential)}/v2/chat/completions`, {
        method: 'POST',
        headers: { ...chatHeaders(credential), 'Authorization': `Bearer ${credential.accessToken}` },
        body: bodyJson,
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error: unknown) {
      return { ok: false, status: 0, kind: 'server', message: `transport error: ${String(error)}` }
    }
    if (response.ok) return { ok: true, response }
    const text = (await response.text()).slice(0, ERROR_BODY_LIMIT)
    return {
      ok: false,
      status: response.status,
      kind: classifyUpstreamError(response.status, text),
      message: text,
    }
  }

  /** 刷新 access token。 */
  async refreshToken(credential: WorkBuddyCredential): Promise<WorkBuddyRefreshOutcome> {
    const response = await fetch(`${chatBase(credential)}/v2/plugin/auth/token/refresh`, {
      method: 'POST',
      headers: refreshHeaders(credential),
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    })
    const envelope = await readEnvelope(response)
    if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope)
    const data = typeof envelope.data === 'object' && envelope.data !== null
      ? envelope.data as Record<string, unknown>
      : {}
    const accessToken = typeof data['accessToken'] === 'string' ? data['accessToken'] : ''
    if (accessToken === '') throw new Error('workbuddy token refresh returned no accessToken; sign in again in the WorkBuddy app')
    const outcome: WorkBuddyRefreshOutcome = { accessToken }
    if (typeof data['refreshToken'] === 'string' && data['refreshToken'] !== '') outcome.refreshToken = data['refreshToken']
    if (typeof data['expiresIn'] === 'number' && data['expiresIn'] > 0) outcome.expiresInSec = data['expiresIn']
    if (typeof data['domain'] === 'string' && data['domain'] !== '') outcome.domain = data['domain']
    return outcome
  }

  /** 查询今日签到状态(只读,不改变账号状态)。 */
  async fetchCheckinStatus(credential: WorkBuddyCredential): Promise<WorkBuddyCheckinStatus> {
    const response = await fetch(`${billingBase(credential)}/v2/billing/meter/checkin-activity-status`, {
      method: 'POST',
      headers: billingHeaders(credential),
      body: '{}',
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    })
    const envelope = await readEnvelope(response)
    if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope)
    const data = typeof envelope.data === 'object' && envelope.data !== null
      ? envelope.data as Record<string, unknown>
      : {}
    const numberField = (key: string): number => typeof data[key] === 'number' ? data[key] as number : 0
    return {
      active: data['active'] === true,
      todayCheckedIn: data['today_checked_in'] === true,
      streakDays: numberField('streak_days'),
      dailyCredit: numberField('daily_credit'),
      todayCredit: numberField('today_credit'),
      isStreakDay: data['is_streak_day'] === true,
      nextStreakDay: numberField('next_streak_day'),
      streakBonusDays: numberField('streak_bonus_days'),
      streakBonusCredit: numberField('streak_bonus_credit'),
    }
  }

  /**
   * 查询剩余积分(只读,不消耗积分)。
   * 余额读 cycle 家族的精确字段(官方客户端同款口径),
   * 一次性礼包(已耗尽/已过期)被剔除。
   */
  async fetchCredits(credential: WorkBuddyCredential): Promise<WorkBuddyCredits> {
    const now = new Date()
    const format = (date: Date): string => [
      date.getFullYear().toString().padStart(4, '0'),
      (date.getMonth() + 1).toString().padStart(2, '0'),
      date.getDate().toString().padStart(2, '0'),
    ].join('-') + ' ' + [
      date.getHours().toString().padStart(2, '0'),
      date.getMinutes().toString().padStart(2, '0'),
      date.getSeconds().toString().padStart(2, '0'),
    ].join(':')
    const response = await fetch(`${billingBase(credential)}/v2/billing/meter/get-user-resource`, {
      method: 'POST',
      headers: billingHeaders(credential),
      body: JSON.stringify({
        PageNumber: 1,
        PageSize: 100,
        ProductCode: 'p_tcaca',
        Status: [0, 3],
        PackageEndTimeRangeBegin: format(now),
        PackageEndTimeRangeEnd: format(new Date(now.getTime() + 365 * 101 * 24 * 3600 * 1000)),
      }),
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    })
    const envelope = await readEnvelope(response)
    if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope)
    const responseWrapper = typeof envelope.data === 'object' && envelope.data !== null
      ? envelope.data as Record<string, unknown>
      : {}
    const data = typeof responseWrapper['Response'] === 'object' && responseWrapper['Response'] !== null
      ? responseWrapper['Response'] as Record<string, unknown>
      : {}
    const inner = typeof data['Data'] === 'object' && data['Data'] !== null
      ? data['Data'] as Record<string, unknown>
      : {}
    const rawAccounts = Array.isArray(inner['Accounts']) ? inner['Accounts'] : []

    let total = 0
    let nearestExpiryMs: number | undefined
    let expiringSoon = 0
    const SOON_MS = 3 * 24 * 60 * 60 * 1000
    const parseDate = (raw: unknown): number | undefined => {
      if (typeof raw === 'number' && raw > 1000000000000) return raw
      if (typeof raw === 'string' && raw !== '') {
        const parsed = Date.parse(raw)
        if (!Number.isNaN(parsed)) return parsed
      }
      return undefined
    }
    const packages: WorkBuddyCreditPackage[] = []
    for (const raw of rawAccounts) {
      if (typeof raw !== 'object' || raw === null) continue
      const account = raw as Record<string, unknown>
      const numberField = (key: string): number => (typeof account[key] === 'number' ? account[key] as number : 0)
      // 每个容量字段都有 *Precise 字符串形式(带小数),官方客户端读它。
      const preciseField = (key: string): number => {
        const rawValue = account[`${key}Precise`]
        if (typeof rawValue === 'string' && rawValue !== '') {
          const parsed = Number.parseFloat(rawValue)
          if (Number.isFinite(parsed)) return parsed
        }
        if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return rawValue
        return numberField(key)
      }
      // CapacityType 4 = 月周期资源(每个周期刷新,不过期);1 = 一次性礼包。
      const monthly = numberField('CapacityType') === 4
      const size = preciseField('CycleCapacitySize') || preciseField('CapacitySize')
      const hasCycle = account['CycleCapacityRemain'] !== undefined
        || account['CycleCapacityRemainPrecise'] !== undefined
      const remain = hasCycle ? preciseField('CycleCapacityRemain') : preciseField('CapacityRemain')
      const cappedRemain = remain < 0 ? 0 : remain
      const cycleEndMs = parseDate(account['CycleEndTime'])
      const expiresAtMs = monthly ? undefined : parseDate(account['ExpiredTime']) ?? cycleEndMs
      const refreshAtMs = monthly
        ? cycleEndMs === undefined ? undefined : cycleEndMs + 1_000
        : undefined
      // 丢弃已耗尽/已过期的一次性礼包;月周期资源始终保留。
      if (!monthly && (cappedRemain <= 0 || (expiresAtMs !== undefined && expiresAtMs <= Date.now()))) {
        continue
      }
      total += cappedRemain
      const expiryMs = expiresAtMs
      if (expiryMs !== undefined) {
        if (nearestExpiryMs === undefined || expiryMs < nearestExpiryMs) nearestExpiryMs = expiryMs
        if (expiryMs - Date.now() <= SOON_MS) expiringSoon += cappedRemain
      }
      packages.push({
        packageName: typeof account['PackageName'] === 'string' ? account['PackageName'] : '(unnamed)',
        remain: cappedRemain,
        size,
        monthly,
        ...(refreshAtMs === undefined ? {} : { refreshAtMs }),
        ...(expiresAtMs === undefined ? {} : { expiresAtMs }),
      })
    }
    return {
      total,
      packages,
      expiringSoon,
      ...(nearestExpiryMs === undefined ? {} : { nearestExpiryMs }),
    }
  }

  /**
   * 拉取模型目录。
   * 两区域都优先 /v3/config;CN 失败时回退 /v2/enterprises/personal/models。
   * UA 区分渠道:国际版必须用桌面 UA,国内版用 CLI UA(才有免费模型)。
   */
  async fetchModels(credential: WorkBuddyCredential, signal?: AbortSignal): Promise<WorkBuddyUpstreamModel[]> {
    const timeout = signal ?? AbortSignal.timeout(JSON_TIMEOUT_MS)
    const global = regionOf(credential.domain) === 'global'
    if (global) {
      const response = await fetch(`${globalBase(credential.domain)}/v3/config`, {
        headers: {
          'Authorization': `Bearer ${credential.accessToken}`,
          'Accept': 'application/json',
          ...(credential.uid === '' ? {} : { 'X-User-Id': credential.uid }),
          ...(credential.domain === '' ? {} : { 'X-Domain': credential.domain }),
          'X-Product': 'SaaS',
          'X-Requested-With': 'XMLHttpRequest',
          'Connection': 'close',
          'User-Agent': DESKTOP_UA,
        },
        signal: timeout,
      })
      const envelope = await readEnvelope(response)
      if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope)
      const data = typeof envelope.data === 'object' && envelope.data !== null
        ? envelope.data as Record<string, unknown>
        : {}
      return selectCliModels(data['models'], data['agents'])
    }

    const readCatalog = async (path: string): Promise<WorkBuddyUpstreamModel[]> => {
      const response = await fetch(`${chatBase(credential)}${path}`, {
        headers: {
          'Authorization': `Bearer ${credential.accessToken}`,
          'Accept': 'application/json',
          'Origin': originReferer(credential),
          'Referer': `${originReferer(credential)}/`,
          'User-Agent': CLIENT_UA,
        },
        signal: timeout,
      })
      const envelope = await readEnvelope(response)
      if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope)
      const data = typeof envelope.data === 'object' && envelope.data !== null
        ? envelope.data as Record<string, unknown>
        : {}
      return selectCliModels(data['models'], data['agents'])
    }

    try {
      return await readCatalog('/v3/config')
    } catch (error) {
      log.warn(`CN /v3/config 失败,回退旧目录: ${String(error)}`)
      return readCatalog('/v2/enterprises/personal/models')
    }
  }
}
