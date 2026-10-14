/**
 * Mock ST plugin-loader 端到端测试。
 *
 * 模拟 ST 的 plugin-loader 行为:
 *   - import 插件模块,拿到 info/init/exit;
 *   - 用真实 express 创建 Router,调用 init(router);
 *   - 把 router 挂到 /api/plugins/workbuddy-gateway;
 *   - 用 fetch 打路由,验证:
 *     1. GET /api/plugins/workbuddy-gateway/healthz → ok
 *     2. GET /api/plugins/workbuddy-gateway/v1/models → 401(无账号,预期)
 *     3. GET /api/plugins/workbuddy-gateway/api/accounts → 空列表
 *     4. GET /api/plugins/workbuddy-gateway/ui → HTML 管理页
 *     5. POST /v1/chat/completions → 401(无账号)
 *     6. 契约:info.id === 'workbuddy-gateway',init/exit 是函数
 */
import { createRequire } from 'node:module'
import express from 'express'
import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const plugin = require('../dist/plugin/workbuddy-gateway.cjs') as {
  info: { id: string; name: string; description: string }
  init: (router: unknown) => Promise<void>
  exit: () => Promise<void>
}

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed += 1
    console.log(`  ✅ ${name}`)
  } else {
    failed += 1
    console.log(`  ❌ ${name} ${detail}`)
  }
}

// 数据目录隔离到临时目录,不污染真实数据
const dataRoot = mkdtempSync(join(tmpdir(), 'wbg-e2e-'))
process.env['WORKBUDDY_GATEWAY_DATA'] = dataRoot

// 1. 契约检查
console.log('== 1. 插件契约 ==')
check('info.id 正确', plugin.info.id === 'workbuddy-gateway')
check('init 是函数', typeof plugin.init === 'function')
check('exit 是函数', typeof plugin.exit === 'function')

// 2. 模拟 ST 挂载
console.log('== 2. router 挂载与路由 ==')
const app = express()
app.use(express.json({ limit: '64mb' }))
const router = express.Router()
await plugin.init(router)
app.use('/api/plugins/workbuddy-gateway', router)

const server = createServer(app)
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const port = (server.address() as { port: number }).port
const base = `http://127.0.0.1:${port}/api/plugins/workbuddy-gateway`

try {
  // healthz
  const health = await fetch(`${base}/healthz`)
  const healthBody = await health.json() as { ok: boolean }
  check('GET /healthz 返回 200 + ok', health.status === 200 && healthBody.ok === true)

  // /v1/models:无账号应 401(这是预期行为)
  const models = await fetch(`${base}/v1/models`)
  check('GET /v1/models 无账号时 401', models.status === 401, `实际 ${models.status}`)

  // /api/accounts:空列表
  const accountsRes = await fetch(`${base}/api/accounts`)
  const accountsBody = await accountsRes.json() as { maxAccounts: number; accounts: unknown[] }
  check('GET /api/accounts 空列表 + maxAccounts=5', accountsRes.status === 200
    && accountsBody.maxAccounts === 5
    && Array.isArray(accountsBody.accounts)
    && accountsBody.accounts.length === 0)

  // /ui:HTML 管理页
  const ui = await fetch(`${base}/ui`)
  const uiText = await ui.text()
  check('GET /ui 返回管理页 HTML', ui.status === 200
    && uiText.includes('WorkBuddy Gateway')
    && uiText.includes('添加账号'))

  // chat completions:无账号 401(账号池返回 session_dead → 401)
  const chat = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'glm-5.3', messages: [{ role: 'user', content: 'hi' }] }),
  })
  check('POST /v1/chat/completions 无账号 401(OpenAI 错误格式)', chat.status === 401, `实际 ${chat.status}`)
  const chatBody = await chat.json() as { error?: { message?: string } }
  check('错误体是 OpenAI 格式 {error:{...}}', typeof chatBody.error?.message === 'string')

  // OAuth 发起:mock 网络不可达,但路由应正常响应(502 + error)
  const login = await fetch(`${base}/api/accounts/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ region: 'cn' }),
  })
  // 网络在真实机器上可能可达(会真的向上游申请 state,拿到 200)。
  // 两种都算"路由存在":200(拿到 state)或 502(网络/上游失败)。
  check('POST /api/accounts/login 路由可达(200 或 502)', login.status === 200 || login.status === 502, `实际 ${login.status}`)
} finally {
  await plugin.exit()
  await new Promise<void>(resolve => server.close(() => resolve()))
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
if (failed > 0) process.exitCode = 1
