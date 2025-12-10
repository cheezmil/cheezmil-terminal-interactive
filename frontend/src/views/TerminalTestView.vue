<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'

// Simple test terminal view / 简单测试终端视图

const containerRef = ref<HTMLDivElement | null>(null)
let term: Terminal | null = null
let fitAddon: FitAddon | null = null

onMounted(() => {
  const el = containerRef.value
  if (!el) return

  // Initialize xterm with minimal config / 使用最小配置初始化 xterm
  term = new Terminal({
    cursorBlink: true,
    fontFamily: 'Consolas, \"Courier New\", \"Microsoft YaHei\", monospace',
    fontSize: 14,
    convertEol: true,
    scrollback: 1000
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)

  term.open(el)
  fitAddon.fit()

  // Write visible test lines / 写入可见测试内容
  term.writeln('=== TERMINAL TEST PAGE ===')
  term.writeln('Line 1: DOM renderer visible text')
  term.writeln('Line 2: 中文测试 - 终端渲染是否正常？')
  term.writeln('Line 3: 1234567890 !@#$%^&*()')
  term.write('$ ')
})

onBeforeUnmount(() => {
  if (term) {
    term.dispose()
    term = null
  }
  fitAddon = null
})
</script>

<template>
  <div class="terminal-test-page">
    <div class="terminal-test-header">
      <h1>Terminal Test View / 终端测试页面</h1>
      <p>Minimal xterm configuration for debugging rendering issues / 用于调试渲染问题的最小 xterm 配置</p>
    </div>
    <div ref="containerRef" class="terminal-test-container" id="terminal-test-main" />
  </div>
</template>

<style scoped>
.terminal-test-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #111827;
  color: #e5e7eb;
}

.terminal-test-header {
  padding: 12px 16px;
  border-bottom: 1px solid #374151;
}

.terminal-test-header h1 {
  font-size: 18px;
  margin-bottom: 4px;
}

.terminal-test-header p {
  font-size: 13px;
  opacity: 0.8;
}

.terminal-test-container {
  flex: 1;
  background: #000000;
}

/* Ensure xterm text is visible / 确保 xterm 文本可见 */
:deep(.xterm) {
  font-family: "Consolas", "Courier New", "Microsoft YaHei", monospace !important;
  font-size: 14px !important;
  line-height: 1.2 !important;
  letter-spacing: 0 !important;
  color: #ffffff !important;
}

:deep(.xterm-viewport),
:deep(.xterm-screen) {
  background: #000000 !important;
}

:deep(.xterm-rows > div) {
  visibility: visible !important;
  opacity: 1 !important;
}
</style>

