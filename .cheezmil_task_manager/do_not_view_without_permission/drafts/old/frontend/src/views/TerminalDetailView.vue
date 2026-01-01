<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Badge from 'primevue/badge'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'

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
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ffffff',
        selection: '#ffffff40'
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

// WebSocket连接
const connectWebSocket = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}`

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

// 获取终端信息
const fetchTerminalDetails = async () => {
  try {
    const response = await fetch(`/api/terminals/${terminalId}`)
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
let currentCursor = 0
const loadTerminalOutput = async () => {
  try {
    console.log('Loading terminal output for:', terminalId)
    const response = await fetch(`/api/terminals/${terminalId}/output?since=${currentCursor}`)

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
const sendCommand = async (command: string) => {
  if (!command.trim() || !ws || ws.readyState !== WebSocket.OPEN) return

  try {
    const response = await fetch(`/api/terminals/${terminalId}/input`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: command })
    })

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

// 终止终端
const killTerminal = async () => {
  try {
    const response = await fetch(`/api/terminals/${terminalId}`, {
      method: 'DELETE'
    })
    
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
  await fetchTerminalDetails()
  setupTerminal()
  connectWebSocket()
  await loadTerminalOutput() // 加载历史输出

  // 设置终端数据处理器
  if (term) {
    term.onData(handleTerminalData)
  }

  // 强制隐藏xterm.js的辅助元素和页面底部的多余字符
  nextTick(() => {
    // 隐藏xterm-char-measure-element
    const charMeasureElements = document.querySelectorAll('.xterm-char-measure-element')
    charMeasureElements.forEach(el => {
      (el as HTMLElement).style.display = 'none'
      ;(el as HTMLElement).style.visibility = 'hidden'
      ;(el as HTMLElement).style.opacity = '0'
      ;(el as HTMLElement).style.position = 'absolute'
      ;(el as HTMLElement).style.left = '-99999px'
      ;(el as HTMLElement).style.top = '-99999px'
      ;(el as HTMLElement).style.width = '0'
      ;(el as HTMLElement).style.height = '0'
      ;(el as HTMLElement).style.fontSize = '0'
      ;(el as HTMLElement).style.lineHeight = '0'
      ;(el as HTMLElement).style.overflow = 'hidden'
      ;(el as HTMLElement).style.clip = 'rect(0, 0, 0, 0)'
      ;(el as HTMLElement).style.clipPath = 'inset(50%)'
    })

    // 隐藏页面底部的多余字符
    const removeExtraChars = () => {
      // 查找包含多余字符的元素
      const allElements = document.querySelectorAll('*')
      allElements.forEach(el => {
        const element = el as HTMLElement
        if (element.textContent && element.textContent.includes('}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}')) {
          element.remove()
        }
      })
      
      // 查找body下的直接子元素（除了#app）
      const bodyDivs = document.querySelectorAll('body > div:not(#app)')
      bodyDivs.forEach(el => {
        (el as HTMLElement).style.display = 'none'
        ;(el as HTMLElement).style.visibility = 'hidden'
        ;(el as HTMLElement).style.opacity = '0'
        ;(el as HTMLElement).style.position = 'absolute'
        ;(el as HTMLElement).style.left = '-99999px'
        ;(el as HTMLElement).style.top = '-99999px'
        ;(el as HTMLElement).style.width = '0'
        ;(el as HTMLElement).style.height = '0'
        ;(el as HTMLElement).style.overflow = 'hidden'
      })
    }

    // 使用MutationObserver监控DOM变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element
              // 检查新添加的元素是否包含多余字符
              if (element.textContent && element.textContent.includes('}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}')) {
                element.remove()
              }
            }
          })
        }
      })
    })

    // 监控body的变化
    observer.observe(document.body, {
      childList: true,
      subtree: true
    })

    // 定期检查并隐藏这些元素（防止xterm.js重新创建）
    const hideElements = () => {
      const charElements = document.querySelectorAll('.xterm-char-measure-element')
      charElements.forEach(el => {
        (el as HTMLElement).style.display = 'none'
        ;(el as HTMLElement).style.visibility = 'hidden'
        ;(el as HTMLElement).textContent = ''
      })

      removeExtraChars()
    }

    // 立即执行一次
    hideElements()
    
    // 每100ms检查一次
    const intervalId = setInterval(hideElements, 100)
    
    // 在组件卸载时清理定时器和观察器
    onUnmounted(() => {
      clearInterval(intervalId)
      observer.disconnect()
    })
  })
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
          icon="pi pi-arrow-left" 
          :label="t('terminal.backToList')" 
          severity="secondary" 
          size="small"
          class="back-btn"
          @click="$router.push('/')"
        />
        <div class="terminal-title">
          <span class="terminal-icon">💻</span>
          <span class="terminal-name">Terminal {{ terminalId.substring(0, 8) }}</span>
          <Badge 
            :severity="connectionStatus.severity" 
            :value="connectionStatus.text"
            class="connection-badge"
          />
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
            icon="pi pi-trash" 
            v-tooltip="'清空终端'"
            severity="secondary" 
            size="small"
            class="control-btn"
            @click="clearTerminal"
          />
          <Button 
            icon="pi pi-refresh" 
            v-tooltip="'重新连接'"
            severity="secondary" 
            size="small"
            class="control-btn"
            @click="reconnect" 
            :disabled="isConnected"
          />
          <Button 
            icon="pi pi-times" 
            v-tooltip="'终止终端'"
            severity="danger" 
            size="small"
            class="control-btn"
            @click="killTerminal"
          />
          <Button 
            :icon="isFullscreen ? 'pi pi-window-minimize' : 'pi pi-window-maximize'" 
            v-tooltip="isFullscreen ? '退出全屏' : '全屏'"
            severity="secondary" 
            size="small"
            class="control-btn"
            @click="toggleFullscreen"
          />
        </div>
      </div>
    </header>

    <!-- 主内容区域 -->
    <main class="terminal-main">
      <!-- 加载状态 -->
      <div v-if="isLoading" class="loading-container">
        <div class="loading-content">
          <div class="loading-spinner">
            <i class="pi pi-spin pi-spinner"></i>
          </div>
          <p class="loading-text">{{ t('common.loading') }}</p>
        </div>
      </div>

      <!-- 终端界面 -->
      <div v-else class="terminal-interface">
        <!-- 侧边信息面板 -->
        <aside class="info-panel" :class="{ 'collapsed': isFullscreen }">
          <Card class="info-card">
            <template #title>
              <div class="panel-title">
                <i class="pi pi-info-circle"></i>
                {{ t('terminal.terminalInfo') }}
              </div>
            </template>
            <template #content>
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
                    :severity="terminal?.status === 'active' ? 'success' : 'warning'" 
                    :value="terminal?.status" 
                  />
                </div>
              </div>
            </template>
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

/* xterm.js样式覆盖 */
:deep(.xterm) {
  height: 100% !important;
  background: #000000 !important;
}

:deep(.xterm-viewport) {
  background: #000000 !important;
}

:deep(.xterm-screen) {
  background: #000000 !important;
}

/* 隐藏xterm.js的辅助元素 */
:deep(.xterm-helper-textarea) {
  position: absolute !important;
  left: -9999px !important;
  top: -9999px !important;
  width: 0 !important;
  height: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

:deep(.xterm-char-measure-element) {
  position: absolute !important;
  left: -99999px !important;
  top: -99999px !important;
  width: 0 !important;
  height: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
  visibility: hidden !important;
  display: none !important;
  font-size: 0 !important;
  line-height: 0 !important;
  z-index: -9999 !important;
}

/* 隐藏页面底部可能的多余字符 */
body > div:not(#app) {
  display: none !important;
}
</style>