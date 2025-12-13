import { defineStore } from 'pinia'
import { ref } from 'vue'
import { initializeApiService, settingsApi } from '../services/api-service'

// 设置接口定义 / Settings interface definition
interface Settings {
  language: string
  [key: string]: any // 允许动态配置项 / Allow dynamic configuration items
}

// 完整配置接口定义 / Complete configuration interface definition
interface ConfigData {
  server?: {
    host?: string
    port?: number
    cors?: {
      origin?: string[]
      credentials?: boolean
    }
  }
  terminal?: {
    defaultShell?: string
    fontSize?: number
    fontFamily?: string
    maxBufferSize?: number
    sessionTimeout?: number
    defaultEnv?: Record<string, string>
    // 是否允许前端控制终端（实验性）/ Whether to allow frontend to control terminals (experimental)
    enableUserControl?: boolean
  }
  mcp?: {
    enableDnsRebindingProtection?: boolean
    // 是否启用 MCP 服务器选择工具 / Whether to enable MCP server selection tool
    enableServerSelectionTool?: boolean
    // 被禁用的 MCP 工具名称列表 / Disabled MCP tool names list
    disabledTools?: string[]
    // 命令黑名单配置 / Command blacklist configuration
    commandBlacklist?: {
      // 是否不区分命令大小写 / Whether to ignore command case when matching
      caseInsensitive?: boolean
      // 被禁用的命令规则列表 / Disabled command rules list
      rules?: Array<{
        command: string
        message?: string
      }>
    }
    allowedHosts?: string[]
  }
  logging?: {
    level?: string
    enableConsole?: boolean
    enableFile?: boolean
    filePath?: string
  }
  app?: {
    name?: string
    language?: string
    version?: string
    // 是否显示顶部应用标题 / Whether to show top app title
    showTitle?: boolean
  }
  [key: string]: any // 允许其他配置项 / Allow other configuration items
}

export const useSettingsStore = defineStore('settings', () => {
  // 状态
  const language = ref<string>('zh')
  const isLoading = ref(false)
  const configData = ref<ConfigData>({}) // 存储完整配置数据 / Store complete configuration data

  // 加载设置 / Load settings
  const loadSettings = async (): Promise<void> => {
    try {
      isLoading.value = true
      
      // 从后端API加载设置 / Load settings from backend API
      try {
        // Initialize API service if not already done / 如果尚未初始化，则初始化API服务
        await initializeApiService()
        
        // Use dynamic API service / 使用动态API服务
        const response = await settingsApi.get()
        if (response.ok) {
          const settings: Settings = await response.json()
          if (settings.language) {
            language.value = settings.language
          }
        }
      } catch (error) {
        console.warn('Failed to load settings from backend:', error)
        // 如果后端不可用，使用默认语言 / If backend is unavailable, use default language
        language.value = 'zh'
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  // 设置语言 / Set language
  const setLanguage = async (newLanguage: string): Promise<void> => {
    try {
      isLoading.value = true
      
      // 更新本地状态 / Update local state
      language.value = newLanguage
      
      // 保存到后端配置文件 / Save to backend configuration file
      try {
        // Use dynamic API service / 使用动态API服务
        const response = await settingsApi.update({ language: newLanguage })

        if (!response.ok) {
          throw new Error('Failed to save settings to backend')
        }
      } catch (error) {
        console.error('Failed to save settings to backend:', error)
        throw error
      }
    } catch (error) {
      console.error('Failed to set language:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  // 获取完整配置 / Get complete configuration
  const loadFullConfig = async (): Promise<void> => {
    try {
      isLoading.value = true
      
      // 从后端API获取完整配置 / Get complete configuration from backend API
      try {
        // Use dynamic API service / 使用动态API服务
        const response = await settingsApi.get()
        if (response.ok) {
          const config: ConfigData = await response.json()
          configData.value = config
          // 如果配置中有语言设置，更新语言 / If there's language setting in config, update language
          if (config.app?.language) {
            language.value = config.app.language
          }
        }
      } catch (error) {
        console.warn('Failed to load full config from backend:', error)
        // 如果后端不可用，则保留现有前端配置结构，避免将其重置为空对象导致界面报错
        // If backend is unavailable, keep existing frontend config structure instead of resetting to empty object
      }
    } catch (error) {
      console.error('Failed to load full config:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  // 保存完整配置 / Save complete configuration
  const saveFullConfig = async (config: ConfigData): Promise<void> => {
    try {
      isLoading.value = true
      
      // 保存到后端配置文件 / Save to backend configuration file
      try {
        // Use dynamic API service / 使用动态API服务
        const response = await settingsApi.save(config)

        if (!response.ok) {
          throw new Error('Failed to save full config to backend')
        }
        
        // 更新本地状态 / Update local state
        configData.value = { ...config }
        
        // 如果配置中有语言设置，更新语言 / If there's language setting in config, update language
        if (config.app?.language) {
          language.value = config.app.language
        }
      } catch (error) {
        console.error('Failed to save full config to backend:', error)
        throw error
      }
    } catch (error) {
      console.error('Failed to save full config:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  // 重置设置 / Reset settings
  const resetSettings = async (): Promise<void> => {
    try {
      isLoading.value = true
      
      // 重置为默认值 / Reset to default values
      language.value = 'zh'
      configData.value = {}
      
      // 重置后端设置 / Reset backend settings
      try {
        // Use dynamic API service / 使用动态API服务
        const response = await settingsApi.reset()

        if (!response.ok) {
          throw new Error('Failed to reset settings on backend')
        }
        
        // 重新加载默认配置 / Reload default configuration
        await loadFullConfig()
      } catch (error) {
        console.error('Failed to reset settings on backend:', error)
        throw error
      }
    } catch (error) {
      console.error('Failed to reset settings:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  return {
    // 状态
    language,
    isLoading,
    configData,
    // 动作
    loadSettings,
    setLanguage,
    loadFullConfig,
    saveFullConfig,
    resetSettings
  }
})
