<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'vue-sonner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { useSettingsStore } from '../stores/settings'

const router = useRouter()
const { t, locale } = useI18n()
const settingsStore = useSettingsStore()

// 语言选项 / Language options
const languageOptions = [
  { value: 'zh', label: t('settings.chinese') },
  { value: 'en', label: t('settings.english') }
]

// 配置数据 / Configuration data
const configData = ref<any>({
  language: 'zh',
  server: {
    host: '127.0.0.1',
    port: 1106,
    cors: {
      origin: ['http://localhost:1107', 'http://127.0.0.1:1107'],
      credentials: true
    }
  },
  terminal: {
    defaultShell: 'pwsh.exe',
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    maxBufferSize: 10000,
    sessionTimeout: 86400000,
    // 是否允许前端控制终端（实验性）/ Whether to allow frontend to control terminals (experimental)
    enableUserControl: false
  },
  mcp: {
    enableDnsRebindingProtection: false,
    // 是否启用 MCP 服务器选择工具 / Whether to enable MCP server selection tool
    enableServerSelectionTool: true,
    // 被禁用的 MCP 工具名称列表 / Disabled MCP tool names list
    disabledTools: [],
    allowedHosts: ['127.0.0.1', 'localhost', 'localhost:1106']
  },
  logging: {
    level: 'info',
    enableConsole: true,
    enableFile: false,
    filePath: './logs/app.log'
  },
  app: {
    // 是否显示顶部标题 / Whether to show top app title
    showTitle: true
  }
})

// 默认配置模板，用于在后端返回不完整或空配置时填充缺失字段
// Default configuration template, used to fill missing fields when backend returns partial or empty config
const defaultConfigTemplate = JSON.parse(JSON.stringify(configData.value))
const originalConfigData = ref<any>({})
const isLoading = ref(false)
const hasChanges = ref(false)

// 对话框状态 / Dialog state
const showResetDialog = ref(false)

// 当前选择的语言 / Current selected language
const selectedLanguage = computed({
  get: () => configData.value.language || locale.value,
  set: (value: string) => {
    configData.value.language = value
    hasChanges.value = true
  }
})

// 返回首页 / Go back to home
const goBack = () => {
  router.push('/')
}

// 加载配置 / Load configuration
const loadConfiguration = async () => {
  try {
    isLoading.value = true
    await settingsStore.loadFullConfig()

    // 使用前端默认模板与后端返回配置深度合并，确保嵌套对象始终存在
    // Deep-merge frontend default template with backend config to ensure nested objects always exist
    const backendConfig = JSON.parse(JSON.stringify(settingsStore.configData || {}))
    const mergedConfig: any = {
      ...defaultConfigTemplate,
      ...backendConfig,
      server: {
        ...defaultConfigTemplate.server,
        ...(backendConfig.server || {})
      },
      terminal: {
        ...defaultConfigTemplate.terminal,
        ...(backendConfig.terminal || {})
      },
      mcp: {
        ...defaultConfigTemplate.mcp,
        ...(backendConfig.mcp || {})
      },
      logging: {
        ...defaultConfigTemplate.logging,
        ...(backendConfig.logging || {})
      }
    }

    configData.value = mergedConfig
    originalConfigData.value = JSON.parse(JSON.stringify(mergedConfig))
    hasChanges.value = false
  } catch (error) {
    console.error('Failed to load configuration:', error)
    toast.error(t('common.error') + ': Failed to load configuration')
  } finally {
    isLoading.value = false
  }
}

// 保存配置 / Save configuration
const saveConfiguration = async () => {
  try {
    isLoading.value = true
    await settingsStore.saveFullConfig(configData.value)
    // 更新语言设置 / Update language setting
    if (configData.value.language) {
      // 避免页面重新加载，直接更新locale
      locale.value = configData.value.language
      localStorage.setItem('language', configData.value.language)
    }
    
    originalConfigData.value = JSON.parse(JSON.stringify(configData.value))
    hasChanges.value = false
    
    toast.success(t('common.success') + ': ' + t('settings.configSaved'))
  } catch (error) {
    console.error('Failed to save configuration:', error)
    toast.error(t('common.error') + ': Failed to save configuration')
  } finally {
    isLoading.value = false
  }
}

