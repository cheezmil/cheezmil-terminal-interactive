<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Terminal as WebTerminal } from 'vue-web-terminal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'vue-sonner'
import { useTerminalStore } from '../stores/terminal'
import { initializeApiService, terminalApi } from '../services/api-service'
import SvgIcon from '@/components/ui/svg-icon.vue'

const { t } = useI18n()
const terminalStore = useTerminalStore()

// Terminal management state / 终端管理状态
const terminals = ref<any[]>([])
const isLoading = ref(true)
const activeTerminalId = ref<string | null>(null)
const terminalRefs = ref<Map<string, any>>(new Map())
const initializedTerminals = ref<Set<string>>(new Set())
// Track incremental cursor per terminal to fetch only new output / 记录每个终端的游标，仅获取新增输出
const terminalCursors = ref<Map<string, number>>(new Map())
const pollingTimer = ref<ReturnType<typeof setInterval> | null>(null)
// Avoid overlapping fetches per terminal / 避免同一终端并发拉取
const terminalLoading = ref<Set<string>>(new Set())
const isPageVisible = ref(true)

// Sidebar state / 侧边栏状态
const isSidebarCollapsed = ref(false)

// Periodic refresh timer for terminals / 终端列表的周期性刷新定时器
let terminalsRefreshTimer: ReturnType<typeof setInterval> | null = null

// Computed properties / 计算属性
const activeTerminal = computed(() =>
  terminals.value.find(t => t.id === activeTerminalId.value)
)

// Helper: cache terminal component refs / 缓存终端组件引用
const setTerminalRef = (id: string, instance: any | null) => {
  if (instance) {
    terminalRefs.value.set(id, instance)
  } else {
    terminalRefs.value.delete(id)
  }
}

// Helper: push output to vue-web-terminal / 将输出写入 vue-web-terminal
const pushOutput = (terminalId: string, content: string) => {
  const instance = terminalRefs.value.get(terminalId)
  if (instance?.pushMessage) {
    instance.pushMessage({ type: 'ansi', content })
    if (instance.jumpToBottom) {
      instance.jumpToBottom(true)
    }
  }
}

// Fetch terminals from API / 从API获取终端列表
const fetchTerminals = async () => {
  try {
    const response = await terminalApi.list()
    if (!response.ok) {
      throw new Error('Failed to fetch terminals')
    }
    const data = await response.json()

    const fetchedTerminals = data.terminals || []
    terminals.value = fetchedTerminals
    terminalStore.updateTerminals(fetchedTerminals)

    if (fetchedTerminals.length > 0 && !activeTerminalId.value) {
      activeTerminalId.value = fetchedTerminals[0].id
    }
  } catch (error) {
    console.error('Error fetching terminals:', error)
    terminals.value = []
    terminalStore.updateTerminals([])
    toast.error(t('messages.fetchTerminalsError'))
  } finally {
    isLoading.value = false
  }
}

