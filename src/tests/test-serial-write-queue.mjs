// 串行写入队列测试（不依赖浏览器/xterm）/
// Serial write queue test (no browser/xterm dependency)
//
// 目的 / Purpose:
// - 复现“历史分块写入 + 实时输出同时到达”时的潜在交错
//   Reproduce the potential interleaving when "history chunk writes" and "live outputs" arrive concurrently
// - 确保队列能保证顺序：history 全部写完后再写 prompt
//   Ensure the queue preserves order: write prompt only after history finishes

import { createSerialWriteQueue } from '../../frontend/src/lib/serial-write-queue.mjs'

/**
 * @param {number} ms
 */
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function testPromptAfterHistory() {
  const queue = createSerialWriteQueue()
  /** @type {string[]} */
  const events = []

  const history = queue.enqueue(async () => {
    for (let i = 0; i < 3; i++) {
      await delay(15)
      events.push(`H${i}`)
    }
  })

  // 模拟“历史写入进行中”时收到提示符 / Simulate prompt arriving while history is still writing
  await delay(5)
  const prompt = queue.enqueue(async () => {
    events.push('P')
  })

  await Promise.all([history, prompt])

  const expected = ['H0', 'H1', 'H2', 'P']
  if (events.join(',') !== expected.join(',')) {
    throw new Error(`unexpected order: got=${events.join(',')} expected=${expected.join(',')}`)
  }
}

async function testMultipleWritesOrder() {
  const queue = createSerialWriteQueue()
  /** @type {string[]} */
  const events = []

  const tasks = []
  for (let i = 0; i < 5; i++) {
    tasks.push(
      queue.enqueue(async () => {
        await delay(5)
        events.push(String(i))
      })
    )
  }
  await Promise.all(tasks)

  const expected = ['0', '1', '2', '3', '4']
  if (events.join(',') !== expected.join(',')) {
    throw new Error(`unexpected order: got=${events.join(',')} expected=${expected.join(',')}`)
  }
}

async function main() {
  await testPromptAfterHistory()
  await testMultipleWritesOrder()
  // 输出只需要英文 / English-only output
  console.log('OK: serial write queue order preserved')
}

main().catch((err) => {
  console.error('FAILED:', err && (err.stack || err.message || String(err)))
  process.exit(1)
})