// 重置配置 / Reset configuration
const resetConfiguration = async () => {
  try {
    isLoading.value = true
    await settingsStore.resetSettings()
    await loadConfiguration()
    
    toast.success(t('common.success') + ': ' + t('settings.configReset'))
  } catch (error) {
    console.error('Failed to reset configuration:', error)
    toast.error(t('common.error') + ': Failed to reset configuration')
  } finally {
    isLoading.value = false
  }
}

// 确认重置 / Confirm reset
const confirmReset = () => {
  showResetDialog.value = true
}

// 拒绝重置 / Reject reset
const rejectReset = () => {
  showResetDialog.value = false
}

// 监听配置变化 / Watch for configuration changes
watch(configData, () => {
  hasChanges.value = JSON.stringify(configData.value) !== JSON.stringify(originalConfigData.value)
}, { deep: true })

// 初始化 / Initialize
onMounted(async () => {
  await loadConfiguration()
  
  // 添加鼠标滚轮事件监听器以修复滚动问题 / Add mouse wheel event listener to fix scrolling issue
  nextTick(() => {
    const scrollContainer = document.querySelector('.overflow-y-auto') as HTMLElement
    if (scrollContainer) {
      scrollContainer.addEventListener('wheel', function(e: WheelEvent) {
        e.preventDefault()
        scrollContainer.scrollTop += e.deltaY
      }, { passive: false })
    }
  })
})
</script>

