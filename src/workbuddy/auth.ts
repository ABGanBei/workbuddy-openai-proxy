/**
 * WorkBuddy 登录状态处理:凭据发现、解析(含加密字段解密)、
 * 过期检测与自动刷新。
 *
 * 凭据默认从 WorkBuddy 桌面 App 的 auth 目录读取(只读,永不回写);
 * 也可通过 WORKBUDDY_TOKEN 环境变量显式指定(适用于无桌面环境)。
 * 刷新得到的新 token 只保存在内存,不落盘。
 *
 * 路径约定移植自 dsh-connect-workbuddy(MIT):
 *   Windows: %LOCALAPPDATA% / %APPDATA% 下 CodeBuddyExtension\Data\Public\auth
 *   macOS:   ~/Library/Application Support/CodeBuddyExtension/Data/Public/auth
 *   Linux:   $XDG_CONFIG_HOME 或 ~/.config 下同路径
 *   文件名:  workbuddy-desktop.info(以及带时间戳的 *.info 备份)
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, basename } from 'node:path'
import {
  isEncryptedFieldWrapper,
  openEncryptedField,
  readAtRestKey,
} from './at-rest.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('auth')

/** 规范化后的 WorkBuddy 凭据,时间戳一律为 epoch 毫秒。 */
export interface WorkBuddyCredential {
  accessToken: string
  refreshToken: string
  /** access token 过期时间(毫秒);0 表示未知 */
  expiresAtMs: number
  /** refresh token 过期时间(毫秒);缺省表示未知 */
  refreshExpiresAtMs?: number
  /** 登录域,决定国内版 / 国际版路由,如 www.codebuddy.cn */
  domain: string
  uid: string
  enterpriseId?: string
  nickname?: string
  uin?: string
  /** 凭据来源:desktop = 读自 App 登录文件;env = 来自环境变量 */
  source: 'desktop' | 'env'
  /** 凭据文件绝对路径(source=env 时为空) */
  filePath: string
}

/** 登录失效等需要暴露给用户的可执行错误。 */
export class WorkBuddyAuthError extends Error {
  /** 'not-found' | 'encrypted' | 'expired' */
  readonly kind: string
  constructor(kind: string, message: string) {
    super(message)
    this.name = 'WorkBuddyAuthError'
    this.kind = kind
  }
}

/** 平台默认凭据目录,按探测顺序返回。 */
export function defaultAuthDirs(
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (platform === 'darwin') {
    return [join(home, 'Library', 'Application Support', 'CodeBuddyExtension', 'Data', 'Public', 'auth')]
  }
  if (platform === 'win32') {
    const local = (env['LOCALAPPDATA']?.trim() || '') !== '' ? env['LOCALAPPDATA']!.trim() : join(home, 'AppData', 'Local')
    const roaming = (env['APPDATA']?.trim() || '') !== '' ? env['APPDATA']!.trim() : join(home, 'AppData', 'Roaming')
    return [
      join(local, 'CodeBuddyExtension', 'Data', 'Public', 'auth'),
      join(roaming, 'CodeBuddyExtension', 'Data', 'Public', 'auth'),
    ]
  }
  if (platform === 'linux') {
    const config = (env['XDG_CONFIG_HOME']?.trim() || '') !== '' ? env['XDG_CONFIG_HOME']!.trim() : join(home, '.config')
    return [join(config, 'CodeBuddyExtension', 'Data', 'Public', 'auth')]
  }
  return []
}

/** 桌面 App 的实时登录文件名。 */
const LIVE_FILENAME = 'workbuddy-desktop.info'

/** 探测一个 auth 目录下的候选文件:实时文件 + 同目录 *.info 备份(新→旧)。 */
function candidateFilesInDir(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  try {
    const entries = readdirSync(dir)
    const backups = entries
      .filter(name => name.endsWith('.info') && name !== LIVE_FILENAME)
      .sort()
      .reverse()
    const live = join(dir, LIVE_FILENAME)
    if (existsSync(live)) out.push(live)
    for (const backup of backups) out.push(join(dir, backup))
  } catch {
    // 目录存在但读不了,视作无候选
  }
  return out
}

