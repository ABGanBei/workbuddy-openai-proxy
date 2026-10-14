/**
 * WorkBuddy 桌面 App "at-rest" 加密凭据解密。
 *
 * 自 WorkBuddy 5.6.0 起,桌面 App 不再把 auth.accessToken / auth.refreshToken
 * 存成纯字符串,而是写成字段信封:
 *
 *   { "$wbEncrypted": 1, "envelope": "<base64 编码的 JSON 信封>" }
 *
 * 信封是 { suite, keyId, nonce, authTag, ciphertext } 的 AES-256-GCM
 * (12 字节 nonce、16 字节 tag)。AAD 是一段带长度前缀的转录,包含
 * scheme、suite、keyId 与 framing,保证密文只能按它被封印时的字段形状打开。
 *
 * 字段密钥不是用户秘密,而是编译进 App 自身 Electron 原生模块
 * (`electron_browser_workbuddy_storage`) 的构建期常量。App 通过
 * `loggerGet()` 取回载荷,对返回的 base64 **字符串**(不是解码后的字节)
 * 做 SHA-256 得到 32 字节密钥;keyId 即该密钥 SHA-256 的前 16 个 hex 字符。
 *
 * 本模块通过 ELECTRON_RUN_AS_NODE 启动已安装的 App 拿同一份载荷,
 * 推导出同一把密钥;密钥只缓存在进程内存,永不落盘、永不进日志。
 *
 * 算法与常量移植自 dsh-connect-workbuddy(MIT, (c) 2026 LaoDing)。
 */
import { execFile, execFileSync } from 'node:child_process'
import { createDecipheriv, createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join, win32 } from 'node:path'

/** 一个 {$wbEncrypted:1, envelope} 字段信封,本模块唯一会打开的形状。 */
export interface WorkBuddyEncryptedField {
  $wbEncrypted: 1
  envelope: string
}

/** Envelope framing 名称 → 单字节 AAD framing code。 */
const FRAMING_CODE: Readonly<Record<string, number>> = {
  file: 1,
  field: 2,
  record: 3,
  stream: 4,
}

/** 对称格式标识符,转录进 AAD。 */
const STANDARD_FORMAT_ID: Readonly<Record<string, string>> = {
  file: 'WBEF1',
  field: 'WBEV1',
  record: 'WBER1',
  stream: 'WBES1',
}

/** AAD 转录开头的域分隔符。 */
const AAD_DOMAIN = Buffer.from('WB-AAD\0', 'ascii')

/** 本模块打开的唯一 scheme。 */
const SYMMETRIC_SCHEME = 'sym-v1'

/** 指向 WorkBuddy 桌面可执行文件的环境变量名。 */
export const WORKBUDDY_APP_EXECUTABLE_ENV = 'WORKBUDDY_APP_EXECUTABLE'

/** App 回答密钥载荷的时限。 */
const KEY_FETCH_TIMEOUT_MS = 10_000

/** Windows 上 WorkBuddy 桌面可执行文件名。 */
const APP_EXECUTABLE_NAME = 'WorkBuddy.exe'

function encodeUint32(value: number): Buffer {
  const bytes = Buffer.allocUnsafe(4)
  bytes.writeUInt32BE(value)
  return bytes
}

/** 长度前缀 UTF-8 字符串:uint32 大端长度 + 字节。 */
function encodeLengthPrefixed(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  return Buffer.concat([encodeUint32(bytes.length), bytes])
}

/**
 * 单个 `sym-v1` FIELD-framed 信封的 AAD。
 * 只实现了 field framing:它是桌面 App 给凭据字段用的形状。
 */
function fieldAad(keyId: string, suite: number): Buffer {
  if (!/^[0-9a-f]{16}$/u.test(keyId)) throw new Error('workbuddy: envelope keyId is malformed')
  return Buffer.concat([
    AAD_DOMAIN,
    Buffer.from([1]),
    encodeLengthPrefixed(STANDARD_FORMAT_ID['field']!),
    encodeLengthPrefixed(SYMMETRIC_SCHEME),
    encodeUint32(suite),
    encodeLengthPrefixed(keyId),
    Buffer.from([FRAMING_CODE['field']!]),
    // 无 sequence 与 final 标记
    Buffer.from([0]),
    Buffer.from([0]),
  ])
}

/** 判断一个值是否为 App 的加密字段信封。 */
export function isEncryptedFieldWrapper(value: unknown): value is WorkBuddyEncryptedField {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const wrapper = value as Record<string, unknown>
  const keys = Object.keys(wrapper).sort()
  return keys.length === 2
    && keys[0] === '$wbEncrypted'
    && keys[1] === 'envelope'
    && wrapper['$wbEncrypted'] === 1
    && typeof wrapper['envelope'] === 'string'
}