<template>
  <div class="settings-page h-screen bg-jet-black text-text-primary relative luxury-settings-container flex flex-col">
    <!-- Settings toast container at top center / 设置页顶部居中的消息提示容器 -->
    <Toaster position="top-center" />
    <AlertDialog :open="showResetDialog" @update:open="showResetDialog = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('common.confirm') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('settings.resetConfirm') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="rejectReset">{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="resetConfiguration">{{ t('common.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    
    <!-- 奢华页面头部 / Luxury page header -->
    <div class="luxury-header animate-slide-up">
      <div class="w-full px-6 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-4">
            <Button
              variant="outline"
              class="luxury-back-button"
              @click="goBack"
            >
              <svg class="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {{ t('settings.backToHome') }}
            </Button>
            <h1 class="text-2xl font-bold font-serif-luxury bg-gradient-luxury bg-clip-text text-transparent">{{ t('settings.title') }}</h1>
          </div>
          
          <!-- 奢华操作按钮 / Luxury action buttons -->
          <div class="flex items-center space-x-3">
            <Button
              variant="outline"
              class="luxury-reset-button"
              @click="confirmReset"
              :disabled="isLoading"
            >
              <svg class="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ t('settings.reset') }}
            </Button>
            <Button
              class="luxury-save-button"
              @click="saveConfiguration"
              :disabled="!hasChanges || isLoading"
            >
              <svg v-if="isLoading" class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <svg v-else class="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V2" />
              </svg>
              {{ t('settings.save') }}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 设置内容 / Settings content -->
    <div class="w-full px-4 py-10 overflow-y-auto flex-1" v-if="!isLoading">
      <div class="space-y-8">
        <!-- 奢华应用配置 / Luxury application configuration -->
        <Card class="luxury-card border border-luxury-gold hover:shadow-luxury hover:border-rose-gold transition-all duration-300 animate-fade-in group">
          <CardHeader>
            <CardTitle>
              <div class="flex items-center space-x-2">
                <svg class="w-5 h-5 text-luxury-gold" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span class="text-text-primary font-semibold font-serif-luxury">{{ t('settings.appConfig') }}</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-6">
              <!-- 语言配置 / Language configuration -->
              <div class="flex flex-col space-y-2">
                <Label class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-luxury-gold" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.language') }}</span>
                </Label>
                <RadioGroup v-model="selectedLanguage" class="space-y-3">
                  <div
                    v-for="option in languageOptions"
                    :key="option.value"
                    class="flex items-center space-x-3 p-3 rounded-lg bg-charcoal border border-luxury-gold hover:bg-luxury-glass transition-colors duration-200 luxury-language-option cursor-pointer"
                    @click="selectedLanguage = option.value"
                  >
                    <RadioGroupItem :id="`lang-${option.value}`" :value="option.value" />
                    <Label :for="`lang-${option.value}`" class="text-text-primary cursor-pointer">
                      {{ option.label }}
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <!-- 顶部标题显示开关 / Top title visibility toggle -->
              <div class="flex flex-col space-y-2">
                <Label class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-luxury-gold" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h10M4 14h8" />
                  </svg>
                  <span class="font-serif-luxury">顶部标题显示 / Top title visibility</span>
                </Label>
                <div class="flex items-center">
                  <label class="luxury-checkbox-container">
                    <!-- 使用 app.showTitle 控制顶部标题显示 / Use app.showTitle to control top title visibility -->
                    <input
                      type="checkbox"
                      v-model="configData.app.showTitle"
                      class="luxury-checkbox"
                    />
                    <span class="luxury-checkbox-slider"></span>
                  </label>
                  <span class="ml-3 text-text-primary select-none">
                    {{ configData.app.showTitle ? 'Shown / 显示' : 'Hidden / 隐藏' }}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 奢华服务器配置 / Luxury server configuration -->
        <Card class="luxury-card border border-rose-gold hover:shadow-luxury hover:border-luxury-gold transition-all duration-300 animate-fade-in group">
          <CardHeader>
            <CardTitle>
              <div class="flex items-center space-x-2">
                <svg class="w-5 h-5 text-rose-gold" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
                <span class="text-text-primary font-semibold font-serif-luxury">{{ t('settings.serverConfig') }}</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-6">
              <div class="flex flex-col space-y-2">
                <Label for="host" class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-rose-gold" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.host') }}</span>
                </Label>
                <Input
                  id="host"
                  v-model="configData.server.host"
                  class="w-full max-w-md bg-charcoal border-rose-gold text-text-primary focus:border-luxury-gold luxury-input"
                  placeholder="127.0.0.1"
                />
              </div>
              
              <div class="flex flex-col space-y-2">
                <Label for="port" class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-rose-gold" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.port') }}</span>
                </Label>
                <Input
                  id="port"
                  v-model="configData.server.port"
                  type="number"
                  class="w-full max-w-md bg-charcoal border-rose-gold text-text-primary focus:border-luxury-gold luxury-input"
                  :min="1"
                  :max="65535"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 奢华终端配置 / Luxury terminal configuration -->
        <Card class="luxury-card border border-platinum hover:shadow-luxury hover:border-luxury-gold transition-all duration-300 animate-fade-in group">
          <CardHeader>
            <CardTitle>
              <div class="flex items-center space-x-2">
                <svg class="w-5 h-5 text-platinum" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span class="text-text-primary font-semibold font-serif-luxury">{{ t('settings.terminalConfig') }}</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-6">
              <div class="flex flex-col space-y-2">
                <Label for="defaultShell" class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-neon-green" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.defaultShell') }}</span>
                </Label>
                <Input
                  id="defaultShell"
                  v-model="configData.terminal.defaultShell"
                  class="w-full max-w-md bg-charcoal border-border-dark text-text-primary focus:border-neon-green luxury-input"
                  placeholder="pwsh.exe"
                />
              </div>
              
              <div class="flex flex-col space-y-2">
                <Label for="fontSize" class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-neon-green" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.fontSize') }}</span>
                </Label>
                <Input
                  id="fontSize"
                  v-model="configData.terminal.fontSize"
                  type="number"
                  class="w-full max-w-md bg-charcoal border-border-dark text-text-primary focus:border-neon-green luxury-input"
                  :min="8"
                  :max="72"
                />
              </div>
              
              <div class="flex flex-col space-y-2">
                <Label for="fontFamily" class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-neon-green" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.fontFamily') }}</span>
                </Label>
                <Input
                  id="fontFamily"
                  v-model="configData.terminal.fontFamily"
                  class="w-full max-w-md bg-charcoal border-border-dark text-text-primary focus:border-neon-green luxury-input"
                  placeholder="Consolas, 'Courier New', monospace"
                />
              </div>
              
              <div class="flex flex-col space-y-2">
                <Label for="maxBufferSize" class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-neon-green" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.maxBufferSize') }}</span>
                </Label>
                <Input
                  id="maxBufferSize"
                  v-model="configData.terminal.maxBufferSize"
                  type="number"
                  class="w-full max-w-md bg-charcoal border-border-dark text-text-primary focus:border-neon-green luxury-input"
                  :min="1000"
                  :max="100000"
                />
              </div>
              
              <div class="flex flex-col space-y-2">
                <Label for="sessionTimeout" class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-neon-green" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.sessionTimeout') }}</span>
                </Label>
                <Input
                  id="sessionTimeout"
                  v-model="configData.terminal.sessionTimeout"
                  type="number"
                  class="w-full max-w-md bg-charcoal border-border-dark text-text-primary focus:border-neon-green luxury-input"
                  :min="60000"
                  :max="604800000"
                />
              </div>

              <!-- 实验性：前端终端控制开关 / Experimental: frontend terminal control toggle -->
              <div class="flex flex-col space-y-2">
                <Label class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-neon-green" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span class="font-serif-luxury">实验性：允许前端控制终端 / Experimental: allow frontend to control terminals</span>
                </Label>
                <p class="text-sm text-text-secondary">
                  当前为实验功能，关闭时前端只能查看输出，不能发送命令或终止终端。
                  / This is an experimental feature. When disabled, the frontend becomes read-only: it cannot send commands or terminate terminals.
                </p>
                <div class="flex items-center">
                  <label class="luxury-checkbox-container">
                    <input
                      type="checkbox"
                      v-model="configData.terminal.enableUserControl"
                      class="luxury-checkbox"
                    />
                    <span class="luxury-checkbox-slider"></span>
                  </label>
                  <span class="ml-3 text-text-primary select-none">
                    {{ configData.terminal.enableUserControl ? 'Enabled / 已启用' : 'Disabled / 已禁用' }}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- MCP配置 / MCP configuration -->
        <Card class="luxury-card border border-accent-cyan hover:shadow-luxury hover:border-luxury-gold transition-all duration-300 animate-fade-in group">
          <CardHeader>
            <CardTitle>
              <div class="flex items-center space-x-2">
                <svg class="w-5 h-5 text-accent-cyan" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span class="text-text-primary font-semibold font-serif-luxury">{{ t('settings.mcpConfig') }}</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-6">
              <div class="flex flex-col space-y-2">
                <Label class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-accent-cyan" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.enableDnsRebindingProtection') }}</span>
                </Label>
                <div class="flex items-center">
                  <label class="luxury-checkbox-container">
                    <input
                      type="checkbox"
                      v-model="configData.mcp.enableDnsRebindingProtection"
                      class="luxury-checkbox"
                    />
                    <span class="luxury-checkbox-slider"></span>
                  </label>
                  <span class="ml-3 text-text-primary select-none">{{ configData.mcp.enableDnsRebindingProtection ? 'Enabled' : 'Disabled' }}</span>
                </div>
              </div>

              <div class="flex flex-col space-y-2">
                <Label class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-accent-cyan" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.enableServerSelectionTool') }}</span>
                </Label>
                <div class="flex items-center">
                  <label class="luxury-checkbox-container">
                    <input
                      type="checkbox"
                      v-model="configData.mcp.enableServerSelectionTool"
                      class="luxury-checkbox"
                    />
                    <span class="luxury-checkbox-slider"></span>
                  </label>
                  <span class="ml-3 text-text-primary select-none">{{ configData.mcp.enableServerSelectionTool ? 'Enabled' : 'Disabled' }}</span>
                </div>
              </div>
              
              <div class="flex flex-col space-y-2">
                <Label class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-accent-cyan" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.disabledTools') }}</span>
                </Label>
                <div class="space-y-2">
                  <div
                    v-for="(tool, index) in configData.mcp.disabledTools"
                    :key="index"
                    class="flex items-center space-x-2"
                  >
                    <Input
                      v-model="configData.mcp.disabledTools[index]"
                      class="flex-1 bg-charcoal border-border-dark text-text-primary focus:border-accent-cyan luxury-input"
                      placeholder="fix_bug_with_codex"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      class="luxury-delete-button"
                      @click="configData.mcp.disabledTools.splice(index, 1)"
                    >
                      <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    class="luxury-add-button-cyan"
                    @click="configData.mcp.disabledTools.push('')"
                  >
                    <svg class="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    {{ t('common.create') }}
                  </Button>
                </div>
              </div>
              
              <div class="flex flex-col space-y-2">
                <Label class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-accent-cyan" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.allowedHosts') }}</span>
                </Label>
                <div class="space-y-2">
                  <div
                    v-for="(host, index) in configData.mcp.allowedHosts"
                    :key="index"
                    class="flex items-center space-x-2"
                  >
                    <Input
                      v-model="configData.mcp.allowedHosts[index]"
                      class="flex-1 bg-charcoal border-border-dark text-text-primary focus:border-accent-cyan luxury-input"
                      placeholder="127.0.0.1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      class="luxury-delete-button"
                      @click="configData.mcp.allowedHosts.splice(index, 1)"
                    >
                      <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    class="luxury-add-button-cyan"
                    @click="configData.mcp.allowedHosts.push('')"
                  >
                    <svg class="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    {{ t('common.create') }}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 日志配置 / Logging configuration -->
        <Card class="luxury-card border border-accent-violet hover:shadow-luxury hover:border-luxury-gold transition-all duration-300 animate-fade-in group">
          <CardHeader>
            <CardTitle>
              <div class="flex items-center space-x-2">
                <svg class="w-5 h-5 text-accent-violet" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span class="text-text-primary font-semibold font-serif-luxury">{{ t('settings.loggingConfig') }}</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-6">
              <div class="flex flex-col space-y-2">
                <Label for="logLevel" class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-accent-violet" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.logLevel') }}</span>
                </Label>
                <Input
                  id="logLevel"
                  v-model="configData.logging.level"
                  class="w-full max-w-md bg-charcoal border-border-dark text-text-primary focus:border-accent-violet luxury-input"
                  placeholder="info"
                />
              </div>
              
              <div class="flex flex-col space-y-2">
                <Label class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-accent-violet" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.enableConsole') }}</span>
                </Label>
                <div class="flex items-center">
                  <label class="luxury-checkbox-container">
                    <input
                      type="checkbox"
                      v-model="configData.logging.enableConsole"
                      class="luxury-checkbox"
                    />
                    <span class="luxury-checkbox-slider"></span>
                  </label>
                  <span class="ml-3 text-text-primary select-none">{{ configData.logging.enableConsole ? 'Enabled' : 'Disabled' }}</span>
                </div>
              </div>
              
              <div class="flex flex-col space-y-2">
                <Label class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-accent-violet" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.enableFile') }}</span>
                </Label>
                <div class="flex items-center">
                  <label class="luxury-checkbox-container">
                    <input
                      type="checkbox"
                      v-model="configData.logging.enableFile"
                      class="luxury-checkbox"
                    />
                    <span class="luxury-checkbox-slider"></span>
                  </label>
                  <span class="ml-3 text-text-primary select-none">{{ configData.logging.enableFile ? 'Enabled' : 'Disabled' }}</span>
                </div>
              </div>
              
              <div class="flex flex-col space-y-2" v-if="configData.logging.enableFile">
                <Label for="filePath" class="flex items-center space-x-2 text-text-primary font-medium">
                  <svg class="w-4 h-4 text-accent-violet" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span class="font-serif-luxury">{{ t('settings.filePath') }}</span>
                </Label>
                <Input
                  id="filePath"
                  v-model="configData.logging.filePath"
                  class="w-full max-w-md bg-charcoal border-border-dark text-text-primary focus:border-accent-violet luxury-input"
                  placeholder="./logs/app.log"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- 奢华加载状态 / Luxury loading state -->
    <div v-else class="flex items-center justify-center min-h-96">
      <div class="text-center animate-fade-in">
        <div class="text-4xl text-luxury-gold mb-4">
          <i class="pi pi-spin pi-spinner"></i>
        </div>
        <p class="text-text-secondary text-lg font-serif-luxury">{{ t('common.loading') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 奢华设置页面特有样式 / Luxury SettingsView specific styles */

/* 奢华卡片样式 / Luxury card styles */
.luxury-card {
  background: var(--luxury-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--luxury-gold);
  border-radius: 1rem;
  box-shadow: var(--multi-shadow);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.luxury-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--luxury-glow);
  border-color: var(--rose-gold);
}

/* 奢华输入框样式 / Luxury input styles */
.luxury-input {
  background: var(--charcoal);
  border: 1px solid var(--luxury-gold);
  border-radius: 0.5rem;
  color: var(--text-primary);
  transition: all 0.3s ease;
}

.luxury-input:focus {
  border-color: var(--luxury-gold);
  box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.2);
  outline: none;
}

