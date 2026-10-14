/**
 * 极简分级日志,不引入第三方依赖。
 * 级别:debug < info < warn < error,由 LOG_LEVEL 配置控制。
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

let currentLevel: LogLevel = 'info'

export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

function write(level: LogLevel, scope: string, message: string, extra?: unknown): void {
  if (ORDER[level] < ORDER[currentLevel]) return
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}`
  if (extra !== undefined) {
    // 只序列化一层,避免循环引用把进程搞挂
    let suffix: string
    try {
      suffix = typeof extra === 'string' ? extra : JSON.stringify(extra)
    } catch {
      suffix = String(extra)
    }
    // eslint-disable-next-line no-console
    console.log(`${line} ${suffix}`)
    return
  }
  // eslint-disable-next-line no-console
  console.log(line)
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, extra?: unknown) => write('debug', scope, message, extra),
    info: (message: string, extra?: unknown) => write('info', scope, message, extra),
    warn: (message: string, extra?: unknown) => write('warn', scope, message, extra),
    error: (message: string, extra?: unknown) => write('error', scope, message, extra),
  }
}

export type Logger = ReturnType<typeof createLogger>
