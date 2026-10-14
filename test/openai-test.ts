/**
 * OpenAI API 测试脚本:models 接口、普通聊天、streaming 聊天。
 *
 * 用法:
 *   npm run test                          # 三项全测
 *   npm run test -- --only models        # 只测模型列表
 *   npm run test -- --only chat          # 只测普通聊天
 *   npm run test -- --only stream        # 只测流式聊天
 *
 * 环境变量:
 *   BASE_URL  代理地址(默认 http://127.0.0.1:3000/v1)
 *   MODEL     模型 id(默认取 /v1/models 返回的第一个)
 */
const BASE_URL = process.env['BASE_URL'] ?? 'http://127.0.0.1:3000/v1'

type Only = 'models' | 'chat' | 'stream'
const onlyArg = process.argv.indexOf('--only')
const only: Only | undefined = onlyArg !== -1 ? process.argv[onlyArg + 1] as Only : undefined

let passed = 0
let failed = 0

function report(name: string, ok: boolean, detail: string): void {
  if (ok) {
    passed += 1
    console.log(`  ✅ ${name}`)
  } else {
    failed += 1
    console.log(`  ❌ ${name}: ${detail}`)
  }
}

async function fetchModels(): Promise<{ id: string }[]> {
  const res = await fetch(`${BASE_URL}/models`)
  if (!res.ok) throw new Error(`GET /v1/models 返回 ${res.status}: ${await res.text()}`)
  const body = await res.json() as { object: string; data: { id: string; object: string }[] }
  if (body.object !== 'list' || !Array.isArray(body.data)) {
    throw new Error(`GET /v1/models 格式不对: ${JSON.stringify(body).slice(0, 200)}`)
  }
  return body.data
}

async function testModels(): Promise<string> {
  console.log('\n== 1. GET /v1/models ==')
  const data = await fetchModels()
  const ok = data.length > 0 && data.every(model => model.object === 'model' && model.id !== '')
  report('模型列表非空且格式正确', ok, JSON.stringify(data).slice(0, 200))
  console.log(`  模型(${data.length}): ${data.map(model => model.id).join(', ')}`)
  if (!ok) throw new Error('模型列表测试失败')
  return data[0]!.id
}

async function testChat(model: string): Promise<void> {
  console.log('\n== 2. POST /v1/chat/completions (非流式) ==')
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: '用一句话介绍你自己。' },
      ],
      stream: false,
    }),
  })
  if (!res.ok) {
    report('非流式聊天', false, `${res.status}: ${await res.text()}`)
    return
  }
  const body = await res.json() as {
    object: string
    choices: { message: { role: string; content: string }; finish_reason: string }[]
  }
  const choice = body.choices?.[0]
  const ok = body.object === 'chat.completion'
    && choice !== undefined
    && choice.message?.role === 'assistant'
    && typeof choice.message?.content === 'string'
    && choice.message.content !== ''
  report('非流式聊天返回完整 OpenAI 对象', ok, JSON.stringify(body).slice(0, 200))
  if (ok) console.log(`  回复: ${choice!.message.content.slice(0, 120)}`)
}

async function testStream(model: string): Promise<void> {
  console.log('\n== 3. POST /v1/chat/completions (stream=true) ==')
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: '数 1 到 5。' },
      ],
      stream: true,
    }),
  })
  if (!res.ok) {
    report('流式聊天', false, `${res.status}: ${await res.text()}`)
    return
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    report('流式聊天 Content-Type', false, `实际是 ${contentType}`)
    return
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let chunks = 0
  let totalText = ''
  let sawDone = false
  let sawFinish = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline: number
    while ((newline = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, newline + 2)
      buffer = buffer.slice(newline + 2)
      for (const line of frame.split('\n')) {
        const trimmed = line.trimEnd()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice('data:'.length).trim()
        if (payload === '[DONE]') {
          sawDone = true
          break
        }
        try {
          const chunk = JSON.parse(payload) as {
            choices?: { delta?: { content?: string }; finish_reason?: string }[]
          }
          const choice = chunk.choices?.[0]
          if (choice?.delta?.content) {
            totalText += choice.delta.content
            chunks += 1
          }
          if (choice?.finish_reason) sawFinish = true
        } catch {
          report('流式帧 JSON 可解析', false, payload.slice(0, 120))
        }
      }
    }
  }

  report('收到 [DONE] 结束帧', sawDone, '流里没有 data: [DONE]')
  report('收到 finish_reason', sawFinish, '流里没有 finish_reason')
  report(`收到 ${chunks} 个内容帧,累计 ${totalText.length} 字符`, chunks > 0 && totalText.length > 0, '没有内容帧')
  console.log(`  流式回复: ${totalText.slice(0, 120)}`)
}

async function main(): Promise<void> {
  console.log(`测试目标: ${BASE_URL}`)
  try {
    let model: string | undefined
    if (only === 'models') {
      await testModels()
    } else {
      model = process.env['MODEL'] ?? await (async () => {
        const data = await fetchModels()
        return data[0]!.id
      })()
      if (only !== 'chat' && only !== 'stream') await testModels()
      if (only === undefined || only === 'chat') await testChat(model)
      if (only === undefined || only === 'stream') await testStream(model)
    }
  } catch (error) {
    console.error(`测试中断: ${error instanceof Error ? error.message : String(error)}`)
    failed += 1
  }
  console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
  if (failed > 0) process.exitCode = 1
}

await main()
