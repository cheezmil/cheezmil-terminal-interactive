<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Terminal as WebTerminal } from 'vue-web-terminal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { initializeApiService, terminalApi } from '../services/api-service'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const terminalId = route.params.id as string
const terminal = ref<any>(null)
const isLoading = ref(true)
const isConnected = ref(false)
const isFullscreen = ref(false)
const terminalRef = ref<any>(null)
const pollingTimer = ref<ReturnType<typeof setInterval> | null>(null)
// Track incremental cursor to fetch only new output / 记录游标，仅获取新增输出
const readCursor = ref(0)
const isFetching = ref(false)
const isPageVisible = ref(true)

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

const pushOutput = (content: string) => {
  if (terminalRef.value?.pushMessage) {
    terminalRef.value.pushMessage({ type: 'ansi', content })
    terminalRef.value.jumpToBottom?.(true)
  }
}

const fetchTerminalDetails = async () => {
  try {
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

const loadTerminalOutput = async (options: { reset?: boolean } = {}) => {
  try {
    if (!isPageVisible.value) {
      return
    }
    if (isFetching.value) {
      return
    }
    isFetching.value = true
    const isReset = options.reset === true
    const response = await terminalApi.readOutput(terminalId, {
      mode: 'tail',
      tailLines: 200,
      maxLines: 300,
      since: isReset ? 0 : readCursor.value
    })
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to load output:', errorText)
      return
    }
    const data = await response.json() as { output?: string; cursor?: number; since?: number }
    const nextCursor = typeof data.cursor === 'number' ? data.cursor : data.since
    const currentCursor = isReset ? 0 : readCursor.value
    const hasNewCursor = typeof nextCursor === 'number' && Number.isFinite(nextCursor) && nextCursor > currentCursor

    if (!isReset && !hasNewCursor) {
      return
    }

    if (isReset && terminalRef.value?.clearLog) {
      terminalRef.value.clearLog(true)
    }
    if (data.output) {
      pushOutput(data.output)
    }
    if (hasNewCursor) {
      readCursor.value = nextCursor
    }
  } catch (error) {
    console.error('Failed to load terminal output:', error)
  } finally {
    isFetching.value = false
  }
}

const sendCommand = async (command: string) => {
  if (!command.trim()) return
  const response = await terminalApi.writeInput(terminalId, command, true)
  if (!response.ok) {
    throw new Error(`Failed to send command (${response.status})`)
  }
}

const handleExecCommand = async (_key: string, command: string, success: (msg?: any) => void, failed: (msg: string) => void) => {
  try {
    await sendCommand(command)
    success({ type: 'cmdLine', content: command })
  } catch (error: any) {
    console.error('Failed to send command:', error)
    failed(error?.message || 'Failed to send command')
  }
}

const clearTerminal = () => {
  if (terminalRef.value?.clearLog) {
    terminalRef.value.clearLog(true)
    terminalRef.value.pushMessage?.({ type: 'normal', class: 'info', content: 'Terminal cleared / 终端已清空' })
  }
}

const killTerminal = async () => {
  try {
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

const reconnect = async () => {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
  await nextTick()
  readCursor.value = 0
  loadTerminalOutput({ reset: true })
  // 重启轮询 / restart polling
  pollingTimer.value = setInterval(() => {
    loadTerminalOutput()
  }, 2500)
}

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
  nextTick(() => {
    terminalRef.value?.focus?.(true)
  })
}

onMounted(async () => {
  try {
    const handleVisibility = () => {
      isPageVisible.value = !document.hidden
    }
    document.addEventListener('visibilitychange', handleVisibility)
    await initializeApiService()
    console.log('API service initialized, fetching terminal details...')
    await fetchTerminalDetails()
    await nextTick()
    await loadTerminalOutput({ reset: true })
    pollingTimer.value = setInterval(() => {
      loadTerminalOutput()
    }, 2500)
    isConnected.value = true

    onUnmounted(() => {
      document.removeEventListener('visibilitychange', handleVisibility)
    })
  } catch (error) {
    console.error('Failed to initialize API service:', error)
    isLoading.value = false
  }
})

onUnmounted(() => {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
  readCursor.value = 0
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
            <WebTerminal
              ref="terminalRef"
              :name="`terminal-${terminalId}`"
              :context="terminal?.cwd || '~'"
              context-suffix="$"
              :show-header="false"
              :enable-help-box="false"
              :line-space="2"
              theme="dark"
              :log-size-limit="800"
              class="terminal-container-wrapper"
              @exec-cmd="(key, command, success, failed) => handleExecCommand(key, command, success, failed)"
            />
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
</style>
