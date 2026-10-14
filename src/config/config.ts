/**
 * 配置加载与解析。
 *
 * 所有配置均可通过环境变量 / .env 文件覆盖,并提供默认值。
 * 不在任何业务代码里硬编码端口、超时、模型名。
 */
import 'dotenv/config'

export interface AppConfig {
  /** 代理监听端口 */
  port: number
  /** 代理监听地址(默认仅回环) */
  host: string
  /** 显式指定的 WorkBuddy access token(可选,优先级高于读取登录文件) */
  workbuddyToken: string
  /** 显式 token 所属的登录域(可选) */
  workbuddyDomain: string
  /** 兜底模型 id 列表:上游模型目录拉取失败时使用 */
  defaultModels: string[]
  /** 等待上游开始响应(响应头)的超时,毫秒 */
  timeoutMs: number
  /** 自动重试前的等待,毫秒 */
  retryDelayMs: number
  /** 模型目录缓存时间,毫秒 */
  modelCacheTtlMs: number
  /** 手动指定的 WorkBuddy 凭据文件路径(可选) */
  workbuddyAuthFile: string
  /** 手动指定的 WorkBuddy 桌面 App 可执行文件(可选) */
  workbuddyAppExecutable: string
  /** 日志级别 */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

/** 从环境变量读取一个正整数,非法时返回默认值。 */
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** 从环境变量读取一个非空字符串,否则返回默认值。 */
function strEnv(name: string, fallback = ''): string {
  const raw = process.env[name]
  return raw === undefined ? fallback : raw.trim()
}

export function loadConfig(): AppConfig {
  const defaultModels = strEnv('DEFAULT_MODEL', 'workbuddy-model')
    .split(',')
    .map(value => value.trim())
    .filter(value => value !== '')
  const logLevel = strEnv('LOG_LEVEL', 'info') as AppConfig['logLevel']

  return {
    port: intEnv('PORT', 3000),
    host: strEnv('HOST', '127.0.0.1'),
    workbuddyToken: strEnv('WORKBUDDY_TOKEN'),
    workbuddyDomain: strEnv('WORKBUDDY_DOMAIN'),
    defaultModels: defaultModels.length > 0 ? defaultModels : ['workbuddy-model'],
    timeoutMs: intEnv('TIMEOUT', 120_000),
    retryDelayMs: intEnv('RETRY_DELAY_MS', 1000),
    modelCacheTtlMs: intEnv('MODEL_CACHE_TTL_MS', 600_000),
    workbuddyAuthFile: strEnv('WORKBUDDY_AUTH_FILE'),
    workbuddyAppExecutable: strEnv('WORKBUDDY_APP_EXECUTABLE'),
    logLevel,
  }
}
