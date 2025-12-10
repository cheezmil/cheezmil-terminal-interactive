<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { terminalApi } from '../services/api-service'

// Test terminal view that connects to backend / 连接后端真实终端输出的测试视图

const containerRef = ref<HTMLDivElement | null>(null)
let term: Terminal | null = null
let fitAddon: FitAddon | null = null

// Backend terminal list and state / 后端终端列表与状态
const terminals = ref<any[]>([])
const activeTerminalId = ref<string | null>(null)
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)

// Initialize xterm instance / 初始化 xterm 实例
const initTerminal = (el: HTMLDivElement) => {
  // Use similar font settings as main view / 使用与主界面相近的字体设置
  term = new Terminal({
    cursorBlink: true,
    fontFamily: 'JetBrains Mono, Consolas, "Courier New", "Microsoft YaHei", monospace',
    fontSize: 14,
    lineHeight: 1.2,
    letterSpacing: 0,
    convertEol: true,
    scrollback: 1000,
    theme: {
      background: '#000000',
      foreground: '#ffffff'
    }
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)

  term.open(el)
  fitAddon.fit()
}

// Load backend terminals and first terminal output / 加载后端终端列表并显示第一个终端的输出
const loadBackendTerminalsAndOutput = async () => {
  if (!term) return

  isLoading.value = true
  errorMessage.value = null

  try {
    const response = await terminalApi.list()
    if (!response.ok) {
      throw new Error(`Failed to list terminals: ${response.status}`)
    }

    const data = await response.json() as { terminals?: any[] }
    terminals.value = (data.terminals as any[]) || []

    if (!terminals.value.length) {
      // No backend terminals available / 当前没有任何后端终端
      term.clear()
      term.writeln('=== TERMINAL TEST PAGE ===')
      term.writeln('No backend terminals found.')
      term.writeln('Please create a terminal via CTI tool.')
      term.writeln('当前没有后端终端，请通过 CTI 工具创建一个终端。')
      errorMessage.value = 'No backend terminals. Please create one via CTI tool.'
      return
    }

    // Pick the first terminal for testing / 选取第一个终端进行测试
    activeTerminalId.value = terminals.value[0].id
    await loadOutputForTerminal(activeTerminalId.value)
  } catch (error) {
    console.error('Failed to load backend terminals in test view:', error)
    errorMessage.value = 'Failed to load backend terminals.'
    if (term) {
      term.writeln('')
      term.writeln('Error: failed to load backend terminals.')
      term.writeln('错误：无法加载后端终端列表。')
    }
  } finally {
    isLoading.value = false
  }
}

// Load output for a specific terminal / 加载指定终端的输出
const loadOutputForTerminal = async (terminalId: string) => {
  if (!term || !terminalId) return

  try {
    const response = await terminalApi.readOutput(terminalId, {
      mode: 'tail',
      tailLines: 80
    })
    if (!response.ok) {
      const text = await response.text()
      console.error(`Failed to read output for ${terminalId}:`, text)
      term.writeln('')
      term.writeln(`Failed to read output for terminal ${terminalId}.`)
      term.writeln(`无法读取终端 ${terminalId} 的输出。`)
      return
    }

    const data = await response.json() as { output?: string }
    const output = data.output ?? ''

    term.clear()
    term.writeln(`=== TERMINAL TEST PAGE (backend: ${terminalId}) ===`)
    term.writeln('Below is real terminal output from backend.')
    term.writeln('下方是来自后端的真实终端输出：')
    term.writeln('')

    if (output && output.length > 0) {
      term.write(output)
    } else {
      term.writeln('[No output yet] / [当前暂无任何输出]')
    }

    term.refresh(0, term.rows - 1)
  } catch (error) {
    console.error('Failed to load output in test view:', error)
    term.writeln('')
    term.writeln('Error: failed to load terminal output.')
    term.writeln('错误：无法加载终端输出。')
  }
}

onMounted(async () => {
  const el = containerRef.value
  if (!el) return

  initTerminal(el)

  // Load backend terminals and their latest output / 加载后端终端及其最新输出
  await loadBackendTerminalsAndOutput()
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
      <p>Debug real backend terminal output with minimal xterm setup / 使用最小 xterm 配置调试真实后端终端输出</p>
      <p v-if="isLoading">Loading backend terminals... / 正在加载后端终端...</p>
      <p v-else-if="activeTerminalId">Active terminal: {{ activeTerminalId }} / 当前终端：{{ activeTerminalId }}</p>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
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

.error-text {
  color: #f87171;
  font-size: 13px;
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
