<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { initializeApiService, terminalApi } from '../services/api-service'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const terminalId = route.params.id as string
const terminal = ref<any>(null)
const isLoading = ref(true)
const isConnected = ref(false)
const isFullscreen = ref(false)

let ws: WebSocket | null = null
let term: Terminal | null = null
let fitAddon: FitAddon | null = null

// 计算属性
const connectionStatus = computed(() => ({
  text: isConnected.value ? t('terminal.connected') : t('terminal.disconnected'),
  severity: isConnected.value ? 'success' : 'danger',
  icon: isConnected.value ? 'pi-check-circle' : 'pi-times-circle'
}))

const calculateUptime = (created: string) => {
  const now = new Date()
  const createdDate = new Date(created)
  const diffMs = now.getTime() - createdDate.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d`
}

const terminalStats = computed(() => ({
  uptime: terminal.value ? calculateUptime(terminal.value.created) : '0m'
}))

// 初始化终端
const setupTerminal = () => {
  try {
    term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ffffff',
        selectionBackground: '#ffffff40'
      },
      convertEol: true,
      rows: 24,
      cols: 80
    })

    // 添加FitAddon
    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    // 获取容器并打开终端
    nextTick(() => {
      const container = document.getElementById('terminal-container')
      if (container && term) {
        term.open(container)
        fitAddon?.fit()

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
          fitAddon?.fit()
        })
      }
    })

    console.log('Terminal initialized successfully')
  } catch (error) {
    console.error('Failed to setup terminal:', error)
  }
}

// WebSocket连接 / WebSocket connection
const connectWebSocket = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // Connect to backend port 1106 with /ws endpoint, not frontend port 1107 / 连接到后端端口1106的/ws端点，而不是前端端口1107
  const wsUrl = `${protocol}//localhost:1106/ws`

  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log('WebSocket connected')
    isConnected.value = true
  }

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    handleWebSocketMessage(message)
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error)
    isConnected.value = false
  }

  ws.onclose = () => {
    console.log('WebSocket disconnected')
    isConnected.value = false
  }
}

// 处理WebSocket消息
const handleWebSocketMessage = (message: any) => {
  if (message.terminalId !== terminalId) return
  
  switch (message.type) {
    case 'output':
      if (term) {
        term.write(message.data)
      }
      break
    case 'exit':
      if (term) {
        term.write('\r\n\x1b[31m[Terminal Exited]\x1b[0m\r\n')
      }
      break
  }
}

// 获取终端信息 / Fetch terminal details
const fetchTerminalDetails = async () => {
  try {
    // Use dynamic API service / 使用动态API服务
    const response = await terminalApi.get(terminalId)
    if (!response.ok) {
      throw new Error(`Terminal not found (${response.status})`)
    }
    const data = await response.json()
    terminal.value = data
  } catch (error) {
    console.error('Failed to fetch terminal details:', error)
  } finally {
    isLoading.value = false
  }
}

// 加载终端历史输出
// 加载终端历史输出 / Load terminal historical output
let currentCursor = 0
const loadTerminalOutput = async () => {
  try {
    console.log('Loading terminal output for:', terminalId)
    // Use dynamic API service / 使用动态API服务
    const response = await terminalApi.readOutput(terminalId, currentCursor)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to load output:', errorText)
      throw new Error('Failed to load output')
    }

    const data = await response.json()
    console.log('Output data:', data)

    if (data.output && term) {
      term.write(data.output)
      console.log('Wrote output to terminal')
    } else {
      console.log('No output to display')
    }

    currentCursor = data.cursor || data.since || 0
    console.log('Current cursor:', currentCursor)
  } catch (error) {
    console.error('Failed to load terminal output:', error)
  }
}
// 发送命令
// 发送命令 / Send command
const sendCommand = async (command: string) => {
  if (!command.trim() || !ws || ws.readyState !== WebSocket.OPEN) return

  try {
    // Use dynamic API service / 使用动态API服务
    const response = await terminalApi.writeInput(terminalId, command)

    if (!response.ok) {
      throw new Error(`Failed to send command (${response.status})`)
    }
  } catch (error) {
    console.error('Failed to send command:', error)
  }
}
// 终端输入处理
const handleTerminalData = (data: string) => {
  sendCommand(data)
}