/* 奢华按钮样式 / Luxury button styles */
.luxury-back-button {
  width: auto !important;
  height: 2.5rem !important;
  background: rgba(212, 175, 55, 0.05) !important;
  border: 1px solid rgba(212, 175, 55, 0.2) !important;
  color: var(--text-secondary) !important;
  border-radius: 0.5rem !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.luxury-back-button:hover {
  background: rgba(212, 175, 55, 0.1) !important;
  border-color: var(--luxury-gold) !important;
  color: var(--luxury-gold) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3) !important;
}

.luxury-back-button .p-button-icon {
  margin-right: 0.75rem !important;
}

/* 确保按钮图标和文字之间有适当的间距 */
.luxury-back-button .p-button-label {
  margin-left: 0.75rem !important;
}

/* 针对所有文本按钮的通用样式 */
.p-button.p-button-text .p-button-icon {
  margin-right: 0.75rem !important;
}

.p-button.p-button-text .p-button-label {
  margin-left: 0.75rem !important;
}

.luxury-back-button.p-button .p-button-icon {
  margin-right: 0.75rem !important;
}

.luxury-back-button.p-button .p-button-label {
  margin-left: 0.75rem !important;
}

/* 修复所有按钮的图标和文字间距 / Fix icon and text spacing for all buttons */
.p-button .p-button-icon {
  margin-right: 0.5rem !important;
}

