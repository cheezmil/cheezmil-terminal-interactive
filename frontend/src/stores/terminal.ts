import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export const useTerminalStore = defineStore('terminal', () => {
  // 状态
  const refreshTrigger = ref(0)
  const terminals = ref<any[]>([])
  // 终端输出缓存（按 terminalId 索引）/ Terminal output cache (indexed by terminalId)
  const terminalOutputs = ref<Record<string, string>>({})

  // 本地存储键名 / LocalStorage key
  const OUTPUTS_STORAGE_KEY = 'cti.terminalOutputs.v1'

  // 初始化时从 localStorage 恢复缓存 / Restore cached outputs from localStorage on init
  try {
    const raw = localStorage.getItem(OUTPUTS_STORAGE_KEY)
    if (raw) {
      terminalOutputs.value = JSON.parse(raw) as Record<string, string>
    }
  } catch (error) {
    console.warn('Failed to restore terminal outputs cache:', error)
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


  const updateTerminals = (newTerminals: any[]) => {
    terminals.value = newTerminals
  }

  // 获取缓存的终端输出 / Get cached output for a terminal
  const getTerminalOutput = (terminalId: string) => {
    return terminalOutputs.value[terminalId] || ''
  }

  // 设置终端输出（用于历史加载）/ Set full output (used by history loading)
  const setTerminalOutput = (terminalId: string, output: string) => {
    terminalOutputs.value[terminalId] = output
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

  return {
    // 状态
    refreshTrigger,
    terminals,
    terminalOutputs,
    // 计算属性
    stats,
    // 动作
    refreshTerminals,
    updateTerminals,
    getTerminalOutput,
    setTerminalOutput,
    appendTerminalOutput
  }
})
