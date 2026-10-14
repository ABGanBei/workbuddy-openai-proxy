/**
 * SillyTavern Server Plugin 入口(workbuddy-gateway)。
 *
 * ST 的 plugin-loader 会调用本模块导出的:
 *   - info: { id, name, description }
 *   - init(router): Express Router,注册在 /api/plugins/workbuddy-gateway/*
 *   - exit():清理钩子
 *
 * 部署形态:单文件 bundle(dist/plugin/workbuddy-gateway.cjs,CommonJS),
 * 放在 <SillyTavern>/plugins/ 下即可。express 不打包(用 ST 自带的)。
 * config.yaml 需 enableServerPlugins: true。
 *
 * ## 两个端点,分工不同(重要)
 *
 * ST 对挂在 /api/plugins/{id}/ 下的路由**同样施加 CSRF 保护**:所有 POST
 * 都必须带 X-CSRF-Token,而该 token 只有浏览器能拿到。酒馆调用「自定义
 * OpenAI 端点」时是**服务器端 fetch**,因此走 ST 路由的聊天请求必然 403。
 *
 * 所以本插件启动两个端点:
 *   1. **内部回环端点**(默认 127.0.0.1:8001/v1)——真正的 OpenAI 兼容
 *      接口,无 CSRF,给酒馆后端调用。用户把它填进酒馆的 API 设置。
 *   2. **ST 路由**(/api/plugins/workbuddy-gateway/*)——管理页与账号 API,
 *      由浏览器访问(前端自动带 CSRF token)。
 *
 * 数据目录:<SillyTavern>/data/workbuddy-gateway/。凭据只存这里。
 */
import type { Router } from 'express'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { loadConfig } from '../config/config.js'
import { setLogLevel } from '../utils/logger.js'
import { createGateway } from '../gateway.js'
import { registerGatewayRoutes } from '../openai/routes.js'
import { renderUiPage } from '../openai/ui.js'
import { startInternalServer, DEFAULT_INTERNAL_PORT, type InternalServerHandle } from './internal-server.js'

/** 内部端点句柄(exit 时关闭;重复 init 时复用)。 */
let internalServer: InternalServerHandle | undefined

/**
 * 向上查找 SillyTavern 根目录(config.yaml 或 server.js 所在的目录)。
 *
 * 插件可能被部署为:
 *   - <ST>/plugins/workbuddy-gateway.cjs(单文件)
 *   - <ST>/plugins/<repo>/dist/plugin/workbuddy-gateway.cjs(git clone 后未移动)
 * 无论哪种,向上逐级找 config.yaml 即可定位 ST 根。
 */
function findStRoot(startDir: string): string | undefined {
  let dir = startDir
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, 'config.yaml')) || existsSync(join(dir, 'server.js'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * ST plugin-loader 的 init 契约:init(router) => Promise。
 * router 上的路由自动挂到 /api/plugins/workbuddy-gateway/*。
 */
export async function init(router: Router): Promise<void> {
  // 1. 数据目录:<SillyTavern>/data/workbuddy-gateway
  //    优先级:环境变量 WORKBUDDY_GATEWAY_DATA > 向上查找 ST 根 > __dirname 兜底
  const stRoot = findStRoot(dirname(__filename))
  const dataRoot = process.env['WORKBUDDY_GATEWAY_DATA']
    ?? (stRoot !== undefined ? join(stRoot, 'data', 'workbuddy-gateway') : join(dirname(__filename), 'data'))

  const config = loadConfig()
  setLogLevel(config.logLevel)

  // 2. 装配(账号文件在 data 目录)
  const gateway = createGateway({
    config,
    accountsFile: join(dataRoot, 'accounts.json'),
  })

  // 3. 启动内部回环端点(给酒馆后端调用的无 CSRF OpenAI 接口)
  //    端口:WORKBUDDY_GATEWAY_PORT 环境变量 > 默认 8001(被占用时自动向后找)
  if (internalServer === undefined) {
    const envPort = Number.parseInt(process.env['WORKBUDDY_GATEWAY_PORT'] ?? '', 10)
    internalServer = await startInternalServer({
      gateway,
      config,
      preferredPort: Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_INTERNAL_PORT,
    })
  }

  // 4. 注册管理路由(浏览器访问,前端自带 CSRF token)
  registerGatewayRoutes(router, {
    pool: gateway.pool,
    client: gateway.client,
    store: gateway.store,
    models: gateway.models,
    config,
    uiPage: () => renderUiPage('/api/plugins/workbuddy-gateway'),
    internalBaseUrl: internalServer.baseUrl,
  })

  // 5. 旧凭据桥接(异步,不阻塞 init):桌面登录文件 → 账号池
  void import('../workbuddy/legacy-bridge.js').then(({ seedLegacyAccounts }) =>
    seedLegacyAccounts(gateway.store, config.workbuddyAuthFile || undefined),
  )

  // 6. 日志:把该填什么讲清楚
  /* eslint-disable no-console */
  console.log('[workbuddy-gateway] ready — mounted at /api/plugins/workbuddy-gateway')
  console.log('[workbuddy-gateway] 管理页: http://127.0.0.1:8000/api/plugins/workbuddy-gateway/ui')
  console.log(`[workbuddy-gateway] >>> 酒馆 API 设置里填这个 Base URL: ${internalServer.baseUrl}`)
  console.log('[workbuddy-gateway]     (Chat Completion → Custom (OpenAI-compatible) → Custom Endpoint)')
  /* eslint-enable no-console */
}

/** 清理钩子(ST 关闭时调用)。 */
export async function exit(): Promise<void> {
  if (internalServer !== undefined) {
    await internalServer.close()
    internalServer = undefined
  }
  // eslint-disable-next-line no-console
  console.log('[workbuddy-gateway] exit')
}

export const info = {
  id: 'workbuddy-gateway',
  name: 'WorkBuddy Gateway',
  description: '把 WorkBuddy 账号接入 SillyTavern 的 OpenAI 兼容网关:多账号管理、OAuth 登录、账号池自动切换。',
} as const