// Load terminal historical output / 加载终端历史输出
const loadTerminalOutput = async (terminalId: string, options: { reset?: boolean } = {}) => {
  try {
    if (!isPageVisible.value) {
      return
    }
    if (terminalLoading.value.has(terminalId)) {
      return
    }
    terminalLoading.value.add(terminalId)
    const isReset = options.reset === true
    const sinceCursor = isReset ? 0 : (terminalCursors.value.get(terminalId) ?? 0)
    const response = await terminalApi.readOutput(terminalId, {
      mode: 'tail',
      tailLines: 200,
      maxLines: 300,
      since: sinceCursor
    })
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Failed to load output for terminal ${terminalId}:`, errorText)
      return
    }
    const data = await response.json() as { output?: string; cursor?: number; since?: number }
    const instance = terminalRefs.value.get(terminalId)
    const nextCursor = typeof data.cursor === 'number' ? data.cursor : data.since

    const hasNewCursor = typeof nextCursor === 'number' && Number.isFinite(nextCursor) && nextCursor > sinceCursor

    if (!isReset && !hasNewCursor) {
      return
    }

    if (isReset && instance?.clearLog) {
      instance.clearLog(true)
    }
    if (data.output && data.output.length > 0) {
      pushOutput(terminalId, data.output)
    }
    if (hasNewCursor) {
      terminalCursors.value.set(terminalId, nextCursor)
    }
  } catch (error) {
    console.error(`Failed to load output for terminal ${terminalId}:`, error)
  } finally {
    terminalLoading.value.delete(terminalId)
  }
}

// Prepare terminal: load history and start polling / 准备终端：加载历史并开始轮询
const ensureTerminalReady = async (terminalId: string) => {
  if (!terminalId) return

  await nextTick()
  const instance = terminalRefs.value.get(terminalId)
  if (!instance) return

  const isFirstLoad = !initializedTerminals.value.has(terminalId)
  if (isFirstLoad) {
    await loadTerminalOutput(terminalId, { reset: true })
    initializedTerminals.value.add(terminalId)
  } else {
    await loadTerminalOutput(terminalId)
  }

  // 开始轮询当前终端输出，避免 WS 导致卡死 / start polling current terminal output
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
  pollingTimer.value = setInterval(() => {
    if (activeTerminalId.value) {
      loadTerminalOutput(activeTerminalId.value)
    }
  }, 2500)

  if (instance.focus) {
    instance.focus(true)
  }
}

// Send terminal input via HTTP / 通过 HTTP 发送终端输入
const sendTerminalInput = async (terminalId: string, input: string) => {
  const response = await terminalApi.writeInput(terminalId, input, true)
  if (!response.ok) {
    throw new Error(`Failed to send input (${response.status})`)
  }
}

// Handle command execution from vue-web-terminal / 处理 vue-web-terminal 的命令执行
const handleExecCommand = async (
  terminalId: string,
  _key: string,
  command: string,
  success: (msg?: any) => void,
  failed: (msg: string) => void
) => {
  try {
    if (!command || command.trim().length === 0) {
      success()
      return
    }
    await sendTerminalInput(terminalId, command)
    success({ type: 'cmdLine', content: command })
  } catch (error: any) {
    console.error(`Failed to send input to terminal ${terminalId}:`, error)
    failed(error?.message || 'Failed to send input')
  }
}

// Delete terminal / 删除终端
const deleteTerminal = async (id: string) => {
  try {
    initializedTerminals.value.delete(id)
    terminalRefs.value.delete(id)
    terminalCursors.value.delete(id)

    const response = await terminalApi.delete(id)
    if (!response.ok) {
      throw new Error('Failed to delete terminal')
    }

    terminals.value = terminals.value.filter(t => t.id !== id)
    terminalStore.updateTerminals(terminals.value)

    if (activeTerminalId.value === id && terminals.value.length > 0) {
      activeTerminalId.value = terminals.value[0].id
    } else if (terminals.value.length === 0) {
      activeTerminalId.value = null
    }

    toast.success(t('messages.terminalDeleted'))
  } catch (error) {
    console.error('Error deleting terminal:', error)
    toast.error(t('messages.deleteTerminalError'))
  }
}

// Switch terminal / 切换终端
const switchTerminal = (terminalId: string) => {
  activeTerminalId.value = terminalId
  ensureTerminalReady(terminalId)
}

// Clear terminal content / 清空终端内容
const clearTerminal = (terminalId: string) => {
  const instance = terminalRefs.value.get(terminalId)
  if (instance?.clearLog) {
    instance.clearLog(true)
    instance.pushMessage?.({ type: 'normal', class: 'info', content: 'Terminal cleared / 终端已清空' })
  }
}

// Reconnect terminal / 重新连接终端
const reconnectTerminal = (terminalId: string) => {
  initializedTerminals.value.delete(terminalId)
  terminalCursors.value.set(terminalId, 0)
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
  ensureTerminalReady(terminalId)
}

// Toggle sidebar / 切换侧边栏
const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

// Helper functions / 辅助函数
const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'active':
      return 'default'
    case 'inactive':
      return 'secondary'
    case 'terminated':
      return 'destructive'
    default:
      return 'outline'
  }
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return t('home.justNow')
  if (diffMins < 60) return `${diffMins} ${t('home.minutesAgo')}`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours} ${t('home.hoursAgo')}`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} ${t('home.daysAgo')}`
}

watch(() => activeTerminalId.value, (newId) => {
  if (newId) {
    ensureTerminalReady(newId)
  }
})

// Watch terminal list changes, auto-select first / 监听终端列表变化，自动选中首个终端
watch(terminals, (newTerminals) => {
  if (newTerminals.length > 0 && !activeTerminalId.value) {
    activeTerminalId.value = newTerminals[0].id
  }
}, { deep: true })

// Lifecycle hooks / 生命周期钩子
onMounted(async () => {
  try {
    const handleVisibility = () => {
      isPageVisible.value = !document.hidden
    }
    document.addEventListener('visibilitychange', handleVisibility)
    await initializeApiService()
    console.log('API service initialized, fetching terminals...')
    fetchTerminals()

    // 清理监听器
    onUnmounted(() => {
      document.removeEventListener('visibilitychange', handleVisibility)
    })
  } catch (error) {
    console.error('Failed to initialize API service:', error)
    toast.error('Failed to initialize API service')
    isLoading.value = false
  }
})

onUnmounted(() => {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
  initializedTerminals.value.clear()
  terminalRefs.value.clear()
  terminalCursors.value.clear()

  if (terminalsRefreshTimer) {
    clearInterval(terminalsRefreshTimer)
    terminalsRefreshTimer = null
  }
})
</script>

<template>
  <div class="h-screen luxury-home-container flex flex-col overflow-hidden">
    <Toaster />
    
    <!-- Luxury loading state / 奢华加载状态 -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="text-center animate-luxury-fade-in">
        <div class="text-4xl text-luxury-gold mb-4 animate-luxury-spin">
          <SvgIcon name="spinner" class="w-16 h-16" />
        </div>
        <p class="text-text-secondary text-lg font-serif-luxury">{{ t('common.loading') }}</p>
      </div>
    </div>

    <!-- Luxury main workspace / 奢华主工作区 - 全屏终端布局 -->
    <div v-else class="flex-1 flex overflow-hidden">
      <!-- Luxury left sidebar with terminal tabs / 奢华左侧边栏带终端标签 -->
      <aside :class="['luxury-sidebar flex flex-col flex-shrink-0 transition-all duration-300',
                     { 'w-80': !isSidebarCollapsed, 'w-16': isSidebarCollapsed }]">
        <div class="luxury-sidebar-header">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span v-if="!isSidebarCollapsed" class="font-semibold text-text-primary font-serif-luxury">{{ t('home.terminals') }}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              class="luxury-sidebar-toggle"
              @click="toggleSidebar"
              :title="isSidebarCollapsed ? t('common.expand') : t('common.collapse')"
            >
              <SvgIcon v-if="isSidebarCollapsed" name="chevronRight" class="w-4 h-4" />
              <SvgIcon v-else name="chevronLeft" class="w-4 h-4" />
            </Button>
          </div>
        </div>

        <!-- Luxury terminal tabs / 奢华终端标签 -->
        <div v-if="!isSidebarCollapsed" class="flex-1 overflow-y-auto p-2 luxury-terminal-list">
          <div v-if="terminals.length === 0" class="luxury-empty-state">
            <div class="text-5xl text-platinum mb-4">
              <SvgIcon name="archive" class="w-16 h-16" />
            </div>
            <p class="text-text-secondary mb-2 font-serif-luxury">{{ t('home.noTerminals') }}</p>
            <p class="text-text-muted text-sm">{{ t('home.useCtiTool') }}</p>
          </div>
          
          <div v-else class="space-y-2">
            <div
              v-for="terminal in terminals"
              :key="terminal.id"
              :class="['luxury-terminal-item cursor-pointer transition-all duration-300',
                       { 'luxury-terminal-active': terminal.id === activeTerminalId,
                         'luxury-terminal-inactive': terminal.id !== activeTerminalId }]"
              @click="switchTerminal(terminal.id)"
            >
              <div class="flex flex-col space-y-2">
                <div class="flex justify-between items-center">
                  <div class="flex items-center space-x-2">
                    <span class="luxury-terminal-id">
                      {{ terminal.id || 'N/A' }}
                    </span>
                    <Badge
                      :variant="getStatusBadgeVariant(terminal.status)"
                      class="luxury-status-badge"
                    >
                      {{ terminal.status }}
                    </Badge>
                  </div>
                  <div class="flex space-x-1 luxury-terminal-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="luxury-action-button"
                      @click.stop="clearTerminal(terminal.id)"
                      :title="t('terminal.clear')"
                    >
                      <SvgIcon name="trash" class="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="luxury-action-button"
                      @click.stop="reconnectTerminal(terminal.id)"
                      :title="t('terminal.reconnect')"
                    >
                      <SvgIcon name="refresh" class="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="luxury-action-button-danger"
                      @click.stop="deleteTerminal(terminal.id)"
                      :title="t('home.terminate')"
                    >
                      <SvgIcon name="x" class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div class="space-y-1">
                  <div class="flex items-center space-x-2 text-xs luxury-terminal-info">
                    <SvgIcon name="cog" class="w-3 h-3 text-luxury-gold" />
                    <span class="text-text-muted">PID:</span>
                    <span class="text-text-secondary">{{ terminal.pid }}</span>
                  </div>
                  <div class="flex items-center space-x-2 text-xs luxury-terminal-info">
                    <SvgIcon name="folder" class="w-3 h-3 text-rose-gold" />
                    <span class="text-text-secondary truncate" :title="terminal.cwd">
                      {{ terminal.cwd || t('home.default') }}
                    </span>
                  </div>
                  <div class="flex items-center space-x-2 text-xs luxury-terminal-info">
                    <SvgIcon name="clock" class="w-3 h-3 text-platinum" />
                    <span class="text-text-secondary">{{ formatDate(terminal.created) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Luxury right main content area / 奢华右侧主内容区域 - 全屏终端 -->
      <main class="flex-1 flex flex-col luxury-main-content overflow-hidden">
        <div v-if="!activeTerminalId" class="flex-1 flex items-center justify-center">
          <div class="text-center animate-luxury-fade-in">
            <div class="text-6xl text-platinum mb-6 animate-luxury-pulse">
              <SvgIcon name="monitor" class="w-24 h-24" />
            </div>
            <h3 class="text-2xl font-bold text-text-primary mb-3 font-serif-luxury">{{ t('home.noTerminalSelected') }}</h3>
            <p class="text-text-secondary max-w-md font-serif-luxury">
              {{ t('home.selectTerminalFromSidebar') }}
            </p>
          </div>
        </div>

        <div v-else class="flex-1 flex flex-col overflow-hidden">
          <!-- Luxury terminal header / 奢华终端头部 -->
          <header class="luxury-terminal-header">
            <div class="flex items-center space-x-3">
              <div class="flex items-center space-x-2">
                <SvgIcon v-if="activeTerminal?.status === 'active'" name="check" class="w-5 h-5 luxury-status-icon" />
                <SvgIcon v-else-if="activeTerminal?.status === 'inactive'" name="pause" class="w-5 h-5 luxury-status-icon" />
                <SvgIcon v-else name="stop" class="w-5 h-5 luxury-status-icon" />
                <span class="font-semibold text-text-primary font-serif-luxury">{{ activeTerminal?.id || 'Terminal ' + (activeTerminalId || 'N/A') }}</span>
                <Badge
                  :variant="getStatusBadgeVariant(activeTerminal?.status)"
                  class="luxury-status-badge"
                >
                  {{ activeTerminal?.status }}
                </Badge>
              </div>
            </div>
            
            <div class="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                class="luxury-header-button"
                @click="clearTerminal(activeTerminalId!)"
                :title="t('terminal.clear')"
              >
                <SvgIcon name="trash" class="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="luxury-header-button"
                @click="reconnectTerminal(activeTerminalId!)"
                :title="t('terminal.reconnect')"
              >
                <SvgIcon name="refresh" class="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="luxury-header-button-danger"
                @click="deleteTerminal(activeTerminalId!)"
                :title="t('home.terminate')"
              >
                <SvgIcon name="x" class="w-4 h-4" />
              </Button>
            </div>
          </header>

          <!-- Luxury terminal content / 奢华终端内容 - 占满剩余空间 -->
          <div class="flex-1 luxury-terminal-container overflow-hidden">
            <!-- Only render active terminal to reduce resource usage / 仅渲染当前活跃终端以减少资源占用 -->
            <WebTerminal
              v-if="activeTerminal"
              :key="activeTerminal.id"
              :name="`terminal-${activeTerminal.id}`"
              :context="activeTerminal.cwd || '~'"
              context-suffix="$"
              :show-header="false"
              :enable-help-box="false"
              :line-space="2"
              theme="dark"
              :log-size-limit="800"
              class="w-full h-full luxury-terminal-viewport"
              @exec-cmd="(key, command, success, failed) => handleExecCommand(activeTerminal.id, key, command, success, failed)"
              @on-click="() => switchTerminal(activeTerminal.id)"
              @on-active="() => switchTerminal(activeTerminal.id)"
              :ref="(el) => setTerminalRef(activeTerminal.id, el)"
            />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* Luxury home container / 奢华主容器 */
.luxury-home-container {
  background: var(--jet-black);
}

/* Luxury sidebar / 奢华侧边栏 */
.luxury-sidebar {
  background: var(--jet-black);
  border-right: 1px solid var(--luxury-gold);
  box-shadow: 4px 0 20px rgba(0, 0, 0, 0.3), inset -1px 0 0 rgba(212, 175, 55, 0.1);
}

.luxury-sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid var(--luxury-gold);
  background: var(--jet-black);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.luxury-icon {
  font-size: 1.25rem;
  text-shadow: 0 0 10px rgba(212, 175, 55, 0.3);
}

.luxury-badge {
  background: rgba(212, 175, 55, 0.1) !important;
  border: 1px solid var(--luxury-gold) !important;
  color: var(--luxury-gold) !important;
  font-weight: 600 !important;
}

/* Luxury terminal list / 奢华终端列表 */
.luxury-terminal-list {
  padding: 0.5rem;
  background: var(--jet-black);
}

.luxury-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 2rem;
}

.luxury-terminal-item {
  padding: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid;
  margin-bottom: 0.5rem;
  position: relative;
  overflow: hidden;
}

.luxury-terminal-active {
  background: rgba(26, 26, 26, 0.8);
  border-color: var(--luxury-gold);
  box-shadow: 0 4px 20px rgba(212, 175, 55, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}


.luxury-terminal-inactive {
  background: rgba(26, 26, 26, 0.6);
  border-color: rgba(212, 175, 55, 0.2);
  transition: all 0.3s ease;
}

.luxury-terminal-inactive:hover {
  background: rgba(26, 26, 26, 0.8);
  border-color: var(--luxury-gold);
  transform: translateY(-1px);
  box-shadow: 0 2px 10px rgba(212, 175, 55, 0.2);
}

.luxury-terminal-id {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  background: rgba(212, 175, 55, 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid rgba(212, 175, 55, 0.2);
}

.luxury-status-badge {
  font-size: 0.75rem !important;
  font-weight: 500 !important;
  border-radius: 0.375rem !important;
  border: 1px solid !important;
}

.luxury-terminal-actions {
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.luxury-terminal-item:hover .luxury-terminal-actions {
  opacity: 1;
}

.luxury-action-button {
  width: 1.5rem !important;
  height: 1.5rem !important;
  background: rgba(212, 175, 55, 0.05) !important;
  border: 1px solid rgba(212, 175, 55, 0.2) !important;
  color: var(--luxury-gold) !important;
  border-radius: 0.375rem !important;
  transition: all 0.2s ease !important;
}

.luxury-action-button:hover {
  background: rgba(212, 175, 55, 0.1) !important;
  border-color: var(--luxury-gold) !important;
  transform: scale(1.1) !important;
}

.luxury-action-button-danger {
  width: 1.5rem !important;
  height: 1.5rem !important;
  background: rgba(239, 68, 68, 0.05) !important;
  border: 1px solid rgba(239, 68, 68, 0.2) !important;
  color: #ef4444 !important;
  border-radius: 0.375rem !important;
  transition: all 0.2s ease !important;
}

.luxury-action-button-danger:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  border-color: #ef4444 !important;
  transform: scale(1.1) !important;
}

.luxury-terminal-info {
  color: var(--text-tertiary);
  transition: color 0.2s ease;
}

.luxury-terminal-info:hover {
  color: var(--text-secondary);
}

/* Luxury main content / 奢华主内容 */
.luxury-main-content {
  background: var(--jet-black);
  position: relative;
}

/* Luxury terminal header / 奢华终端头部 */
.luxury-terminal-header {
  padding: 0.75rem 1rem;
  background: var(--luxury-glass);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--luxury-gold);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.luxury-status-icon {
  text-shadow: 0 0 10px currentColor;
}

.luxury-header-button {
  width: 2rem !important;
  height: 2rem !important;
  background: rgba(212, 175, 55, 0.05) !important;
  border: 1px solid rgba(212, 175, 55, 0.2) !important;
  color: var(--luxury-gold) !important;
  border-radius: 0.5rem !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.luxury-header-button:hover {
  background: rgba(212, 175, 55, 0.1) !important;
  border-color: var(--luxury-gold) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3) !important;
}

.luxury-header-button-danger {
  width: 2rem !important;
  height: 2rem !important;
  background: rgba(239, 68, 68, 0.05) !important;
  border: 1px solid rgba(239, 68, 68, 0.2) !important;
  color: #ef4444 !important;
  border-radius: 0.5rem !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.luxury-header-button-danger:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  border-color: #ef4444 !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3) !important;
}

/* Luxury terminal container / 奢华终端容器 */
.luxury-terminal-container {
  background: var(--jet-black);
  border: 1px solid rgba(212, 175, 55, 0.1);
  position: relative;
}

.luxury-terminal-viewport {
  background: var(--jet-black) !important;
  border-radius: 0.75rem !important;
  border: 1px solid rgba(212, 175, 55, 0.1) !important;
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.5) !important;
}

/* Luxury animations / 奢华动画 */
@keyframes luxury-shimmer {
  0%, 100% {
    transform: translateX(-100%);
  }
  50% {
    transform: translateX(100%);
  }
}

@keyframes luxury-fade-in {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes luxury-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes luxury-pulse {
  0%, 100% {
    opacity: 0.8;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}
/* Luxury sidebar toggle button / 奢华侧边栏切换按钮 */
.luxury-sidebar-toggle {
  width: 2rem !important;
  height: 2rem !important;
  background: rgba(212, 175, 55, 0.05) !important;
  border: 1px solid rgba(212, 175, 55, 0.2) !important;
  color: var(--luxury-gold) !important;
  border-radius: 0.5rem !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.luxury-sidebar-toggle:hover {
  background: rgba(212, 175, 55, 0.1) !important;
  border-color: var(--luxury-gold) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3) !important;
}

/* Responsive design / 响应式设计 */
@media (max-width: 768px) {
  .luxury-sidebar {
    width: 16rem;
  }
  
  .luxury-terminal-header {
    padding: 0.5rem 0.75rem;
  }
  
  .luxury-terminal-id {
    font-size: 0.75rem;
  }
}
</style>
