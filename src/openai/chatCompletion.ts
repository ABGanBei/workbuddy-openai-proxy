/**
 * OpenAI /v1/chat/completions 接口实现(账号池版)。
 *
 * 职责:
 *   1. 校验 OpenAI 请求(messages 非空、model 存在、字段类型);
 *   2. 把请求映射为 WorkBuddy 上游请求体:
 *      - 强制 stream:true(上游拒绝非流式);
 *      - developer 角色 → system(上游拒绝 developer);
 *      - 首条消息必须是 system(国际版网关硬性要求);
 *      - tool_choice 拍平成字符串;
 *   3. 通过账号池调用上游(主账号优先,额度不足/限流/token失效自动换号);
 *   4. 流式:透传上游 SSE(帧修复 + [DONE] 兜底);
 *      非流式:收集完整回复后合成 OpenAI 完整对象;
 *   5. 错误统一格式化为 OpenAI 错误形状:
 *      { error: { message, type, code } }
 *
 * 本模块不依赖 express:响应直接写 Node http.ServerResponse,
 * 因此可以同时被 standalone server.ts 与 ST Server Plugin 使用。
 */
import type { Readable } from 'node:stream'
import type { ServerResponse } from 'node:http'
import { AccountPool } from '../workbuddy/account-pool.js'
import type { StoredAccount } from '../workbuddy/account-store.js'
import type { WorkBuddyClient } from '../workbuddy/client.js'
import type { ModelManager } from '../workbuddy/models.js'
import type { AppConfig } from '../config/config.js'
import { createLogger } from '../utils/logger.js'
import { buildChatCompletion, pipeUpstreamSse } from './stream.js'

const log = createLogger('chat')

export interface ChatCompletionDeps {
  pool: AccountPool
  client: WorkBuddyClient
  models: ModelManager
  config: AppConfig
}

interface OpenAIErrorBody {
  error: { message: string; type: string; code: string | null }
}

/** OpenAI 错误响应。 */
export function openAiError(
  status: number,
  message: string,
  type: string,
  code: string | null = null,
): { status: number; body: OpenAIErrorBody } {
  return { status, body: { error: { message, type, code } } }
}

/** 校验并规范化请求体。 */
function validateBody(body: unknown):
  | { ok: true; model: string; stream: boolean; bodyObj: Record<string, unknown> }
  | { ok: false; error: { status: number; body: OpenAIErrorBody } } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: openAiError(400, '请求体必须是 JSON 对象', 'invalid_request_error') }
  }
  const obj = body as Record<string, unknown>
  const model = obj['model']
  if (typeof model !== 'string' || model.trim() === '') {
    return { ok: false, error: openAiError(400, '缺少 model 字段', 'invalid_request_error') }
  }
  const messages = obj['messages']
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: openAiError(400, 'messages 必须是非空数组', 'invalid_request_error') }
  }
  for (const message of messages) {
    if (typeof message !== 'object' || message === null || Array.isArray(message)) {
      return { ok: false, error: openAiError(400, 'messages 中存在非法条目', 'invalid_request_error') }
    }
    const role = (message as Record<string, unknown>)['role']
    if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'developer') {
      return { ok: false, error: openAiError(400, `不支持的 message 角色: ${String(role)}`, 'invalid_request_error') }
    }
    const content = (message as Record<string, unknown>)['content']
    if (typeof content !== 'string' && !Array.isArray(content)) {
      return { ok: false, error: openAiError(400, 'message content 必须是字符串或数组', 'invalid_request_error') }
    }
  }
  if (obj['temperature'] !== undefined
      && (typeof obj['temperature'] !== 'number' || !Number.isFinite(obj['temperature'] as number))) {
    return { ok: false, error: openAiError(400, 'temperature 必须是数字', 'invalid_request_error') }
  }
  if (obj['max_tokens'] !== undefined
      && (typeof obj['max_tokens'] !== 'number' || !Number.isInteger(obj['max_tokens']) || (obj['max_tokens'] as number) <= 0)) {
    return { ok: false, error: openAiError(400, 'max_tokens 必须是正整数', 'invalid_request_error') }
  }
  const stream = obj['stream'] === true
  return { ok: true, model: model.trim(), stream, bodyObj: obj }
}

/** 上游失败分类 → OpenAI 错误映射(与参考项目 KIND_STATUS 对齐)。 */
function errorForUpstreamKind(kind: string, status: number, message: string): { status: number; body: OpenAIErrorBody } {
  switch (kind) {
    case 'hard_credit':
      return openAiError(402, `WorkBuddy 积分不足: ${message}`, 'insufficient_quota', 'insufficient_quota')
    case 'soft_rate':
    case 'model_busy':
      return openAiError(429, `WorkBuddy 限流: ${message}`, 'rate_limit_error', 'rate_limit_exceeded')
    case 'session_dead':
      return openAiError(401, 'WorkBuddy 登录已失效,请在管理页重新登录', 'authentication_error', 'invalid_api_key')
    case 'policy_reject':
      return openAiError(403, `WorkBuddy 内容策略拒绝: ${message}`, 'invalid_request_error', 'policy_reject')
    case 'not_found':
      return openAiError(404, '模型不存在或不可用', 'invalid_request_error', 'model_not_found')
    case 'server':
      return openAiError(502, `WorkBuddy 上游错误: ${message}`, 'api_error', 'upstream_error')
    default:
      return openAiError(400, `WorkBuddy 请求被拒绝: ${message}`, 'invalid_request_error', 'upstream_rejected')
  }
}

/**
 * 把 OpenAI 请求体映射为 WorkBuddy 上游请求体(JSON 字符串)。
 * 规则来自 dsh-connect-workbuddy 实测:
 *   - 强制 stream:true;
 *   - developer → system;
 *   - 首条必须是 system(缺则补 fallback);
 *   - tool_choice 拍平成字符串。
 */
