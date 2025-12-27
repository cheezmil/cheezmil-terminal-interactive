/**
 * 串行写入队列（用于 xterm.write / xterm.writeln 这种异步写入 API）
 * Serial write queue (for async xterm.write / xterm.writeln APIs)
 *
 * 目标 / Goal:
 * - 避免“历史分块写入”与“实时 WS 输出”交错，导致提示符 (PS ...>) 出现在中间
 *   Prevent interleaving between historical chunk writes and live WS outputs, which can place prompt (PS ...>) in the middle
 *
 * 设计原则 / Design:
 * - 同一 terminalId 的所有写入都必须串行化
 *   All writes for the same terminalId must be serialized
 * - 写入函数可以返回 Promise；队列保证顺序执行
 *   Writer can return a Promise; queue guarantees execution order
 */
/**
 * @returns {{ enqueue: (task: () => (void|Promise<void>)) => Promise<void> }}
 */
export function createSerialWriteQueue(): {
    enqueue: (task: () => (void | Promise<void>)) => Promise<void>;
};
//# sourceMappingURL=serial-write-queue.d.mts.map