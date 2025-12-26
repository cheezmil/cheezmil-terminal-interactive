import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export const useTerminalStore = defineStore('terminal', () => {
  // 状态
  const refreshTrigger = ref(0)
  const terminals = ref<any[]>([])
  // Tab 搜索关键字（用于快速定位终端）/ Tab search keyword (for quick terminal lookup)
  const tabSearchQuery = ref('')
  // 置顶终端 ID 列表（持久化）/ Pinned terminal IDs (persisted)
  const pinnedTerminalIds = ref<string[]>([])
  // 终端输出缓存（按 terminalId 索引）/ Terminal output cache (indexed by terminalId)
  const terminalOutputs = ref<Record<string, string>>({})
  // 是否自动滚动到底部（按 terminalId 索引，持久化）/
  // Auto-scroll-to-bottom flag (indexed by terminalId, persisted)
  const terminalAutoScroll = ref<Record<string, boolean>>({})

  // 本地存储键名 / LocalStorage key
  const OUTPUTS_STORAGE_KEY = 'cti.terminalOutputs.v1'
  const PINNED_STORAGE_KEY = 'cti.pinnedTerminals.v1'
  const AUTO_SCROLL_STORAGE_KEY = 'cti.terminalAutoScroll.v1'

  // 初始化时从 localStorage 恢复缓存 / Restore cached outputs from localStorage on init
  try {
    const raw = localStorage.getItem(OUTPUTS_STORAGE_KEY)
    if (raw) {
      terminalOutputs.value = JSON.parse(raw) as Record<string, string>
    }
  } catch (error) {
    console.warn('Failed to restore terminal outputs cache:', error)
  }

  // 初始化时从 localStorage 恢复置顶列表 / Restore pinned list from localStorage on init
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        pinnedTerminalIds.value = parsed.filter((v) => typeof v === 'string')
      }
    }
  } catch (error) {
    console.warn('Failed to restore pinned terminals:', error)
  }

  // 初始化时从 localStorage 恢复自动滚动开关 / Restore auto-scroll toggles from localStorage on init
  try {
    const raw = localStorage.getItem(AUTO_SCROLL_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object') {
        terminalAutoScroll.value = parsed as Record<string, boolean>
      }
    }
  } catch (error) {
    console.warn('Failed to restore terminal auto-scroll settings:', error)
  }

  // 计算属性 - 统计数据
  const stats = computed(() => ({
    total: terminals.value.length,
    active: terminals.value.filter(t => t.status === 'active').length,
    inactive: terminals.value.filter(t => t.status === 'inactive').length,
    terminated: terminals.value.filter(t => t.status === 'terminated').length
  }))

  // 动作
  const refreshTerminals = () => {
    refreshTrigger.value++
  }

  const setTabSearchQuery = (value: string) => {
    tabSearchQuery.value = value ?? ''
  }

  const isPinned = (terminalId: string) => {
    return pinnedTerminalIds.value.includes(terminalId)
  }

  const togglePin = (terminalId: string) => {
    if (!terminalId) return
    if (isPinned(terminalId)) {
      pinnedTerminalIds.value = pinnedTerminalIds.value.filter((id) => id !== terminalId)
    } else {
      pinnedTerminalIds.value = [terminalId, ...pinnedTerminalIds.value]
    }
  }

  const updateTerminals = (newTerminals: any[]) => {
    terminals.value = newTerminals
  }

  // 获取自动滚动开关 / Get auto-scroll toggle
  const getTerminalAutoScroll = (terminalId: string, defaultValue = true) => {
    if (!terminalId) return defaultValue
    const v = terminalAutoScroll.value[terminalId]
    return typeof v === 'boolean' ? v : defaultValue
  }

  // 若不存在则初始化自动滚动开关 / Ensure auto-scroll toggle exists (initialize when missing)
  const ensureTerminalAutoScroll = (terminalId: string, defaultValue = true) => {
    if (!terminalId) return
    if (typeof terminalAutoScroll.value[terminalId] !== 'boolean') {
      terminalAutoScroll.value[terminalId] = defaultValue
    }
  }

  // 设置自动滚动开关 / Set auto-scroll toggle
  const setTerminalAutoScroll = (terminalId: string, value: boolean) => {
    if (!terminalId) return
    terminalAutoScroll.value[terminalId] = Boolean(value)
  }

  // 获取缓存的终端输出 / Get cached output for a terminal
  const getTerminalOutput = (terminalId: string) => {
    return terminalOutputs.value[terminalId] || ''
  }

  // 设置终端输出（用于历史加载）/ Set full output (used by history loading)
  const setTerminalOutput = (terminalId: string, output: string) => {
    // 限制最大缓存大小，避免 localStorage 过大（显示仍以 xterm 为准）/
    // Cap cache size to avoid huge localStorage (xterm remains the source of truth for display)
    const MAX_CHARS = 200000
    terminalOutputs.value[terminalId] = output.length > MAX_CHARS
      ? output.slice(-MAX_CHARS)
      : output
  }

  // 追加终端输出（用于实时 WS 数据）/ Append output (used by realtime WS data)
  const appendTerminalOutput = (terminalId: string, chunk: string) => {
    const prev = terminalOutputs.value[terminalId] || ''
    const next = prev + chunk
    // 限制最大缓存大小，避免 localStorage 过大 / Cap cache size to avoid huge localStorage
    const MAX_CHARS = 200000
    terminalOutputs.value[terminalId] = next.length > MAX_CHARS
      ? next.slice(-MAX_CHARS)
      : next
  }

  // 监听缓存变化并持久化（轻量级节流）/ Watch cache changes and persist (lightweight debounce)
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  watch(terminalOutputs, (newValue) => {
    if (persistTimer) {
      clearTimeout(persistTimer)
    }
    persistTimer = setTimeout(() => {
      try {
        localStorage.setItem(OUTPUTS_STORAGE_KEY, JSON.stringify(newValue))
      } catch (error) {
        console.warn('Failed to persist terminal outputs cache:', error)
      }
    }, 300)
  }, { deep: true })

  // 监听置顶列表变化并持久化 / Persist pinned list on changes
  watch(pinnedTerminalIds, (value) => {
    try {
      localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(value))
    } catch (error) {
      console.warn('Failed to persist pinned terminals:', error)
    }
  }, { deep: true })

  // 监听自动滚动开关变化并持久化 / Persist auto-scroll toggles on changes
  watch(terminalAutoScroll, (value) => {
    try {
      localStorage.setItem(AUTO_SCROLL_STORAGE_KEY, JSON.stringify(value))
    } catch (error) {
      console.warn('Failed to persist terminal auto-scroll settings:', error)
    }
  }, { deep: true })

  return {
    // 状态
    refreshTrigger,
    terminals,
    tabSearchQuery,
    pinnedTerminalIds,
    terminalOutputs,
    terminalAutoScroll,
    // 计算属性
    stats,
    // 动作
    refreshTerminals,
    updateTerminals,
    setTabSearchQuery,
    isPinned,
    togglePin,
    getTerminalAutoScroll,
    ensureTerminalAutoScroll,
    setTerminalAutoScroll,
    getTerminalOutput,
    setTerminalOutput,
    appendTerminalOutput
  }
})
