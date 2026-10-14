/**
 * API 入口(standalone 模式):独立运行 HTTP 服务。
 *
 * 注意:面向 SillyTavern 的首选部署是 Server Plugin(plugins/ 下单文件),
 * 但保留 standalone 便于调试与其它客户端使用。
 *
 * 路由(见 openai/routes.ts):
 *   GET  /healthz            健康检查
 *   GET  /v1/models          模型列表(OpenAI 格式)
 *   POST /v1/chat/completions 聊天补全(SSE)
 *   /api/accounts*           账号管理(OAuth 登录、主账号、测试、删除)
 *   GET  /ui                 内嵌管理页
 */
import express from 'express'
import cors from 'cors'
import { loadConfig } from './config/config.js'
import { setLogLevel, createLogger } from './utils/logger.js'
import { createGateway, standaloneAccountsFile } from './gateway.js'
import { registerGatewayRoutes } from './openai/routes.js'
import { renderUiPage } from './openai/ui.js'

const config = loadConfig()
setLogLevel(config.logLevel)
const log = createLogger('server')

// 组装依赖(账号文件在项目 data/ 目录)
const gateway = createGateway({
  config,
  accountsFile: standaloneAccountsFile(),
})

// 旧凭据桥接(异步,不阻塞启动):WORKBUDDY_TOKEN / 桌面登录 → 账号池
void import('./workbuddy/legacy-bridge.js').then(({ seedLegacyAccounts }) =>
  seedLegacyAccounts(gateway.store, config.workbuddyAuthFile || undefined),
)

const app = express()
// 允许所有来源:本地工具需要兼容 SillyTavern / Open WebUI 等浏览器前端
app.use(cors())
app.use(express.json({ limit: '64mb' }))

// 注册 gateway 全部路由
registerGatewayRoutes(app, {
  pool: gateway.pool,
  client: gateway.client,
  store: gateway.store,
  models: gateway.models,
  config,
  uiPage: () => renderUiPage('/'),
})

// JSON 解析错误 → OpenAI 格式(express.json 中间件抛出 entity.parse.failed)
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({
      error: {
        message: '请求体不是合法 JSON',
        type: 'invalid_request_error',
        code: 'invalid_json',
      },
    })
    return
  }
  next(err)
})

app.listen(config.port, config.host, () => {
  log.info(`workbuddy-openai-proxy 已启动: http://${config.host}:${config.port}`)
  log.info(`OpenAI Base URL: http://${config.host}:${config.port}/v1`)
  log.info(`管理页: http://${config.host}:${config.port}/ui`)
})