/** 派生密钥的 keyId:密钥 SHA-256 的前 16 个 hex 字符。 */
export function deriveAtRestKeyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

/**
 * 从 App 的密钥载荷 JSON 派生 32 字节字段密钥。
 *
 * App 对载荷里的 base64 **字符串**做哈希——不是解码后的字节——
 * 所以这里必须用同样的拼写;对解码后的秘密做哈希会得到另一把密钥,
 * 所有字段都会打开失败。
 */
export function deriveAtRestKey(payloadJson: string): Buffer {
  let payload: unknown
  try {
    payload = JSON.parse(payloadJson)
  } catch {
    throw new Error('workbuddy: at-rest key payload is not valid JSON')
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('workbuddy: at-rest key payload is not an object')
  }
  const secret = (payload as Record<string, unknown>)['atRestSecretKey']
  if (typeof secret !== 'string' || secret === '') {
    throw new Error('workbuddy: at-rest key payload carries no atRestSecretKey')
  }
  return createHash('sha256').update(secret, 'utf8').digest()
}

/**
 * 用派生密钥打开一个加密字段,返回明文。
 * 信封损坏、属于别的密钥或 GCM tag 不匹配都会抛错,绝不降级成残缺 token。
 */
export function openEncryptedField(field: WorkBuddyEncryptedField, key: Buffer): string {
  let envelope: unknown
  try {
    envelope = JSON.parse(Buffer.from(field.envelope, 'base64').toString('utf8'))
  } catch {
    throw new Error('workbuddy: encrypted field envelope is not valid JSON')
  }
  if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) {
    throw new Error('workbuddy: encrypted field envelope is not an object')
  }
  const record = envelope as Record<string, unknown>
  const { suite, keyId, nonce, authTag, ciphertext } = record
  if (typeof suite !== 'number' || typeof keyId !== 'string') {
    throw new Error('workbuddy: encrypted field envelope is missing suite or keyId')
  }
  if (typeof nonce !== 'string' || typeof authTag !== 'string' || typeof ciphertext !== 'string') {
    throw new Error('workbuddy: encrypted field envelope is missing nonce, authTag or ciphertext')
  }
  const expectedKeyId = deriveAtRestKeyId(key)
  if (keyId !== expectedKeyId) {
    throw new Error(`workbuddy: encrypted field belongs to key ${keyId}, not the available key ${expectedKeyId}`)
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64'), { authTagLength: 16 })
  decipher.setAAD(fieldAad(keyId, suite))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

/**
 * 让已安装的桌面 App 交出它的密钥载荷:以 ELECTRON_RUN_AS_NODE
 * 方式把 App 自己的二进制当作纯 Node 运行,调用原生绑定。
 *
 * 子进程没有 stdin、有硬超时,只读它的 stdout。
 */
export function fetchAtRestKeyPayload(executable: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const source = "try{process.stdout.write(process._linkedBinding('electron_browser_workbuddy_storage').loggerGet())}"
      + 'catch(e){process.exitCode=3;process.stderr.write(String(e&&e.message||e))}'
    execFile(
      executable,
      ['-e', source],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        timeout: KEY_FETCH_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`workbuddy: the desktop app did not provide its at-rest key (${stderr.trim() || error.message})`))
          return
        }
        const payload = stdout.trim()
        if (payload === '') {
          reject(new Error('workbuddy: the desktop app returned an empty at-rest key payload'))
          return
        }
        resolve(payload)
      },
    )
  })
}

/**
 * Windows 注册表兜底:WorkBuddy.exe 不在默认目录时,
 * 通过卸载注册表项的 DisplayIcon / InstallLocation 定位。
 * 注册表值是安装器自己写的,比"猜目录"可靠。
 */
function queryRegistry(args: readonly string[]): string | undefined {
  try {
    return execFileSync('reg', [...args], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    }) as string
  } catch {
    // reg 对不存在的键返回非零 —— 没装 App 时的正常情况
    return undefined
  }
}

/** 去掉注册表值里的引号与 ",0" 图标索引,并校验文件名是 WorkBuddy.exe。 */
function normalizeRegistryExecutable(value: string): string | undefined {
  let unquoted = value.trim()
  if (unquoted === '') return undefined
  if (unquoted.startsWith('"')) {
    const closing = unquoted.indexOf('"', 1)
    if (closing === -1) return undefined
    unquoted = unquoted.slice(1, closing).trim()
  }
  const withoutIndex = unquoted.replace(/,\s*-?\d+\s*$/u, '')
  if (withoutIndex === '') return undefined
  if (win32.basename(withoutIndex).toLowerCase() !== APP_EXECUTABLE_NAME.toLowerCase()) return undefined
  return withoutIndex
}