export function prepareChatBody(source: Record<string, unknown>, fallbackSystemPrompt: string): string {
  const obj: Record<string, unknown> = JSON.parse(JSON.stringify(source)) as Record<string, unknown>
  obj['stream'] = true
  if (Array.isArray(obj['messages'])) {
    for (const value of obj['messages']) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
      const message = value as Record<string, unknown>
      if (message['role'] === 'developer') message['role'] = 'system'
    }
  }
  ensureSystemHead(obj, fallbackSystemPrompt)
  normalizeToolChoice(obj)
  return JSON.stringify(obj)
}

/** 保证对话以 system 消息开头。 */
function ensureSystemHead(obj: Record<string, unknown>, fallback: string): void {
  const messages = obj['messages']
  if (!Array.isArray(messages) || messages.length === 0) return
  const head = messages[0]
  if (typeof head !== 'object' || head === null || Array.isArray(head)) return
  const role = (head as Record<string, unknown>)['role']
  if (typeof role === 'string' && role.trim().toLowerCase() === 'system') return
  messages.unshift({ role: 'system', content: fallback })
}

/** OpenAI tool_choice 拼写 → 上游字符串形式。 */
function normalizeToolChoice(obj: Record<string, unknown>): void {
  const present = 'tool_choice' in obj
  if (!present) return
  const choice: unknown = obj['tool_choice']
  if (typeof choice === 'string') {
    if (choice.trim().toLowerCase() === 'none') {
      delete obj['tool_choice']
      delete obj['tools']
      delete obj['functions']
    }
    return
  }
  if (typeof choice === 'object' && choice !== null && !Array.isArray(choice)) {
    const wrapped = choice as Record<string, unknown>
    const type = typeof wrapped['type'] === 'string' ? wrapped['type'].trim().toLowerCase() : ''
    if (type === 'none') {
      delete obj['tool_choice']
      delete obj['tools']
      delete obj['functions']
    } else if (type === 'auto' || type === 'required') {
      obj['tool_choice'] = type
    } else if (type === 'function') {
      const fn = typeof wrapped['function'] === 'object' && wrapped['function'] !== null
        ? (wrapped['function'] as Record<string, unknown>)
        : undefined
      let name = typeof fn?.['name'] === 'string' ? fn['name'] : ''
      if (name === '' && typeof wrapped['name'] === 'string') name = wrapped['name']
      name = name.trim()
      obj['tool_choice'] = name !== '' ? name : 'auto'
    } else {
      delete obj['tool_choice']
    }
    return
  }
  delete obj['tool_choice']
}

/** 写出一个 JSON 响应(Node http 层面)。 */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * 处理一次聊天请求(reqBody 为已解析的 JSON,res 直接写响应)。
 */
export async function handleChatCompletion(
  reqBody: unknown,
  res: ServerResponse,
  deps: ChatCompletionDeps,
): Promise<void> {
  const { pool, client, models, config } = deps

  // 1. 校验请求体
  const validated = validateBody(reqBody)
  if (!validated.ok) {
    sendJson(res, validated.error.status, validated.error.body)
    return
  }
  const { model, stream, bodyObj } = validated

  // 2. 校验模型存在(目录/账号不可用时放行,让上游做最终裁决)
  try {
    const primary = await pool.resolvePrimary()
    const exists = await models.hasModel(model, AccountPool.toCredential(primary))
    if (!exists) {
      const err = openAiError(404, `模型 '${model}' 不存在或当前不可用。可用模型见 GET /v1/models。`, 'invalid_request_error', 'model_not_found')
      sendJson(res, err.status, err.body)
      return
    }
  } catch (error) {
    log.warn(`模型校验跳过(目录或账号不可用): ${String(error)}`)
  }

  // 3. 映射请求体
  const fallbackSystemPrompt = 'You are a helpful assistant.'
  const upstreamBody = prepareChatBody(bodyObj, fallbackSystemPrompt)

  // 4. 账号池执行(含自动换号);单账号尝试内有首字节超时
  const poolResult = await pool.run(async (account: StoredAccount) => {
    const credential = AccountPool.toCredential(account)
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(new Error(`首字节超时(${config.timeoutMs}ms)`)),
      config.timeoutMs,
    )
    try {
      const result = await client.chatStream(credential, upstreamBody, controller.signal)
      if (result.ok) return { ok: true as const, value: result.response }
      return { ok: false as const, kind: result.kind, status: result.status, message: result.message }
    } finally {
      clearTimeout(timer)
    }
  })

  if (!poolResult.ok) {
    const mapped = errorForUpstreamKind(poolResult.kind, poolResult.status, poolResult.message)
    sendJson(res, mapped.status, mapped.body)
    return
  }
  if (poolResult.failover) {
    log.info('本次请求由备用账号接管')
  }

  // 5. 输出响应
  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    const onFrame = (frame: string): void => {
      if (!res.writableEnded) res.write(frame)
    }
    try {
      await pipeUpstreamSse(poolResult.value.body as unknown as Readable, onFrame, { logger: log })
    } finally {
      if (!res.writableEnded) res.end()
    }
    return
  }

  // 非流式:上游只支持流式,代理收集完整回复后合成 OpenAI 对象。
  const summary = await pipeUpstreamSse(
    poolResult.value.body as unknown as Readable,
    () => { /* 非流式不需要逐帧输出 */ },
    { collectText: true, logger: log },
  )
  sendJson(res, 200, JSON.parse(buildChatCompletion(model, summary.text, summary.finishReason || 'stop')) as unknown)
}