.p-button .p-button-label {
  margin-left: 0.5rem !important;
}

/* 确保按钮在有图标和文字时有适当的间距 / Ensure proper spacing for buttons with icons and text */
.p-button.p-button-icon-only .p-button-icon {
  margin-right: 0 !important;
  margin-left: 0 !important;
}

.p-button.p-button-text .p-button-icon {
  margin-right: 0.5rem !important;
}

.p-button.p-button-text .p-button-label {
  margin-left: 0.5rem !important;
}

/* 修复标题的间距问题 / Fix title spacing issues */
.font-serif-luxury {
  margin-left: 0.5rem !important;
}

.luxury-reset-button {
  width: auto !important;
  height: 2.5rem !important;
  background: rgba(239, 68, 68, 0.05) !important;
  border: 1px solid rgba(239, 68, 68, 0.2) !important;
  color: var(--text-secondary) !important;
  border-radius: 0.5rem !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.luxury-reset-button:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  border-color: var(--rose-gold) !important;
  color: var(--rose-gold) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3) !important;
}

.luxury-reset-button .p-button-icon {
  margin-right: 0.75rem !important;
}

.luxury-reset-button.p-button .p-button-icon {
  margin-right: 0.75rem !important;
}

.luxury-reset-button.p-button .p-button-label {
  margin-left: 0.75rem !important;
}

