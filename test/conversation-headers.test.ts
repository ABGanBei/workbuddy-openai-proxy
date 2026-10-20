/**
 * 渠道校验守卫:会话身份三件套(2026-10-16 上游新增闸)。
 *
 * 背景:上游对 chat 请求增加渠道校验,缺 X-Conversation-* 三件套会返回
 * 400 / 11128("Illegal API invocation from an unapproved channel")。
 * 且「首条必须是 system」这道旧闸**依然生效**——两道闸是叠加的,
 * 修好一边不能删另一边,所以这里同时守住 prepareChatBody 的角色归一化。
 *
 * 断言方式刻意做成**行为级**(mock fetch 捕获真实请求头),
 * 而不是 grep 源码字符串:文本断言在上游改文案/改实现时会给出虚假的安全感。
 */
import { WorkBuddyClient } from '../src/workbuddy/client.js'
import { prepareChatBody } from '../src/openai/chatCompletion.js'
import type { WorkBuddyCredential } from '../src/workbuddy/auth.js'

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

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** 一次被捕获的上游请求。 */
interface Captured {
  url: string
  headers: Record<string, string>
  body: string
}

const captured: Captured[] = []
const originalFetch = globalThis.fetch

/** 按 URL 返回一段最小可解析的响应。 */
function fakeFetch(url: string): Response {
  if (url.includes('/v2/chat/completions')) {
    return new Response('data: [DONE]\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  // 元数据端点统一回一个 code:0 的信封
  return new Response(JSON.stringify({ code: 0, msg: '', data: {} }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const headers: Record<string, string> = {}
  const raw = init?.headers
  if (raw !== undefined && !Array.isArray(raw) && !(raw instanceof Headers)) {
    for (const [key, value] of Object.entries(raw as Record<string, string>)) headers[key] = String(value)
  } else if (raw instanceof Headers) {
    raw.forEach((value, key) => { headers[key] = value })
  }
  captured.push({ url, headers, body: typeof init?.body === 'string' ? init.body : '' })
  return fakeFetch(url)
}) as unknown as typeof fetch

/** 构造一个凭据;domain 决定国内/国际路由。 */
function credentialOf(domain: string): WorkBuddyCredential {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAtMs: Date.now() + 3600_000,
    domain,
    uid: 'uid-1',
    source: 'env',
    filePath: '',
  }
}

const CONVERSATION_KEYS = [
  'X-Conversation-ID',
  'X-Conversation-Request-ID',
  'X-Conversation-Message-ID',
] as const

/** 取最近一次 chat 请求。 */
function lastChat(): Captured | undefined {
  return [...captured].reverse().find(item => item.url.includes('/v2/chat/completions'))
}

/** 取某个 URL 片段的最近一次请求。 */
function lastOf(fragment: string): Captured | undefined {
  return [...captured].reverse().find(item => item.url.includes(fragment))
}

const client = new WorkBuddyClient()

// ============ 1. chat 请求带三件套 ============
console.log('== 1. chat 请求必须带会话身份三件套 ==')
{
  captured.length = 0
  await client.chatStream(credentialOf('www.codebuddy.cn'), '{"model":"glm-5.3"}')
  const chat = lastChat()
  check('国内版 chat 请求含三个头', chat !== undefined
    && CONVERSATION_KEYS.every(key => typeof chat.headers[key] === 'string' && chat.headers[key] !== ''),
    JSON.stringify(chat?.headers ?? {}))

  if (chat !== undefined) {
    const values = CONVERSATION_KEYS.map(key => chat.headers[key]!)
    check('三个值互不相同', new Set(values).size === 3, values.join(','))
    check('三个值都是 UUID v4 形态', values.every(value => UUID_V4.test(value)), values.join(','))

    // 注意:body 的角色归一化不在 chatStream 里,而是 handleChatCompletion
    // 先调 prepareChatBody 再发 —— 那部分由第 4 节单独守卫。
    // 这里只确认 chatStream 把外部给的 body 原样送出(职责边界)。
    check('chatStream 原样透传 body(归一化在上层完成)',
      chat.body === '{"model":"glm-5.3"}', chat.body)
  }

  // 国际版同样要带(不能只在一侧发)
  captured.length = 0
  await client.chatStream(credentialOf('www.workbuddy.ai'), '{"model":"gpt-5.6"}')
  const globalChat = lastChat()
  check('国际版 chat 请求同样含三个头', globalChat !== undefined
    && CONVERSATION_KEYS.every(key => typeof globalChat.headers[key] === 'string'))
}

// ============ 2. 每请求新生成,不复用 ============
console.log('== 2. 三件套每请求新生成 ==')
{
  captured.length = 0
  await client.chatStream(credentialOf('www.codebuddy.cn'), '{"model":"glm-5.3"}')
  const first = lastChat()
  await client.chatStream(credentialOf('www.codebuddy.cn'), '{"model":"glm-5.3"}')
  const second = lastChat()

  if (first !== undefined && second !== undefined) {
    const firstValues = CONVERSATION_KEYS.map(key => first.headers[key])
    const secondValues = CONVERSATION_KEYS.map(key => second.headers[key])
    check('连续两次请求不共享任何会话 id',
      secondValues.every(value => !firstValues.includes(value)),
      `${firstValues.join(',')} vs ${secondValues.join(',')}`)
  } else {
    check('连续两次请求不共享任何会话 id', false, '未捕获到 chat 请求')
  }
}

// ============ 3. 三件套不得泄漏到 billing / 目录 / 刷新 ============
console.log('== 3. 三件套不泄漏到非 chat 端点 ==')
{
  captured.length = 0
  await client.fetchCheckinStatus(credentialOf('www.codebuddy.cn')).catch(() => undefined)
  const billing = lastOf('/v2/billing/meter/')
  check('billing 请求不带三件套', billing !== undefined
    && CONVERSATION_KEYS.every(key => billing.headers[key] === undefined),
    JSON.stringify(billing?.headers ?? {}))

  captured.length = 0
  await client.fetchModels(credentialOf('www.codebuddy.cn')).catch(() => undefined)
  const catalog = lastOf('/v3/config') ?? lastOf('/v2/enterprises/personal/models')
  check('模型目录请求不带三件套', catalog !== undefined
    && CONVERSATION_KEYS.every(key => catalog.headers[key] === undefined),
    JSON.stringify(catalog?.headers ?? {}))

  captured.length = 0
  await client.refreshToken(credentialOf('www.codebuddy.cn')).catch(() => undefined)
  const refresh = lastOf('/v2/plugin/auth/token/refresh')
  check('token 刷新请求不带三件套(走 X-Refresh-Token)', refresh !== undefined
    && CONVERSATION_KEYS.every(key => refresh.headers[key] === undefined)
    && refresh.headers['X-Refresh-Token'] === 'refresh-token',
    JSON.stringify(refresh?.headers ?? {}))
}

// ============ 4. 角色归一化(闸一,仍必要) ============
console.log('== 4. developer → system,首条必须是 system ==')
{
  const fallback = 'You are a helpful assistant.'

  const withDeveloper = JSON.parse(prepareChatBody({
    messages: [
      { role: 'developer', content: '你是助手' },
      { role: 'user', content: '你好' },
    ],
    stream: false,
  }, fallback)) as { stream: boolean; messages: { role: string; content: string }[] }
  check('developer 被归一化为 system', withDeveloper.messages[0]!.role === 'system')
  check('不重复补 system(已有首条 system)', withDeveloper.messages.length === 2)
  check('stream 被强制为 true', withDeveloper.stream === true)

  const userFirst = JSON.parse(prepareChatBody({
    messages: [{ role: 'user', content: '你好' }],
  }, fallback)) as { messages: { role: string; content: string }[] }
  check('首条不是 system 时补一条', userFirst.messages[0]!.role === 'system'
    && userFirst.messages[0]!.content === fallback)
  check('补位文案极短(不改变模型行为)', fallback.length <= 40, fallback)

  const alreadySystem = JSON.parse(prepareChatBody({
    messages: [
      { role: 'system', content: '角色设定' },
      { role: 'user', content: '你好' },
    ],
  }, fallback)) as { messages: { role: string; content: string }[] }
  check('已有 system 时不插入第二条', alreadySystem.messages.length === 2
    && alreadySystem.messages[0]!.content === '角色设定')
}

globalThis.fetch = originalFetch

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
if (failed > 0) process.exitCode = 1
