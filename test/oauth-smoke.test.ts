/**
 * OAuth 实机冒烟测试:只验证 oauthStart 能拿到真实 state(不登录、不入库)。
 * 运行:npx tsx test/oauth-smoke.test.ts
 */
import { oauthStart } from '../src/workbuddy/oauth.js'

const result = await oauthStart('cn')
if ('error' in result) {
  console.log('ERROR:', result.error)
  process.exit(1)
}
console.log('loginId:', result.loginId)
console.log('verificationUri 前 200 字符:', result.verificationUri.slice(0, 200))
console.log('expiresIn:', result.expiresIn)
console.log('✅ oauthStart 实机通过(拿到了真实 state)')
