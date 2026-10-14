/**
 * Gateway 路由工厂:standalone 模式与 ST Server Plugin 共用。
 *
 * 由调用方提供 express app 与依赖,本模块注册:
 *   GET  /healthz                 健康检查
 *   GET  /v1/models               模型列表(OpenAI 格式)
 *   POST /v1/chat/completions     聊天补全(SSE)
 *   GET  /api/accounts            账号摘要列表(无 token)
 *   POST /api/accounts/login      发起 OAuth 登录(返回授权 URL + loginId)
 *   GET  /api/accounts/login/:id  轮询登录结果(完成后入库)
 *   DELETE /api/accounts/:id      删除账号
 *   POST /api/accounts/:id/primary 设主账号
 *   POST /api/accounts/:id/test   探测账号可用性(签到探测 + 积分)
 *   GET  /ui                      内嵌管理页(手机友好)
 *
 * 凭据只存服务端;前端永远接触不到 token。
 */
import type { Router, Request, Response } from 'express'
import type { AccountStore } from '../workbuddy/account-store.js'
import { MAX_ACCOUNTS } from '../workbuddy/account-store.js'
import { AccountPool } from '../workbuddy/account-pool.js'
import type { WorkBuddyClient, WorkBuddyRegion } from '../workbuddy/client.js'
import { regionOf } from '../workbuddy/client.js'
import type { ModelManager } from '../workbuddy/models.js'
import type { AppConfig } from '../config/config.js'
import { createLogger } from '../utils/logger.js'
import { oauthStart, oauthPoll } from '../workbuddy/oauth.js'
import { handleChatCompletion } from './chatCompletion.js'

const log = createLogger('routes')

export interface GatewayDeps {
  pool: AccountPool
  client: WorkBuddyClient
  store: AccountStore
  models: ModelManager
  config: AppConfig
  /** 管理页 HTML 生成函数(plugin 内嵌 /ui 页)。 */
  uiPage?: () => string
}

/** 请求体解析(express.json 可能没挂;容忍 string/object 两种)。 */
function readJsonBody(req: Request): unknown {
  const raw = (req as Request & { body?: unknown }).body
  if (raw !== undefined && typeof raw !== 'string') return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return undefined
    }
  }
  return {}
}

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: { message } })
}

/**
 * 组装路由。
 * target 是 express Router(standalone 下用 app 也行——app 实现了
 * get/post/delete 同签名;类型上统一按 Router 处理,调用方把 app 传进来即可)。
 */
export function registerGatewayRoutes(target: Router, deps: GatewayDeps): void {
  const { pool, client, store, models, config } = deps

  // GET /healthz
  target.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      service: 'workbuddy-openai-proxy',
      accounts: store.summaries(),
    })
  })

  // GET /v1/models
  target.get('/v1/models', async (_req, res) => {
    try {
      const primary = await pool.resolvePrimary()
      const list = await models.list(AccountPool.toCredential(primary))
      res.json({
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`模型列表失败: ${message}`)
      res.status(401).json({ error: { message, type: 'authentication_error', code: 'workbuddy_auth_failed' } })
    }
  })

  // POST /v1/chat/completions
  target.post('/v1/chat/completions', async (req, res) => {
    try {
      await handleChatCompletion(readJsonBody(req), res, { pool, client, models, config })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`聊天请求处理失败: ${message}`)
      if (!res.headersSent) {
        res.status(500).json({ error: { message: `内部错误: ${message}`, type: 'api_error', code: null } })
      } else {
        res.end()
      }
    }
  })

  // GET /api/accounts —— 账号摘要(无 token)
  target.get('/api/accounts', (_req, res) => {
    res.json({
      maxAccounts: MAX_ACCOUNTS,
      accounts: store.summaries(),
    })
  })

  // POST /api/accounts/login —— 发起 OAuth 登录
  target.post('/api/accounts/login', async (req, res) => {
    const body = readJsonBody(req) as Record<string, unknown>
    const regionRaw = typeof body['region'] === 'string' ? body['region'] : 'cn'
    const region: WorkBuddyRegion = regionRaw === 'global' ? 'global' : 'cn'
    const base = typeof body['base'] === 'string' && body['base'].trim() !== '' ? body['base'] : undefined
    const result = await oauthStart(region, { base })
    if ('error' in result) {
      sendError(res, 502, result.error)
      return
    }
    res.json(result)
  })

  // GET /api/accounts/login/:id —— 轮询登录结果,完成后自动入库
  target.get('/api/accounts/login/:id', async (req, res) => {
    const { id } = req.params as { id: string }
    const regionRaw = typeof req.query['region'] === 'string' ? req.query['region'] : 'cn'
    const region: WorkBuddyRegion = regionRaw === 'global' ? 'global' : 'cn'
    const result = await oauthPoll(id, region)
    if (!result.done) {
      res.json({ done: false })
      return
    }
    if ('error' in result) {
      sendError(res, 401, result.error)
      return
    }
    try {
      const account = await store.add({
        domain: result.account.domain,
        uid: result.account.uid,
        ...(result.account.nickname === undefined ? {} : { nickname: result.account.nickname }),
        ...(result.account.uin === undefined ? {} : { uin: result.account.uin }),
        ...(result.account.enterpriseId === undefined ? {} : { enterpriseId: result.account.enterpriseId }),
        accessToken: result.account.accessToken,
        refreshToken: result.account.refreshToken,
        expiresAtMs: result.account.expiresAtMs,
        ...(result.account.refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs: result.account.refreshExpiresAtMs }),
      })
      log.info(`账号已入库: ${account.nickname ?? account.uin ?? account.id} (${regionOf(account.domain)})`)
      res.json({ done: true, added: true, accounts: store.summaries() })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendError(res, 400, message)
    }
  })

  // DELETE /api/accounts/:id
  target.delete('/api/accounts/:id', async (req, res) => {
    try {
      await store.remove((req.params as { id: string }).id)
      res.json({ ok: true, accounts: store.summaries() })
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : String(error))
    }
  })

  // POST /api/accounts/:id/primary
  target.post('/api/accounts/:id/primary', async (req, res) => {
    try {
      await store.setPrimary((req.params as { id: string }).id)
      res.json({ ok: true, accounts: store.summaries() })
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : String(error))
    }
  })

  // POST /api/accounts/:id/test —— 可用性探测 + 积分(只读)
  target.post('/api/accounts/:id/test', async (req, res) => {
    const { id } = req.params as { id: string }
    try {
      const account = await pool.resolveById(id)
      const credential = AccountPool.toCredential(account)
      const checkin = await client.fetchCheckinStatus(credential)
      let credits: { total: number; expiringSoon: number } | undefined
      try {
        const creditInfo = await client.fetchCredits(credential)
        credits = { total: creditInfo.total, expiringSoon: creditInfo.expiringSoon }
      } catch (error) {
        log.warn(`账号 ${account.nickname ?? account.id} 积分查询失败: ${String(error)}`)
      }
      await store.recordUse(id, { ok: true })
      res.json({ ok: true, checkin, credits })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await store.recordUse(id, {
        ok: false,
        status: { kind: 'bad_credential', atMs: Date.now(), detail: message.slice(0, 200) },
      })
      sendError(res, 502, message)
    }
  })

  // GET /ui —— 内嵌管理页
  if (deps.uiPage !== undefined) {
    target.get('/ui', (_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(deps.uiPage!())
    })
  }
}
