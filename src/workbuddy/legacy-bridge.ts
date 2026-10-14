/**
 * 旧凭据桥接:把 standalone 时代的登录方式自动并入账号池。
 *
 * 优先级(有则取其一,都放进池子作为普通账号):
 *   1. WORKBUDDY_TOKEN 环境变量(显式 token,无刷新);
 *   2. 本机 WorkBuddy 桌面 App 登录文件(含加密凭据解密)。
 *
 * 这样老用户升级后无需重新 OAuth 登录;新用户(尤其 Termux 无桌面 App)
 * 直接走 OAuth 流程。
 */
import { AccountStore } from './account-store.js'
import { WorkBuddyAuth } from './auth.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('legacy-bridge')

/**
 * 把旧凭据写入账号池(幂等:已存在同 uid+domain 则跳过)。
 * 失败静默记日志——OAuth 始终可用,旧凭据只是便利入口。
 */
export async function seedLegacyAccounts(store: AccountStore, explicitFile?: string): Promise<void> {
  try {
    const auth = new WorkBuddyAuth({ explicitFile })
    const credential = await auth.scan()
    if (credential === undefined) {
      log.info('未发现旧凭据(WORKBUDDY_TOKEN / 桌面登录),跳过桥接')
      return
    }
    await store.add({
      domain: credential.domain,
      uid: credential.uid,
      ...(credential.nickname === undefined ? {} : { nickname: credential.nickname }),
      ...(credential.uin === undefined ? {} : { uin: credential.uin }),
      ...(credential.enterpriseId === undefined ? {} : { enterpriseId: credential.enterpriseId }),
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      expiresAtMs: credential.expiresAtMs,
      ...(credential.refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs: credential.refreshExpiresAtMs }),
    })
    log.info(`旧凭据已并入账号池: ${credential.nickname ?? credential.uin ?? credential.domain}`)
  } catch (error) {
    log.warn(`旧凭据桥接失败(可忽略,改用 OAuth 登录): ${String(error)}`)
  }
}