// 清空终端
const clearTerminal = () => {
  if (term) {
    term.clear()
  }
}

// 终止终端 / Kill terminal
const killTerminal = async () => {
  try {
    // Use dynamic API service / 使用动态API服务
    const response = await terminalApi.delete(terminalId)
    
    if (response.ok) {
      router.push('/')
    } else {
      throw new Error('Failed to kill terminal')
    }
  } catch (error) {
    console.error('Failed to kill terminal:', error)
  }
}

// 重新连接
const reconnect = () => {
  if (ws) {
    ws.close()
  }
  connectWebSocket()
}

// 切换全屏
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
  nextTick(() => {
    fitAddon?.fit()
  })
}

onMounted(async () => {
  try {
    // Initialize API service first / 首先初始化API服务
    await initializeApiService()
    console.log('API service initialized, fetching terminal details...')
    await fetchTerminalDetails()
    setupTerminal()
    connectWebSocket()
    await loadTerminalOutput() // 加载历史输出 / Load historical output

    // 设置终端数据处理器 / Set terminal data handler
    if (term) {
      term.onData(handleTerminalData)
    }
  } catch (error) {
    console.error('Failed to initialize API service:', error)
    isLoading.value = false
  }
})

onUnmounted(() => {
  if (ws) {
    ws.close()
  }
  if (term) {
    term.dispose()
  }
})
</script>

