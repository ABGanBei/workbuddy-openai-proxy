/**
 * 模型管理:上游目录拉取、TTL 缓存、兜底模型列表。
 *
 * - 目录优先从 WorkBuddy 上游拉取(/v3/config,CN 有回退),并缓存 TTL;
 * - 拉取失败时用配置的 DEFAULT_MODEL 兜底,保证 /v1/models 永不空;
 * - 模型 id 原样透传给上游(无前缀),这也是 dsh-connect-workbuddy 实测的线缆格式。
 */
import type { WorkBuddyClient, WorkBuddyUpstreamModel } from './client.js'
import type { WorkBuddyCredential } from './auth.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('models')

export interface ModelManagerOptions {
  client: WorkBuddyClient
  /** 兜底模型 id 列表(目录拉取失败时使用) */
  defaultModels: string[]
  /** 目录缓存 TTL,毫秒 */
  cacheTtlMs: number
}

export class ModelManager {
  private readonly client: WorkBuddyClient
  private readonly defaultModels: string[]
  private readonly cacheTtlMs: number
  private catalog: WorkBuddyUpstreamModel[] | undefined
  private catalogAtMs = 0
  private catalogInflight: Promise<WorkBuddyUpstreamModel[]> | undefined

  constructor(options: ModelManagerOptions) {
    this.client = options.client
    this.defaultModels = options.defaultModels
    this.cacheTtlMs = options.cacheTtlMs
  }

  /** 当前模型列表(尽量用缓存;缓存过期时单飞拉取;失败用兜底)。 */
  async list(credential: WorkBuddyCredential): Promise<WorkBuddyUpstreamModel[]> {
    if (this.catalog !== undefined && Date.now() - this.catalogAtMs < this.cacheTtlMs) {
      return this.catalog
    }
    this.catalogInflight ??= this.fetchCatalog(credential).finally(() => {
      this.catalogInflight = undefined
    })
    try {
      const catalog = await this.catalogInflight
      this.catalog = catalog
      this.catalogAtMs = Date.now()
      return catalog
    } catch (error) {
      log.warn(`模型目录拉取失败,使用兜底列表: ${String(error)}`)
      if (this.catalog !== undefined) return this.catalog // 过期缓存好过兜底
      return this.defaultModels.map(id => ({ id, name: id, contextWindow: 0, maxTokens: 0 }))
    }
  }

  private async fetchCatalog(credential: WorkBuddyCredential): Promise<WorkBuddyUpstreamModel[]> {
    const models = await this.client.fetchModels(credential)
    log.info(`模型目录已更新:${models.length} 个模型`)
    return models
  }

  /** 模型 id 是否在目录中。 */
  async hasModel(id: string, credential: WorkBuddyCredential): Promise<boolean> {
    const models = await this.list(credential)
    return models.some(model => model.id === id)
  }

  /** 清空缓存(诊断/测试用)。 */
  clear(): void {
    this.catalog = undefined
    this.catalogAtMs = 0
  }
}
