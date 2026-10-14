/**
 * Gateway 装配:创建 store / client / pool / models 并接线。
 * 供 standalone server.ts 与 ST Server Plugin 入口共用。
 */
import { join } from 'node:path'
import { AccountStore } from './workbuddy/account-store.js'
import { AccountPool } from './workbuddy/account-pool.js'
import { WorkBuddyClient } from './workbuddy/client.js'
import { ModelManager } from './workbuddy/models.js'
import type { AppConfig } from './config/config.js'

export interface GatewayOptions {
  config: AppConfig
  /** 账号文件路径(plugin 模式指向 ST data 目录;standalone 用项目内 data/)。 */
  accountsFile: string
}

export interface Gateway {
  store: AccountStore
  client: WorkBuddyClient
  pool: AccountPool
  models: ModelManager
}

export function createGateway(options: GatewayOptions): Gateway {
  const store = new AccountStore({ filePath: options.accountsFile })
  const client = new WorkBuddyClient()
  const pool = new AccountPool({ store, client })
  const models = new ModelManager({
    client,
    defaultModels: options.config.defaultModels,
    cacheTtlMs: options.config.modelCacheTtlMs,
  })
  return { store, client, pool, models }
}

/** standalone 模式的默认账号文件位置:<项目>/data/accounts.json。 */
export function standaloneAccountsFile(): string {
  return join(process.cwd(), 'data', 'accounts.json')
}
