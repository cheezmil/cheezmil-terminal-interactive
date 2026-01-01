import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTerminalStore = defineStore('terminal', () => {
  // 状态
  const refreshTrigger = ref(0)
  const createTrigger = ref(0)
  const showCreateModal = ref(false)

  // 动作
  const refreshTerminals = () => {
    refreshTrigger.value++
  }

  const createNewTerminal = () => {
    createTrigger.value++
    showCreateModal.value = true
  }

  const closeCreateModal = () => {
    showCreateModal.value = false
  }

  return {
    // 状态
    refreshTrigger,
    createTrigger,
    showCreateModal,
    // 动作
    refreshTerminals,
    createNewTerminal,
    closeCreateModal
  }
})