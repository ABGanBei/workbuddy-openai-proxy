/**
 * 核心逻辑单元测试:账号存储 + 账号池 failover + OAuth 解析辅助。
 * 不触网。
 */
import { AccountStore } from '../src/workbuddy/account-store.js'
import { AccountPool, isFailoverWorthy } from '../src/workbuddy/account-pool.js'
import type { WorkBuddyClient } from '../src/workbuddy/client.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

function makeStore(): AccountStore {
  const dir = mkdtempSync(join(tmpdir(), 'wbg-unit-'))
  return new AccountStore({ filePath: join(dir, 'accounts.json') })
}

async function addAccount(store: AccountStore, uid: string, domain = 'www.codebuddy.cn'): Promise<string> {
  const account = await store.add({
    domain,
    uid,
    nickname: `user-${uid}`,
    accessToken: `token-${uid}`,
    refreshToken: `refresh-${uid}`,
    expiresAtMs: Date.now() + 3600_000,
  })
  return account.id
}

// ============ AccountStore ============
console.log('== 1. AccountStore ==')
{
  const store = makeStore()
  const id1 = await addAccount(store, 'u1')
  const id2 = await addAccount(store, 'u2')
  check('添加账号后 count=2', store.count === 2)
  check('第一个账号自动成为主账号', store.primary?.id === id1)

  await store.setPrimary(id2)
  check('setPrimary 生效', store.primary?.id === id2)
  check('summaries 不含 token', JSON.stringify(store.summaries()).includes('token-') === false)

  // 同 uid+domain 覆盖更新
  await store.add({
    domain: 'www.codebuddy.cn',
    uid: 'u1',
    nickname: 'user-u1-new',
    accessToken: 'token-u1-new',
    refreshToken: 'refresh-u1',
    expiresAtMs: Date.now() + 3600_000,
  })
  check('同账号重登覆盖不新增', store.count === 2)
  check('覆盖后 token 更新', store.get(id1)?.accessToken === 'token-u1-new')

  // 满员拒绝
  await addAccount(store, 'u3')
  await addAccount(store, 'u4')
  await addAccount(store, 'u5')
  check('达到 5 个上限', store.count === 5)
  let overflow = false
  try {
    await addAccount(store, 'u6')
  } catch {
    overflow = true
  }
  check('第 6 个账号被拒绝', overflow)

  // 删除后主账号回落
  await store.remove(id2)
  check('删除后 count-1', store.count === 4)
  check('删除主账号后回落第一个', store.primary?.id === store.all()[0]?.id)

  // 记录失败状态
  await store.recordUse(id1, { ok: false, status: { kind: 'rate_limited', atMs: Date.now(), untilMs: Date.now() + 1000 } })
  check('recordUse 写入 failCount=1', store.get(id1)?.failCount === 1)
}

// ============ AccountPool ============
console.log('== 2. AccountPool(failover 调度) ==')
{
  const store = makeStore()
  const idA = await addAccount(store, 'a')
  await addAccount(store, 'b')
  const pool = new AccountPool({ store, client: {} as WorkBuddyClient })

  check('isFailoverWorthy: hard_credit → true', isFailoverWorthy('hard_credit'))
  check('isFailoverWorthy: soft_rate → true', isFailoverWorthy('soft_rate'))
  check('isFailoverWorthy: session_dead → true', isFailoverWorthy('session_dead'))
  check('isFailoverWorthy: server → true', isFailoverWorthy('server'))
  check('isFailoverWorthy: client → false', !isFailoverWorthy('client'))
  check('isFailoverWorthy: model_busy → false', !isFailoverWorthy('model_busy'))
  check('isFailoverWorthy: policy_reject → false', !isFailoverWorthy('policy_reject'))

  // 主账号失败 → 自动切备用
  const calls: string[] = []
  const result = await pool.run(async account => {
    calls.push(account.uid)
    if (account.uid === 'a') {
      return { ok: false, kind: 'hard_credit', status: 402, message: '积分不足' }
    }
    return { ok: true, value: 'ok-from-b' }
  })
  check('主账号失败后自动切换备用', result.ok && result.value === 'ok-from-b')
  check('尝试顺序:先主后备', calls[0] === 'a' && calls[1] === 'b', calls.join(','))
  if (result.ok) check('failover 标记为 true', result.failover === true)
  check('失败账号已记录状态', store.get(idA)?.lastStatus?.kind === 'out_of_credits')

  // 非 failover 类别不换号
  const calls2: string[] = []
  const result2 = await pool.run(async account => {
    calls2.push(account.uid)
    return { ok: false, kind: 'client', status: 400, message: 'bad request' }
  })
  check('HTTP 400(client)不换号', !result2.ok && calls2.length === 1)

  // 全部失败 → 返回最后错误
  store.recordUse(store.all()[1]!.id, { ok: false })
  const result3 = await pool.run(async () => ({ ok: false, kind: 'server', status: 502, message: 'boom' }))
  check('全部失败返回最后错误', !result3.ok && result3.kind === 'server' && result3.attempts >= 1)
}

// ============ 空池 ============
console.log('== 3. 空池 ==')
{
  const store = makeStore()
  const pool = new AccountPool({ store, client: {} as WorkBuddyClient })
  const result = await pool.run(async () => ({ ok: true, value: 'never' }))
  check('空池直接返回失败(401)', !result.ok && result.status === 401 && result.attempts === 0)
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
if (failed > 0) process.exitCode = 1