/** 规范化一个过期时间:接受秒或毫秒。 */
function expiryToMs(value: number): number {
  if (value <= 0) return 0
  return value > 1e12 ? value : value * 1000
}

/** 读取一个字段;若是加密信封则用密钥解开。 */
function credentialField(value: unknown, key: Buffer | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (!isEncryptedFieldWrapper(value)) return undefined
  if (key === undefined) return undefined
  return openEncryptedField(value, key)
}

/** 可选字段:缺失、非字符串、打不开的信封都视为"未知",不失败。 */
function optionalField(value: unknown, key: Buffer | undefined): string | undefined {
  if (typeof value === 'string') return value === '' ? undefined : value
  if (!isEncryptedFieldWrapper(value)) return undefined
  if (key === undefined) return undefined
  try {
    return openEncryptedField(value, key)
  } catch {
    return undefined
  }
}

/** 解析一个 WorkBuddy auth 文档;无 access token 时返回 undefined。 */
export function parseWorkBuddyAuth(
  text: string,
  filePath: string,
  atRestKey?: Buffer,
): WorkBuddyCredential | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const document = parsed as Record<string, unknown>
  // 两种磁盘形态:nested {"auth":{...},"account":{...}} 与 flat
  const auth = typeof document['auth'] === 'object' && document['auth'] !== null
    ? document['auth'] as Record<string, unknown>
    : document
  const identity = typeof document['account'] === 'object' && document['account'] !== null
    ? document['account'] as Record<string, unknown>
    : document

  let accessToken: string | undefined
  let refreshToken: string | undefined
  try {
    accessToken = credentialField(auth['accessToken'], atRestKey)
    refreshToken = credentialField(auth['refreshToken'], atRestKey)
  } catch {
    // 信封损坏 / 密钥不匹配 / tag 失败都视为"此文档不可读"
    return undefined
  }
  if (accessToken === undefined || accessToken === '') return undefined
  const expiresAtMs = typeof auth['expiresAt'] === 'number' ? expiryToMs(auth['expiresAt']) : 0
  const refreshExpiresAtMs = typeof auth['refreshExpiresAt'] === 'number' ? expiryToMs(auth['refreshExpiresAt']) : undefined
  const enterpriseId = optionalField(identity['enterpriseId'], atRestKey)
  const nickname = optionalField(identity['nickname'], atRestKey)
  const uin = optionalField(identity['uin'], atRestKey)
  const credential: WorkBuddyCredential = {
    accessToken,
    refreshToken: refreshToken ?? '',
    expiresAtMs,
    ...(refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs }),
    domain: optionalField(auth['domain'], atRestKey) ?? '',
    uid: optionalField(identity['uid'], atRestKey) ?? '',
    ...(enterpriseId === undefined ? {} : { enterpriseId }),
    ...(nickname === undefined ? {} : { nickname }),
    ...(uin === undefined ? {} : { uin }),
    source: 'desktop',
    filePath,
  }
  return credential
}

/** 文档里是否含需要解密的字段。 */
export function hasEncryptedCredentialFields(text: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return false
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false
  const document = parsed as Record<string, unknown>
  const auth = typeof document['auth'] === 'object' && document['auth'] !== null
    ? document['auth'] as Record<string, unknown>
    : document
  const identity = typeof document['account'] === 'object' && document['account'] !== null
    ? document['account'] as Record<string, unknown>
    : document
  return isEncryptedFieldWrapper(auth['accessToken'])
    || isEncryptedFieldWrapper(auth['refreshToken'])
    || isEncryptedFieldWrapper(identity['nickname'])
    || isEncryptedFieldWrapper(identity['uin'])
    || isEncryptedFieldWrapper(identity['uid'])
    || isEncryptedFieldWrapper(identity['enterpriseId'])
    || isEncryptedFieldWrapper(auth['domain'])
}

