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
 * 数据目录:<SillyTavern>/data/workbuddy-gateway/(账号文件)。
 * 凭据只存这里,不进 ST 设置。
 */
import type { Router, Express } from 'express'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { loadConfig } from '../config/config.js'
import { setLogLevel } from '../utils/logger.js'
import { createGateway } from '../gateway.js'
import { registerGatewayRoutes } from '../openai/routes.js'
import { renderUiPage } from '../openai/ui.js'
import type { Express as ExpressApp } from 'express'

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

  // 3. 注册路由;Base URL 就是 ST 内自己的 /api/plugins/workbuddy-gateway
  registerGatewayRoutes(router, {
    pool: gateway.pool,
    client: gateway.client,
    store: gateway.store,
    models: gateway.models,
    config,
    uiPage: () => renderUiPage('/api/plugins/workbuddy-gateway'),
  })

  // 3.5 旧凭据桥接(异步,不阻塞 init):桌面登录文件 → 账号池
  void import('../workbuddy/legacy-bridge.js').then(({ seedLegacyAccounts }) =>
    seedLegacyAccounts(gateway.store, config.workbuddyAuthFile || undefined),
  )

  // 4. 日志
  // eslint-disable-next-line no-console
  console.log('[workbuddy-gateway] ready — mounted at /api/plugins/workbuddy-gateway')
  // eslint-disable-next-line no-console
  console.log('[workbuddy-gateway] Base URL for SillyTavern: http://127.0.0.1:8000/api/plugins/workbuddy-gateway/v1')
}

/** 清理钩子(ST 关闭时调用)。 */
export async function exit(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[workbuddy-gateway] exit')
}

export const info = {
  id: 'workbuddy-gateway',
  name: 'WorkBuddy Gateway',
  description: '把 WorkBuddy 账号接入 SillyTavern 的 OpenAI 兼容网关:多账号管理、OAuth 登录、账号池自动切换。',
} as const

/** 供 standalone/server.ts 复用的注册函数(express app 场景)。 */
export function registerGatewayOnApp(app: ExpressApp, dataRoot: string): void {
  const config = loadConfig()
  setLogLevel(config.logLevel)
  const gateway = createGateway({ config, accountsFile: join(dataRoot, 'accounts.json') })
  registerGatewayRoutes(app, {
    pool: gateway.pool,
    client: gateway.client,
    store: gateway.store,
    models: gateway.models,
    config,
    uiPage: () => renderUiPage('/'),
  })
}
