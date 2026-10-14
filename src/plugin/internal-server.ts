/**
 * 内部回环服务(插件自建的 HTTP 端点)。
 *
 * 为什么需要它:
 *   SillyTavern 对挂在 /api/plugins/{id}/ 下的路由**同样施加 CSRF 保护**
 *   (所有 POST 都要 X-CSRF-Token,而该 token 只有浏览器端能拿到)。
 *   酒馆调用「自定义 OpenAI 端点」时是**服务器端 fetch**,不带任何 CSRF
 *   token,因此走 ST 路由的 POST /v1/chat/completions 必然 403。
 *
 * 所以插件启动时另开一个**只监听 127.0.0.1** 的端口,提供真正的
 * OpenAI 兼容端点(无 CSRF 中间件);酒馆在 API 设置里填这个地址即可。
 * 管理页面仍走 ST 路由(浏览器可拿 CSRF token)。
 *
 * 安全性:仅回环监听 + 端口随机/可配,非本机进程无法访问;
 * 与 dsh-connect-workbuddy 的 loopback shim 同一思路。
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Gateway } from '../gateway.js'
import type { AppConfig } from '../config/config.js'
import { AccountPool } from '../workbuddy/account-pool.js'
import { handleChatCompletion } from '../openai/chatCompletion.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('internal-server')

export interface InternalServerHandle {
  /** 实际监听端口。 */
  port: number
  /** 给酒馆填的 OpenAI Base URL。 */
  baseUrl: string
  close: () => Promise<void>
}

/** 默认内部端口;被占用时自动向后找。 */
export const DEFAULT_INTERNAL_PORT = 8001
const PORT_SCAN_RANGE = 12

/** 读取并解析 JSON 请求体。 */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * 在回环地址上启动内部 OpenAI 端点。
 * @param preferredPort 首选端口(环境变量 WORKBUDDY_GATEWAY_PORT 可覆盖)
 */
export async function startInternalServer(options: {
  gateway: Gateway
  config: AppConfig
  preferredPort?: number
}): Promise<InternalServerHandle> {
  const { gateway, config } = options
  const startPort = options.preferredPort ?? DEFAULT_INTERNAL_PORT

  const server: Server = createServer((req, res) => {
    void handle(req, res)
  })

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // 宽松 CORS:方便用户从其它本地客户端(Open WebUI 等)直接调用
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname.replace(/\/+$/, '') || '/'

    try {
      // GET /healthz
      if (req.method === 'GET' && path === '/healthz') {
        sendJson(res, 200, {
          ok: true,
          service: 'workbuddy-gateway',
          accounts: gateway.store.summaries(),
        })
        return
      }

      // GET /v1/models
      if (req.method === 'GET' && path === '/v1/models') {
        let primary
        try {
          primary = await gateway.pool.resolvePrimary()
        } catch (error) {
          // 没有可用账号:与主路由一致,回 401 而不是 500
          sendJson(res, 401, {
            error: {
              message: error instanceof Error ? error.message : String(error),
              type: 'authentication_error',
              code: 'workbuddy_auth_failed',
            },
          })
          return
        }
        const list = await gateway.models.list(AccountPool.toCredential(primary))
        sendJson(res, 200, {
          object: 'list',
          data: list.map(model => ({
            id: model.id,
            object: 'model',
            created: 0,
            owned_by: 'workbuddy',
            ...(model.contextWindow > 0 ? { context_window: model.contextWindow } : {}),
            ...(model.maxTokens > 0 ? { max_output_tokens: model.maxTokens } : {}),
          })),
        })
        return
      }

      // POST /v1/chat/completions
      if (req.method === 'POST' && path === '/v1/chat/completions') {
        const body = await readJsonBody(req)
        await handleChatCompletion(body, res, {
          pool: gateway.pool,
          client: gateway.client,
          models: gateway.models,
          config,
        })
        return
      }

      sendJson(res, 404, { error: { message: `Not Found: ${req.method} ${path}`, type: 'invalid_request_error' } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`内部端点处理失败 ${req.method} ${path}: ${message}`)
      sendJson(res, 500, { error: { message: `内部错误: ${message}`, type: 'api_error', code: null } })
    }
  }

  // 依次尝试端口,直到成功
  let boundPort = 0
  let lastError: unknown
  for (let offset = 0; offset < PORT_SCAN_RANGE; offset += 1) {
    const candidate = startPort + offset
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          server.removeListener('listening', onListening)
          reject(error)
        }
        const onListening = (): void => {
          server.removeListener('error', onError)
          resolve()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(candidate, '127.0.0.1')
      })
      boundPort = candidate
      break
    } catch (error) {
      lastError = error
      log.warn(`端口 ${candidate} 不可用,尝试下一个`)
    }
  }

  if (boundPort === 0) {
    throw new Error(`无法在 ${startPort}~${startPort + PORT_SCAN_RANGE - 1} 找到空闲端口: ${String(lastError)}`)
  }

  const baseUrl = `http://127.0.0.1:${boundPort}/v1`
  log.info(`内部 OpenAI 端点已启动: ${baseUrl}(仅本机回环)`)

  return {
    port: boundPort,
    baseUrl,
    close: () => new Promise<void>(resolve => {
      server.close(() => resolve())
    }),
  }
}