/** 从环境变量显式构造凭据(不读文件)。 */
function credentialFromEnv(): WorkBuddyCredential | undefined {
  const token = (process.env['WORKBUDDY_TOKEN'] ?? '').trim()
  if (token === '') return undefined
  const domain = (process.env['WORKBUDDY_DOMAIN'] ?? '').trim() || 'www.codebuddy.cn'
  return {
    accessToken: token,
    refreshToken: '',
    expiresAtMs: 0,
    domain,
    uid: '',
    source: 'env',
    filePath: '',
  }
}

/** token 刷新结果(client.refreshToken 的返回值)。 */
export interface RefreshOutcome {
  accessToken: string
  refreshToken?: string
  expiresInSec?: number
  domain?: string
}

/**
 * 凭据管理器:发现并解密本机登录的 WorkBuddy 凭据,
 * 按需刷新,并缓存结果。
 */
export class WorkBuddyAuth {
  private credential: WorkBuddyCredential | undefined
  private lastScanAtMs = 0
  private readonly scanTtlMs: number
  private readonly explicitFile: string | undefined
  /** 刷新后的新 token 只保存在这里,不回写磁盘。 */
  private inflightRefresh: Promise<WorkBuddyCredential> | undefined
  /** 刷新函数由 server 注入(调用 client.refreshToken)。 */
  refreshFn?: (credential: WorkBuddyCredential) => Promise<RefreshOutcome>

  constructor(options: { explicitFile?: string; scanTtlMs?: number } = {}) {
    this.explicitFile = options.explicitFile
    this.scanTtlMs = options.scanTtlMs ?? 60_000
  }

  /** 扫描本机凭据文件,返回解密后的凭据(不刷新)。 */
  async scan(): Promise<WorkBuddyCredential | undefined> {
    const fromEnv = credentialFromEnv()
    if (fromEnv !== undefined) {
      this.credential = fromEnv
      return this.credential
    }
    const candidates: string[] = []
    if (this.explicitFile !== undefined && this.explicitFile !== '') {
      if (existsSync(this.explicitFile)) {
        candidates.push(this.explicitFile)
        candidates.push(...candidateFilesInDir(join(this.explicitFile, '..')).filter(
          path => basename(path) !== basename(this.explicitFile!),
        ))
      }
    } else {
      for (const dir of defaultAuthDirs()) candidates.push(...candidateFilesInDir(dir))
    }

    // 第一轮:按明文尝试所有候选;含加密字段的文档先记下来
    const encryptedTexts: { path: string; text: string }[] = []
    for (const path of candidates) {
      let text: string
      try {
        text = readFileSync(path, 'utf8')
      } catch {
        continue
      }
      if (hasEncryptedCredentialFields(text)) {
        encryptedTexts.push({ path, text })
        continue
      }
      const credential = parseWorkBuddyAuth(text, path)
      if (credential !== undefined) {
        this.credential = credential
        this.lastScanAtMs = Date.now()
        return credential
      }
    }

    // 第二轮:加密文档需要 App 在场的 at-rest 密钥才能打开。
    // 密钥获取失败时如实报错(而不是误报"未登录")。
    if (encryptedTexts.length > 0) {
      let atRestKey: Buffer | undefined
      try {
        atRestKey = await readAtRestKey()
      } catch (error) {
        log.warn(`获取 WorkBuddy 解密密钥失败: ${String(error)}`)
      }
      if (atRestKey === undefined) {
        const paths = encryptedTexts.map(entry => entry.path).join(', ')
        throw new WorkBuddyAuthError(
          'encrypted',
          `本机 WorkBuddy 登录凭据已加密,需要桌面 App 在场才能解密 (${paths})。`
          + '请安装 WorkBuddy 桌面 App,或用 WORKBUDDY_APP_EXECUTABLE 指定其可执行文件;'
          + '或直接用 WORKBUDDY_TOKEN 提供 token。',
        )
      }
      for (const { path, text } of encryptedTexts) {
        const credential = parseWorkBuddyAuth(text, path, atRestKey)
        if (credential !== undefined) {
          this.credential = credential
          this.lastScanAtMs = Date.now()
          return credential
        }
      }
    }

    return undefined
  }