.luxury-save-button {
  width: auto !important;
  height: 2.5rem !important;
  background: var(--luxury-gold) !important;
  border: 1px solid var(--luxury-gold) !important;
  color: var(--jet-black) !important;
  border-radius: 0.5rem !important;
  font-weight: 600 !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.luxury-save-button:hover {
  background: var(--rose-gold) !important;
  border-color: var(--rose-gold) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3) !important;
}

.luxury-save-button .p-button-icon {
  margin-right: 0.75rem !important;
}

.luxury-save-button.p-button .p-button-icon {
  margin-right: 0.75rem !important;
}

.luxury-save-button.p-button .p-button-label {
  margin-left: 0.75rem !important;
}

.luxury-add-button {
  width: auto !important;
  height: 2rem !important;
  background: rgba(239, 68, 68, 0.05) !important;
  border: 1px solid var(--rose-gold) !important;
  color: var(--rose-gold) !important;
  border-radius: 0.375rem !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.luxury-add-button:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  border-color: var(--rose-gold) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3) !important;
}

.luxury-add-button .p-button-icon {
  margin-right: 0.5rem !important;
}

.luxury-add-button.p-button .p-button-icon {
  margin-right: 0.5rem !important;
}

.luxury-add-button.p-button .p-button-label {
  margin-left: 0.5rem !important;
}

