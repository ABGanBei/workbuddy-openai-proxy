/**
 * SSE 流式输出工具。
 *
 * 上游 WorkBuddy 的聊天响应本身就是 OpenAI 兼容 SSE
 * (`data: {…}\n\n` 帧序列,以 `data: [DONE]\n\n` 结尾),
 * 但存在两种需要代理兜底的情况:
 *   1. 上游连接中断时半帧残缺 / 缺 [DONE] —— 代理修复帧边界并补 [DONE];
 *   2. 上游(未来)不支持流式 —— 代理拿到完整回复后按字符切片模拟流。
 *
 * 本模块不依赖任何第三方库,纯 Node stream。
 */
import type { Readable } from 'node:stream'
import type { Logger } from '../utils/logger.js'

/** OpenAI chat.completion.chunk 中的一条 choice delta。 */
export interface StreamDelta {
  content?: string
  role?: string
  [key: string]: unknown
}

/** 组装一个 OpenAI 兼容的流式 chunk。 */
export function buildStreamChunk(
  model: string,
  delta: StreamDelta,
  finishReason: string | null = null,
): string {
  const chunk = {
    id: `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta,
        ...(finishReason === null ? {} : { finish_reason: finishReason }),
      },
    ],
  }
  return `data: ${JSON.stringify(chunk)}\n\n`
}

/** 组装一个 OpenAI 兼容的非流式完整回复。 */
export function buildChatCompletion(
  model: string,
  content: string,
  finishReason: string,
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
): string {
  return JSON.stringify({
    id: `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: finishReason,
      },
    ],
    usage: usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  })
}

/** 解析一帧 SSE 的 data 载荷;无 data 行时返回 undefined。 */
function dataPayload(frame: string): string | undefined {
  for (const line of frame.split('\n')) {
    const trimmed = line.trimEnd()
    if (!trimmed.startsWith('data:')) continue
    return trimmed.slice('data:'.length).trim()
  }
  return undefined
}

/** 从 chunk JSON 中提取文本增量(choices[0].delta.content)。 */
function contentOf(payload: string): { content: string; finishReason: string } {
  try {
    const chunk = JSON.parse(payload) as Record<string, unknown>
    const choices = chunk['choices']
    const choice = Array.isArray(choices) ? choices[0] : undefined
    if (typeof choice !== 'object' || choice === null) return { content: '', finishReason: '' }
    const record = choice as Record<string, unknown>
    const delta = record['delta']
    const deltaRecord = typeof delta === 'object' && delta !== null ? delta as Record<string, unknown> : {}
    const content = typeof deltaRecord['content'] === 'string' ? deltaRecord['content'] : ''
    const finishReason = typeof record['finish_reason'] === 'string' ? record['finish_reason'] : ''
    return { content, finishReason }
  } catch {
    return { content: '', finishReason: '' }
  }
}

/**
 * 把上游 SSE 转发给下游,同时:
 *   - 修复跨 write 边界的半帧(按空行组装完整帧再发出);
 *   - 上游中断时补一个 `data: [DONE]` 帧;
 *   - 可选地收集所有文本增量(供非流式合成或模拟流使用)。
 *
 * 返回 { text, finishReason, sawDone } 汇总。
 */
export async function pipeUpstreamSse(
  source: Readable,
  onFrame: (frame: string) => void,
  options: { collectText?: boolean; logger?: Logger } = {},
): Promise<{ text: string; finishReason: string; sawDone: boolean }> {
  const { collectText = false, logger } = options
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let collected = ''
  let finishReason = ''
  let sawDone = false

  const dispatchFrame = (frame: string): void => {
    if (frame.trim() === '') return
    const payload = dataPayload(frame)
    if (payload === '[DONE]') {
      sawDone = true
      onFrame(frame.endsWith('\n\n') ? frame : `${frame}\n\n`)
      return
    }
    if (payload !== undefined && collectText) {
      const { content, finishReason: reason } = contentOf(payload)
      if (content !== '') collected += content
      if (reason !== '') finishReason = reason
    }
    onFrame(frame.endsWith('\n\n') ? frame : `${frame}\n\n`)
  }

  try {
    for await (const chunk of source) {
      buffer += decoder.decode(chunk as Uint8Array, { stream: true })
      // 按空行切出完整帧;最后一段(无空行结尾)留在 buffer
      let newline: number
      while ((newline = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, newline + 2)
        buffer = buffer.slice(newline + 2)
        dispatchFrame(frame)
      }
    }
    // 流正常结束:残留在 buffer 里的半帧也发出去
    if (buffer.trim() !== '') dispatchFrame(buffer)
  } catch (error) {
    logger?.warn(`上游流中断: ${String(error)}`)
  }
  if (!sawDone) {
    // 上游没给 [DONE]:代理补上,保证客户端正常收尾
    onFrame('data: [DONE]\n\n')
  }
  return { text: collected, finishReason, sawDone }
}

/**
 * 模拟流式:把完整回复按块切片,逐个以 OpenAI chunk 格式写出,
 * 最后补 finish_reason 帧与 [DONE]。
 * 用于上游不支持流式时的兜底(上游目前支持,保留以防协议变化)。
 */
export async function emitSimulatedStream(
  model: string,
  fullText: string,
  onFrame: (frame: string) => void,
  options: { chunkSize?: number; delayMs?: number } = {},
): Promise<void> {
  const { chunkSize = 4, delayMs = 0 } = options
  // 按字符切片,尽量避免切断多字节字符:用 Array.from 拆成码点
  const chars = Array.from(fullText)
  let index = 0
  // 首帧带 role,与 OpenAI 流式惯例一致
  onFrame(buildStreamChunk(model, { role: 'assistant', content: '' }))
  while (index < chars.length) {
    const slice = chars.slice(index, index + chunkSize).join('')
    index += chunkSize
    onFrame(buildStreamChunk(model, { content: slice }))
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  onFrame(buildStreamChunk(model, {}, 'stop'))
  onFrame('data: [DONE]\n\n')
}