function windowsRegistryAppExecutable(): string | undefined {
  const keys = [
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]
  for (const root of keys) {
    const listing = queryRegistry(['query', root, '/s', '/f', 'WorkBuddy', '/t', 'REG_SZ'])
    if (listing === undefined) continue
    for (const rawLine of listing.split(/\r?\n/u)) {
      const icon = /^\s*DisplayIcon\s+REG_SZ\s+(.*?)\s*$/u.exec(rawLine)
      if (icon !== null) {
        const executable = normalizeRegistryExecutable(icon[1]!)
        if (executable !== undefined && existsSync(executable)) return executable
      }
      const install = /^\s*InstallLocation\s+REG_SZ\s+(.*?)\s*$/u.exec(rawLine)
      if (install !== null) {
        let directory = install[1]!.trim()
        if (directory.startsWith('"')) {
          const closing = directory.indexOf('"', 1)
          if (closing !== -1) directory = directory.slice(1, closing).trim()
        }
        if (directory !== '') {
          const executable = win32.join(directory, APP_EXECUTABLE_NAME)
          if (existsSync(executable)) return executable
        }
      }
    }
  }
  return undefined
}

/**
 * 定位 WorkBuddy 桌面可执行文件,探测顺序:
 *   1. WORKBUDDY_APP_EXECUTABLE 环境变量;
 *   2. 默认安装目录(Windows);
 *   3. Windows 注册表(DisplayIcon / InstallLocation);
 *   4. macOS 常见 bundle 路径(WorkBuddy.app / WorkBuddy AI.app)。
 */
export function findWorkBuddyAppExecutable(): string | undefined {
  // 1) 环境变量显式指定
  const fromEnv = process.env[WORKBUDDY_APP_EXECUTABLE_ENV]?.trim()
  if (fromEnv !== undefined && fromEnv !== '' && existsSync(fromEnv)) return fromEnv
  // 2) 默认安装目录
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] ?? ''
    const programFiles = process.env['ProgramFiles'] ?? ''
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? ''
    const candidates = [
      localAppData !== '' ? join(localAppData, 'Programs', 'WorkBuddy', APP_EXECUTABLE_NAME) : '',
      localAppData !== '' ? join(localAppData, 'WorkBuddy', APP_EXECUTABLE_NAME) : '',
      programFiles !== '' ? join(programFiles, 'WorkBuddy', APP_EXECUTABLE_NAME) : '',
      programFilesX86 !== '' ? join(programFilesX86, 'WorkBuddy', APP_EXECUTABLE_NAME) : '',
    ]
    for (const candidate of candidates) {
      if (candidate !== '' && existsSync(candidate)) return candidate
    }
    // 3) 注册表兜底
    const fromRegistry = windowsRegistryAppExecutable()
    if (fromRegistry !== undefined) return fromRegistry
  }
  // 4) macOS bundle
  if (process.platform === 'darwin') {
    const home = process.env['HOME'] ?? ''
    const bundleNames = ['WorkBuddy.app', 'WorkBuddy AI.app']
    const roots = [
      ...(home !== '' ? [join(home, 'Applications')] : []),
      '/Applications',
    ]
    for (const root of roots) {
      for (const name of bundleNames) {
        const executable = join(root, name, 'Contents', 'MacOS', 'Electron')
        if (existsSync(executable)) return executable
      }
    }
  }
  return undefined
}

/** 进程生命周期内的密钥缓存;绝不落盘。 */
let cachedKey: Buffer | undefined
let inflightKey: Promise<Buffer | undefined> | undefined

/**
 * 桌面 App 的 at-rest 字段密钥;拿不到时返回 undefined
 * (App 未安装、旧版无原生模块、或未来构建轮换了载荷)。
 * 成功一次后缓存,整个进程最多 spawn App 一次;
 * 失败不缓存,下次调用会重试(用户可能刚装好 App)。
 */
export function readAtRestKey(): Promise<Buffer | undefined> {
  if (cachedKey !== undefined) return Promise.resolve(cachedKey)
  inflightKey ??= (async () => {
    const executable = findWorkBuddyAppExecutable()
    if (executable === undefined) return undefined
    const payload = await fetchAtRestKeyPayload(executable)
    const key = deriveAtRestKey(payload)
    cachedKey = key
    return key
  })().finally(() => {
    inflightKey = undefined
  })
  return inflightKey
}

/** 清空密钥缓存(诊断用)。 */
export function clearAtRestKeyCache(): void {
  cachedKey = undefined
  inflightKey = undefined
}