<template>
  <div class="terminal-container" :class="{ 'fullscreen': isFullscreen }">
    <!-- 顶部控制栏 -->
    <header class="terminal-header">
      <div class="header-left">
        <Button
          variant="secondary"
          size="sm"
          class="back-btn"
          @click="$router.push('/')"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {{ t('terminal.backToList') }}
        </Button>
        <div class="terminal-title">
          <span class="terminal-icon">💻</span>
          <span class="terminal-name">Terminal {{ terminalId.substring(0, 8) }}</span>
          <Badge
            :variant="connectionStatus.severity === 'success' ? 'default' : 'destructive'"
            class="connection-badge"
          >
            {{ connectionStatus.text }}
          </Badge>
        </div>
      </div>
      
      <div class="header-right">
        <div class="terminal-stats">
          <span class="stat-item">
            <i class="pi pi-clock"></i>
            {{ terminalStats.uptime }}
          </span>
        </div>
        
        <div class="control-buttons">
          <Button
            variant="secondary"
            size="sm"
            class="control-btn"
            @click="clearTerminal"
            title="清空终端"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="control-btn"
            @click="reconnect"
            :disabled="isConnected"
            title="重新连接"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="control-btn"
            @click="killTerminal"
            title="终止终端"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="control-btn"
            @click="toggleFullscreen"
            :title="isFullscreen ? '退出全屏' : '全屏'"
          >
            <svg v-if="isFullscreen" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </Button>
        </div>
      </div>
    </header>

    <!-- 主内容区域 -->
    <main class="terminal-main">
      <!-- 加载状态 -->
      <div v-if="isLoading" class="loading-container">
        <div class="loading-content">
          <div class="loading-spinner">
            <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p class="loading-text">{{ t('common.loading') }}</p>
        </div>
      </div>

      <!-- 终端界面 -->
      <div v-else class="terminal-interface">
        <!-- 侧边信息面板 -->
        <aside class="info-panel" :class="{ 'collapsed': isFullscreen }">
          <Card class="info-card">
            <CardHeader>
              <CardTitle>
                <div class="panel-title">
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {{ t('terminal.terminalInfo') }}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="info-content">
                <div class="info-item">
                  <span class="info-label">
                    <i class="pi pi-hashtag"></i>
                    {{ t('home.pid') }}
                  </span>
                  <span class="info-value">{{ terminal?.pid || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">
                    <i class="pi pi-desktop"></i>
                    {{ t('home.shell') }}
                  </span>
                  <span class="info-value">{{ terminal?.shell || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">
                    <i class="pi pi-folder"></i>
                    {{ t('home.directory') }}
                  </span>
                  <span class="info-value">{{ terminal?.cwd || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">
                    <i class="pi pi-clock"></i>
                    {{ t('home.created') }}
                  </span>
                  <span class="info-value">{{ new Date(terminal?.created).toLocaleString() }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">
                    <i class="pi pi-check-circle"></i>
                    {{ t('home.status') }}
                  </span>
                  <Badge
                    :variant="terminal?.status === 'active' ? 'default' : 'secondary'"
                  >
                    {{ terminal?.status }}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        <!-- 终端输出区域 -->
        <section class="terminal-output-section">
          <div class="terminal-window">
            <!-- 终端标题栏 -->
            <div class="terminal-titlebar">
              <div class="window-controls">
                <span class="control control-close"></span>
                <span class="control control-minimize"></span>
                <span class="control control-maximize"></span>
              </div>
              <div class="window-title">
                <i :class="connectionStatus.icon"></i>
                {{ connectionStatus.text }} - {{ terminalId.substring(0, 8) }}
              </div>
              <div class="window-actions">
                <span class="action-item">{{ terminalStats.uptime }}</span>
              </div>
            </div>

            <!-- 终端容器 -->
            <div 
              id="terminal-container"
              class="terminal-container-wrapper"
            ></div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.terminal-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  color: #ffffff;
}

.terminal-container.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
}

.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: #2d2d2d;
  border-bottom: 1px solid #404040;
  min-height: 60px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.back-btn {
  background: #404040 !important;
  border: 1px solid #555 !important;
  color: #fff !important;
}

.back-btn:hover {
  background: #555 !important;
}

.terminal-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.terminal-icon {
  font-size: 1.2rem;
}

.terminal-name {
  font-weight: 600;
  color: #fff;
}

.connection-badge {
  font-size: 0.75rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.terminal-stats {
  display: flex;
  gap: 1rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #ccc;
  font-size: 0.9rem;
}

.control-buttons {
  display: flex;
  gap: 0.5rem;
}

.control-btn {
  background: #404040 !important;
  border: 1px solid #555 !important;
  color: #fff !important;
  width: 36px !important;
  height: 36px !important;
}

.control-btn:hover {
  background: #555 !important;
}

.terminal-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.loading-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-content {
  text-align: center;
}

.loading-spinner {
  font-size: 2rem;
  margin-bottom: 1rem;
}

.loading-text {
  color: #ccc;
}

.terminal-interface {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.info-panel {
  width: 300px;
  background: #252525;
  border-right: 1px solid #404040;
  transition: margin-left 0.3s ease;
}

.info-panel.collapsed {
  margin-left: -300px;
}

.info-card {
  margin: 1rem;
  background: #2d2d2d !important;
  border: 1px solid #404040 !important;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #fff;
}

.info-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #ccc;
  font-size: 0.9rem;
}

.info-value {
  color: #fff;
  font-size: 0.9rem;
  font-family: monospace;
}

.terminal-output-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem;
}

.terminal-window {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #000000;
  border: 1px solid #404040;
  border-radius: 8px;
  overflow: hidden;
}

.terminal-titlebar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background: #2d2d2d;
  border-bottom: 1px solid #404040;
}

.window-controls {
  display: flex;
  gap: 0.5rem;
}

.control {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.control-close {
  background: #ff5f56;
}

.control-minimize {
  background: #ffbd2e;
}

.control-maximize {
  background: #27c93f;
}

.window-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #fff;
  font-size: 0.9rem;
}

.window-actions {
  display: flex;
  align-items: center;
}

.action-item {
  color: #ccc;
  font-size: 0.8rem;
}

.terminal-container-wrapper {
  flex: 1;
  padding: 1rem;
  background: #000000;
}

/* xterm.js terminal styles aligned with 1Panel (visual only) / 对齐 1Panel 风格的 xterm.js 终端样式（仅视觉，不改字体度量） */
:deep(.xterm) {
  height: 100% !important;
  padding: 8px !important;
  background: #000000 !important;
  color: #ffffff !important;
}

:deep(.xterm-viewport),
:deep(.xterm-screen) {
  background: #000000 !important;
}
</style>