  /** 取得当前凭据;过期时自动刷新(单飞,并发共享同一次刷新)。 */
  async resolve(): Promise<WorkBuddyCredential> {
    // 环境变量 token:无过期信息,直接用
    if (this.credential !== undefined && this.credential.source === 'env') return this.credential
    if (this.credential === undefined || Date.now() - this.lastScanAtMs > this.scanTtlMs) {
      await this.scan()
    }
    if (this.credential === undefined) {
      throw new WorkBuddyAuthError(
        'not-found',
        '未找到本机 WorkBuddy 登录凭据。请先在 WorkBuddy 桌面 App 登录,'
        + '或通过 WORKBUDDY_TOKEN 环境变量显式提供 token。',
      )
    }
    if (!this.needsRefresh(this.credential)) return this.credential
    this.inflightRefresh ??= this.refresh(this.credential).finally(() => {
      this.inflightRefresh = undefined
    })
    return this.inflightRefresh
  }

  /** token 是否临近过期(默认提前 5 分钟)。 */
  private needsRefresh(credential: WorkBuddyCredential): boolean {
    if (credential.expiresAtMs <= 0) return false // 未知过期时间:不主动刷新,等上游 401
    if (credential.source === 'env') return false
    return Date.now() + 5 * 60_000 >= credential.expiresAtMs
  }

  private async refresh(credential: WorkBuddyCredential): Promise<WorkBuddyCredential> {
    if (credential.refreshToken === '') {
      // 没有 refresh token 且 token 即将过期:让上游报错触发 401 路径
      if (credential.expiresAtMs > 0 && credential.expiresAtMs < Date.now() + 30_000) {
        throw new WorkBuddyAuthError('expired', 'WorkBuddy 登录已过期且无可用 refresh token,请重新在 WorkBuddy App 登录。')
      }
      return credential
    }
    if (this.refreshFn === undefined) return credential
    try {
      const outcome = await this.refreshFn(credential)
      const refreshed: WorkBuddyCredential = {
        ...credential,
        accessToken: outcome.accessToken,
        refreshToken: outcome.refreshToken ?? credential.refreshToken,
        expiresAtMs: outcome.expiresInSec !== undefined && outcome.expiresInSec > 0
          ? Date.now() + outcome.expiresInSec * 1000
          : credential.expiresAtMs,
        ...(outcome.domain !== undefined && outcome.domain !== '' ? { domain: outcome.domain } : {}),
      }
      this.credential = refreshed
      this.lastScanAtMs = Date.now()
      log.info(`WorkBuddy token 已刷新(domain=${refreshed.domain})`)
      return refreshed
    } catch (error) {
      // 刷新失败:旧 token 还有余量就用旧的,否则向上抛
      if (credential.expiresAtMs > Date.now() + 30_000) {
        log.warn(`token 刷新失败,继续用旧 token: ${String(error)}`)
        return credential
      }
      throw new WorkBuddyAuthError('expired', `WorkBuddy token 刷新失败: ${String(error)}`)
    }
  }

  /** 当前凭据的状态快照(不含 token)。 */
  status() {
    if (this.credential === undefined) return { state: 'signed-out' as const }
    return {
      state: 'signed-in' as const,
      domain: this.credential.domain,
      nickname: this.credential.nickname,
      uin: this.credential.uin,
      expiresAtMs: this.credential.expiresAtMs,
      source: this.credential.source,
    }
  }
}
