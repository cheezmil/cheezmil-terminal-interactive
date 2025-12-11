<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Terminal as WebTerminal } from 'vue-web-terminal'
import { terminalApi } from '../services/api-service'

const terminalRef = ref<any>(null)

// Backend terminal list and state / 后端终端列表与状态
const terminals = ref<any[]>([])
const activeTerminalId = ref<string | null>(null)
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)

const pushOutput = (content: string) => {
  if (terminalRef.value?.pushMessage) {
    terminalRef.value.pushMessage({ type: 'ansi', content })
  }
}

// Load backend terminals and first terminal output / 加载后端终端列表并显示第一个终端的输出
const loadBackendTerminalsAndOutput = async () => {
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
      terminalRef.value?.clearLog?.(true)
      pushOutput(`=== TERMINAL TEST PAGE ===\r\nNo backend terminals found.\r\nPlease create a terminal via CTI tool.\r\n当前没有后端终端，请通过 CTI 工具创建一个终端。`)
      errorMessage.value = 'No backend terminals. Please create one via CTI tool.'
      return
    }

    activeTerminalId.value = terminals.value[0].id
    await loadOutputForTerminal(activeTerminalId.value)
  } catch (error) {
    console.error('Failed to load backend terminals in test view:', error)
    errorMessage.value = 'Failed to load backend terminals.'
    terminalRef.value?.clearLog?.(true)
    pushOutput(`Error: failed to load backend terminals.\r\n错误：无法加载后端终端列表。`)
  } finally {
    isLoading.value = false
  }
}

// Load output for a specific terminal / 加载指定终端的输出
const loadOutputForTerminal = async (terminalId: string) => {
  if (!terminalId) return

  try {
    const response = await terminalApi.readOutput(terminalId, {
      mode: 'tail',
      tailLines: 80
    })
    if (!response.ok) {
      const text = await response.text()
      console.error(`Failed to read output for ${terminalId}:`, text)
      pushOutput(`Failed to read output for terminal ${terminalId}.\r\n无法读取终端 ${terminalId} 的输出。`)
      return
    }

    const data = await response.json() as { output?: string }
    const output = data.output ?? ''

    terminalRef.value?.clearLog?.(true)
    pushOutput(
      `=== TERMINAL TEST PAGE (backend: ${terminalId}) ===\r\nBelow is real terminal output from backend.\r\n下方是来自后端的真实终端输出：\r\n\r\n${output || '[No output yet] / [当前暂无任何输出]'}`
    )
  } catch (error) {
    console.error('Failed to load output in test view:', error)
    terminalRef.value?.clearLog?.(true)
    pushOutput('Error: failed to load terminal output.\r\n错误：无法加载终端输出。')
  }
}

const handleExecCommand = async (_key: string, command: string, success: (msg?: any) => void, failed: (msg: string) => void) => {
  if (!activeTerminalId.value) {
    failed('No active terminal')
    return
  }
  try {
    const response = await terminalApi.writeInput(activeTerminalId.value, command, true)
    if (!response.ok) {
      throw new Error(`Failed to send input (${response.status})`)
    }
    success({ type: 'cmdLine', content: command })
    await loadOutputForTerminal(activeTerminalId.value)
  } catch (error: any) {
    console.error('Failed to send input in test view:', error)
    failed(error?.message || 'Failed to send input')
  }
}

onMounted(async () => {
  await loadBackendTerminalsAndOutput()
})
</script>

<template>
  <div class="terminal-test-page">
    <div class="terminal-test-header">
      <h1>Terminal Test View / 终端测试页面</h1>
      <p>Debug backend terminal output with vue-web-terminal / 使用 vue-web-terminal 调试后端终端输出</p>
      <p v-if="isLoading">Loading backend terminals... / 正在加载后端终端...</p>
      <p v-else-if="activeTerminalId">Active terminal: {{ activeTerminalId }} / 当前终端：{{ activeTerminalId }}</p>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </div>
    <WebTerminal
      ref="terminalRef"
      name="terminal-test"
      :context="activeTerminalId || '~'"
      context-suffix="$"
      :show-header="false"
      :enable-help-box="false"
      :line-space="2"
      theme="dark"
      class="terminal-test-container"
      :log-size-limit="800"
      @exec-cmd="(key, command, success, failed) => handleExecCommand(key, command, success, failed)"
    />
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
</style>