.luxury-add-button-cyan {
  width: auto !important;
  height: 2rem !important;
  background: rgba(6, 182, 212, 0.05) !important;
  border: 1px solid var(--accent-cyan) !important;
  color: var(--accent-cyan) !important;
  border-radius: 0.375rem !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.luxury-add-button-cyan:hover {
  background: rgba(6, 182, 212, 0.1) !important;
  border-color: var(--accent-cyan) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 12px rgba(6, 182, 212, 0.3) !important;
}

.luxury-add-button-cyan .p-button-icon {
  margin-right: 0.5rem !important;
}

.luxury-add-button-cyan.p-button .p-button-icon {
  margin-right: 0.5rem !important;
}

.luxury-add-button-cyan.p-button .p-button-label {
  margin-left: 0.5rem !important;
}

.luxury-delete-button {
  width: 1.5rem !important;
  height: 1.5rem !important;
  background: rgba(239, 68, 68, 0.05) !important;
  border: 1px solid rgba(239, 68, 68, 0.2) !important;
  color: var(--text-muted) !important;
  border-radius: 0.375rem !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.luxury-delete-button:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  border-color: #ef4444 !important;
  color: #ef4444 !important;
  transform: scale(1.1) !important;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3) !important;
}

/* 奢华语言选项样式 / Luxury language option styles */
.luxury-language-option {
  background: var(--charcoal);
  border: 1px solid var(--luxury-gold);
  border-radius: 0.5rem;
  transition: all 0.3s ease;
}

.luxury-language-option:hover {
  background: var(--luxury-glass);
  border-color: var(--rose-gold);
  box-shadow: var(--luxury-shadow);
}

/* 响应式设计 / Responsive design */
@media (max-width: 768px) {
  .max-w-6xl {
    max-width: 100%;
  }
  
  .px-6 {
    padding-left: 1rem;
    padding-right: 1rem;
  }
  
  .py-8 {
    padding-top: 1.5rem;
    padding-bottom: 1.5rem;
  }
}

/* 减少动画偏好支持 / Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in,
  .animate-slide-up,
  .animate-luxury-float {
    animation: none;
    transition: none;
  }
}

/* 隐藏滚动条但保持滚动功能 / Hide scrollbar but keep scroll functionality */
.overflow-y-auto::-webkit-scrollbar {
  display: none;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.overflow-y-auto {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* 奢华自定义checkbox样式 / Luxury custom checkbox styles */
.luxury-checkbox-container {
  position: relative;
  display: inline-block;
  width: 3rem;
  height: 1.5rem;
  cursor: pointer;
}

.luxury-checkbox {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.luxury-checkbox-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #2a2a2a;
  border: 2px solid #4a4a4a;
  border-radius: 1.5rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
}

.luxury-checkbox-slider:before {
  position: absolute;
  content: "";
  height: 0.9rem;
  width: 0.9rem;
  left: 0.3rem;
  bottom: 0.3rem;
  background: linear-gradient(135deg, #d4af37, #f4e4c1);
  border-radius: 50%;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
}

.luxury-checkbox:checked + .luxury-checkbox-slider {
  background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
  border-color: var(--luxury-gold);
  box-shadow: 0 0 15px rgba(212, 175, 55, 0.4), inset 0 2px 4px rgba(0, 0, 0, 0.3);
}

.luxury-checkbox:checked + .luxury-checkbox-slider:before {
  transform: translateX(1.5rem);
  background: linear-gradient(135deg, #ffffff, #f4e4c1);
  box-shadow: 0 2px 8px rgba(212, 175, 55, 0.6);
}

.luxury-checkbox-slider:hover {
  border-color: var(--rose-gold);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 0 8px rgba(232, 180, 184, 0.3);
}

.luxury-checkbox:checked + .luxury-checkbox-slider:hover {
  background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
  border-color: var(--rose-gold);
  box-shadow: 0 0 20px rgba(232, 180, 184, 0.5), inset 0 2px 4px rgba(0, 0, 0, 0.3);
}

.luxury-checkbox-slider:hover:before {
  background: linear-gradient(135deg, #e8b484, #f4e4c1);
}
</style>
