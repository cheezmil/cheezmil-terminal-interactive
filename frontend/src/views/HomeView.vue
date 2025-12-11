<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'vue-sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { DialogFooter } from '@/components/ui/dialog'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { CanvasAddon } from 'xterm-addon-canvas'
import { useTerminalStore as useTerminalStoreReal } from '../stores/terminal'
// import { CanvasAddon } from 'xterm-addon-canvas' // Temporarily disabled to avoid early activation error / 暂时禁用 CanvasAddon 以避免过早激活报错
import { useTerminalStore } from '../stores/terminal'
import { initializeApiService, terminalApi } from '../services/api-service'
import SvgIcon from '@/components/ui/svg-icon.vue'

// Temporary CanvasAddon stub to prevent early activation errors before Terminal.open
// 临时 CanvasAddon 桩类，用于避免在调用 Terminal.open 之前激活导致的报错
class CanvasAddonStub {
  activate(_term: any) {}
  dispose() {}
}
// Use stub instead of real CanvasAddon for now
// 当前使用桩类替代真实 CanvasAddon
const _unusedCanvasAddonStub: any = CanvasAddonStub

const router = useRouter()
const { t } = useI18n()
const terminalStore = useTerminalStoreReal()
const { refreshTrigger } = storeToRefs(terminalStore)

// Terminal management state / 终端管理状态
const terminals = ref<any[]>([])
const isLoading = ref(true)
const activeTerminalId = ref<string | null>(null)
const terminalInstances = ref<Map<string, { term: Terminal, fitAddon: FitAddon, canvasAddon: CanvasAddon | null, ws: WebSocket }>>(new Map())

// Sidebar state / 侧边栏状态
const isSidebarCollapsed = ref(false)

// Periodic refresh timer for terminals / 终端列表的周期性刷新定时器
let terminalsRefreshTimer: ReturnType<typeof setInterval> | null = null

// Computed properties / 计算属性
const stats = computed(() => terminalStore.stats)
const activeTerminal = computed(() => 
  terminals.value.find(t => t.id === activeTerminalId.value)
)

// Fetch terminals from API / 从API获取终端列表
const fetchTerminals = async () => {
  try {
    // Use dynamic API service / 使用动态API服务
    const response = await terminalApi.list()
    if (!response.ok) {
      throw new Error('Failed to fetch terminals')
    }
    const data = await response.json()
    
    const fetchedTerminals = data.terminals || []
    terminals.value = fetchedTerminals
    terminalStore.updateTerminals(fetchedTerminals)
    
    // Auto-select first terminal if none selected / 如果没有选中终端，自动选择第一个
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


// Delete terminal / 删除终端
const deleteTerminal = async (id: string) => {
  try {
    // Close terminal instance first / 先关闭终端实例
    const terminalInstance = terminalInstances.value.get(id)
    if (terminalInstance) {
      if (terminalInstance.ws) {
        terminalInstance.ws.close()
      }
      if (terminalInstance.term) {
        terminalInstance.term.dispose()
      }
      terminalInstances.value.delete(id)
    }
    
    // Use dynamic API service / 使用动态API服务
    const response = await terminalApi.delete(id)

    if (!response.ok) {
      throw new Error('Failed to delete terminal')
    }

    terminals.value = terminals.value.filter(t => t.id !== id)
    terminalStore.updateTerminals(terminals.value)
    
    // Select another terminal if the deleted one was active / 如果删除的是当前活跃终端，选择另一个
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

// Initialize terminal instance / 初始化终端实例
const initializeTerminal = async (terminalId: string) => {
  if (terminalInstances.value.has(terminalId)) {
    return // Already initialized / 已经初始化过了
  }

  try {
    console.log(`Initializing terminal ${terminalId}...`)
    
    // Wait for DOM update and ensure element is attached / 等待DOM更新并确保元素已附加
    await nextTick()
    
    // Wait additional time to ensure DOM is fully ready / 额外等待确保DOM完全准备好
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const container = document.getElementById(`terminal-${terminalId}`)
    console.log(`Looking for container with ID: terminal-${terminalId}`)
    console.log(`Container found:`, container)
    console.log(`Container attached to DOM:`, container && document.body.contains(container))
    
    if (!container) {
      console.error(`Container not found for terminal ${terminalId}`)
      return
    }

    // Verify container is in DOM / 验证容器在DOM中
    if (!document.body.contains(container)) {
      console.error(`Container not attached to DOM for terminal ${terminalId}`)
      return
    }

    // Clear container completely / 完全清空容器
    container.innerHTML = ''
    container.style.display = 'block'
    container.style.width = '100%'
    container.style.height = '100%'
    container.style.backgroundColor = '#000000'
    
    console.log('Container cleared and styled')

    // Create xterm instance with VS Code-like defaults / 使用接近 VS Code 的默认配置创建 xterm 实例
    const term = new Terminal({
      cursorBlink: true,
      // VS Code-like monospace font stack / 类似 VS Code 的等宽字体栈
      fontFamily: '"Cascadia Code", Menlo, Monaco, Consolas, "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.1,
      theme: {
        // VS Code dark terminal inspired theme / 借鉴 VS Code 深色终端配色
        background: '#111827',
        foreground: '#e5e7eb',
        cursor: '#facc15',
        cursorAccent: '#111827',
        selection: '#374151',
        black: '#000000',
        red: '#f87171',
        green: '#34d399',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c4b5fd',
        cyan: '#22d3ee',
        white: '#e5e7eb',
        brightBlack: '#6b7280',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#e9d5ff',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff'
      },
      rows: 24,
      cols: 80,
      scrollback: 2000,
      convertEol: true,
      allowProposedApi: true
    })

    console.log('Terminal instance created:', term)

    // Add FitAddon / 添加FitAddon
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    console.log('FitAddon loaded')

    // Add CanvasAddon for better rendering / 添加CanvasAddon以获得更好的渲染效果
    let canvasAddon: CanvasAddon | null = null
    try {
      canvasAddon = new CanvasAddon()
      term.loadAddon(canvasAddon)
      console.log('CanvasAddon loaded')
    } catch (error) {
      console.error('Failed to load CanvasAddon (will continue without it):', error)
      canvasAddon = null
    }

    // Open terminal with delay to ensure DOM is ready / 延迟打开终端确保DOM准备好
    await new Promise(resolve => setTimeout(resolve, 50))
    term.open(container)
    console.log('Terminal opened in container')
    
    // Fit terminal to container / 适配终端到容器
    setTimeout(() => {
      fitAddon.fit()
      console.log('Terminal fitted to container')
    }, 100)

    // Write test content immediately / 立即写入测试内容
    setTimeout(() => {
      console.log('Writing test content...')
      try {
        // Disabled test content / 禁用测试内容
        return
        term.writeln('=== TERMINAL TEST ===')
        term.writeln('Line 1: Terminal initialized successfully!')
        term.writeln('Line 2: XTerm.js is working!')
        term.writeln('Line 3: 中文测试')
        term.writeln('')
        term.write('$ Ready for input... ')
        
        // Force refresh / 强制刷新
        term.refresh(0, term.rows - 1)
        console.log('Test content written and terminal refreshed')
        
        // Verify content was written by checking the buffer
        setTimeout(() => {
          const buffer = term.buffer.active
          console.log('Terminal buffer lines:', buffer.length)
          console.log('First line content:', buffer.getLine(0)?.translateToString())
          console.log('Second line content:', buffer.getLine(1)?.translateToString())
        }, 50)
        
      } catch (error) {
        console.error('Error writing test content:', error)
      }
    }, 200)

    // Create WebSocket connection / 创建WebSocket连接
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // Connect to backend port 1106 with /ws endpoint, not frontend port 1107 / 连接到后端端口1106的/ws端点，而不是前端端口1107
    const wsUrl = `${protocol}//localhost:1106/ws`
    const ws = new WebSocket(wsUrl)

    // WebSocket event handlers / WebSocket事件处理
    ws.onopen = () => {
      console.log(`WebSocket connected for terminal ${terminalId}`)
    }

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.terminalId === terminalId && message.type === 'output') {
        term.write(message.data)
      }
    }

    ws.onerror = (error) => {
      console.error(`WebSocket error for terminal ${terminalId}:`, error)
    }

    ws.onclose = () => {
      console.log(`WebSocket disconnected for terminal ${terminalId}`)
    }

    // Terminal data handling / 终端数据处理
    term.onData((data) => {
      sendTerminalInput(terminalId, data)
    })

    // Save instance / 保存实例
    terminalInstances.value.set(terminalId, { term, fitAddon, canvasAddon, ws })
    
    // Also store reference on DOM element for debugging / 也在DOM元素上存储引用以便调试
    container._xterm = term
    container._terminalInstance = { term, fitAddon, canvasAddon, ws }
    
    // Store in global window object for easier access / 存储在全局window对象中以便更容易访问
    if (!window.terminalDebugInstances) {
      window.terminalDebugInstances = new Map()
    }
    window.terminalDebugInstances.set(terminalId, { term, fitAddon, canvasAddon, ws })
    
    console.log(`Terminal instance saved for ${terminalId}`)
    console.log('Global terminal instances:', window.terminalDebugInstances)

    // Load historical output after a delay / 延迟加载历史输出
    setTimeout(async () => {
      await loadTerminalOutput(terminalId)
    }, 1000)

    // Listen for window resize / 监听窗口大小变化
    const resizeHandler = () => {
      const instance = terminalInstances.value.get(terminalId)
      if (instance) {
        instance.fitAddon.fit()
        // Also refresh canvas addon on resize / 在调整大小时也刷新canvas addon
        if (instance.canvasAddon) {
          instance.term.refresh(0, instance.term.rows - 1)
        }
      }
    }
    window.addEventListener('resize', resizeHandler)

    console.log(`Terminal initialization completed for ${terminalId}`)

  } catch (error) {
    console.error(`Failed to initialize terminal ${terminalId}:`, error)
  }
}

// Load terminal historical output / 加载终端历史输出
const loadTerminalOutput = async (terminalId: string) => {
  try {
    console.log(`Loading output for terminal ${terminalId}...`)
    
    // Wait a bit for terminal instance to be fully initialized / 等待一小段时间以确保终端实例完全初始化
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Use dynamic API service / 使用动态API服务
    const response = await terminalApi.readOutput(terminalId)
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Failed to load output for terminal ${terminalId}:`, errorText)
      throw new Error('Failed to load output')
    }
    const data = await response.json() as { output?: string }
    console.log(`Output data for terminal ${terminalId}:`, data)

    // 使用后端返回的完整输出内容，避免再次截断导致看不到真实历史
    // Use full backend output directly to avoid over-truncation hiding real history
    const output = data.output ?? ''

    // If there is no effective historical output, keep current terminal content / 如果没有有效历史输出，则保持当前终端内容不变
    if (!output || output.length === 0) {
      console.log(`No historical output for terminal ${terminalId}, keep current content`)
      return
    }

    // Get terminal instance and check if it's ready / 获取终端实例并检查是否就绪
    let retries = 0
    const maxRetries = 10
    let instance = terminalInstances.value.get(terminalId)
    
    while ((!instance || !instance.term) && retries < maxRetries) {
      console.log(`Waiting for terminal instance to be ready... (${retries + 1}/${maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, 100))
      instance = terminalInstances.value.get(terminalId)
      retries++
    }
    
    if (instance && instance.term && output && output.length > 0) {
      console.log(`Writing ${output.length} characters to terminal ${terminalId}`)
      
      // Clear terminal first and then write content
      instance.term.clear()
      instance.term.write(output)
      
      // Force terminal to refresh
      instance.term.refresh(0, instance.term.rows - 1)
      
      console.log(`Terminal content written successfully`)
    } else {
      console.log(`No output available for terminal ${terminalId} or instance not ready`)
      console.log(`Instance:`, !!instance)
      console.log(`Term:`, !!(instance && instance.term))
      console.log(`Output:`, !!(data && data.output))
      
      // If we have instance but no output, keep existing content / 没有历史输出时保持现有内容
    }
  } catch (error) {
    console.error(`Failed to load output for terminal ${terminalId}:`, error)
  }
}

// Send terminal input / 发送终端输入
const sendTerminalInput = async (terminalId: string, input: string) => {
  try {
    // Use dynamic API service / 使用动态API服务
    const response = await terminalApi.writeInput(terminalId, input)
    
    if (!response.ok) {
      throw new Error('Failed to send input')
    }
  } catch (error) {
    console.error(`Failed to send input to terminal ${terminalId}:`, error)
  }
}

// Switch terminal / 切换终端
const switchTerminal = (terminalId: string) => {
  activeTerminalId.value = terminalId
  initializeTerminal(terminalId)
}

// Clear terminal / 清空终端
const clearTerminal = (terminalId: string) => {
  const instance = terminalInstances.value.get(terminalId)
  if (instance && instance.term) {
    instance.term.clear()
  }
}

// Reconnect terminal / 重新连接终端
const reconnectTerminal = (terminalId: string) => {
  // Close existing connection / 关闭现有连接
  const instance = terminalInstances.value.get(terminalId)
  if (instance && instance.ws) {
    instance.ws.close()
  }
  if (instance && instance.term) {
    instance.term.dispose()
  }
  terminalInstances.value.delete(terminalId)
  
  // Re-initialize / 重新初始化
  initializeTerminal(terminalId)
}

// Toggle sidebar / 切换侧边栏
const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

// Helper functions / 辅助函数
const getStatusSeverity = (status: string) => {
  switch (status) {
    case 'active':
      return 'success'
    case 'inactive':
      return 'warning'
    case 'terminated':
      return 'danger'
    default:
      return 'info'
  }
}

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

// Watchers / 监听器
watch(refreshTrigger, () => {
  fetchTerminals()
})

watch(() => activeTerminalId.value, (newId) => {
  if (newId) {
    initializeTerminal(newId)
  }
})

// Lifecycle hooks / 生命周期钩子
onMounted(async () => {
  try {
    // Initialize API service first / 首先初始化API服务
    await initializeApiService()
    console.log('API service initialized, fetching terminals...')
    fetchTerminals()

    // Start periodic refresh to detect newly created terminals automatically
    // 启动周期性刷新以自动检测新创建的终端
    terminalsRefreshTimer = setInterval(() => {
      terminalStore.refreshTerminals()
    }, 5000)
  } catch (error) {
    console.error('Failed to initialize API service:', error)
    // Show a clear bilingual toast when API init fails / 当 API 初始化失败时显示清晰的中英文提示
    toast.error('Failed to initialize API service / 无法初始化后端 API 服务，请确认 1106 端口的后端已启动。')
    isLoading.value = false
  }
})

onUnmounted(() => {
  // Clean up all terminal instances / 清理所有终端实例
  terminalInstances.value.forEach((instance) => {
    if (instance.ws) {
      instance.ws.close()
    }
    if (instance.term) {
      instance.term.dispose()
    }
  })
  terminalInstances.value.clear()

  // Clear periodic refresh timer / 清理终端列表刷新定时器
  if (terminalsRefreshTimer) {
    clearInterval(terminalsRefreshTimer)
    terminalsRefreshTimer = null
  }
})

// Watch terminal list changes, auto-initialize new terminals / 监听终端列表变化，自动初始化新终端
watch(terminals, (newTerminals) => {
  if (newTerminals.length > 0 && !activeTerminalId.value) {
    activeTerminalId.value = newTerminals[0].id
  }
}, { deep: true })
</script>

<template>
  <div class="luxury-home-container flex flex-col overflow-hidden">
    <!-- Global toast container at top center / 顶部居中的全局消息提示容器 -->
    <Toaster position="top-center" />
    
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
            <!-- Render a dedicated container for each terminal and toggle visibility by activeTerminalId -->
            <!-- 为每个终端渲染独立容器，通过 activeTerminalId 切换可见性 -->
            <div
              v-for="terminal in terminals"
              :key="terminal.id"
              v-show="terminal.id === activeTerminalId"
              :id="`terminal-${terminal.id}`"
              class="w-full h-full luxury-terminal-viewport"
            ></div>
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
  min-height: 100%;
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
  /* Add slight padding to keep inner headers visually separated from the global top navigation
     为内部终端头部增加适当内边距，避免被全局顶部导航在视觉上压住 */
  padding-top: 0.75rem;
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

/* Luxury xterm.js styles aligned with 1Panel (visual only) / 参考 1Panel 的奢华 xterm.js 样式（仅视觉，不改字体度量） */
:deep(.xterm) {
  height: 100% !important;
  padding: 8px !important;
  background: #000000 !important;
  border-radius: 0.5rem !important;
  color: #ffffff !important;
}

:deep(.xterm-viewport) {
  background: #000000 !important;
  border-radius: 0.5rem !important;
}

:deep(.xterm-screen) {
  background: #000000 !important;
  border-radius: 0.5rem !important;
}

:deep(.xterm-selection) {
  background: var(--luxury-gold) !important;
  opacity: 0.3 !important;
}

/* Ensure xterm-rows text remains visible without breaking xterm layout engine
   在不破坏 xterm 布局引擎的前提下，确保 xterm-rows 文本可见 */
:deep(.xterm-rows) {
  z-index: 1 !important;
}

:deep(.xterm-rows > div) {
  visibility: visible !important;
  opacity: 1 !important;
  color: #ffffff !important;
}

/* Hide xterm.js helper elements / 隐藏xterm.js辅助元素 */
/* Let global styles and xterm defaults handle helper elements to avoid breaking measurement */

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
