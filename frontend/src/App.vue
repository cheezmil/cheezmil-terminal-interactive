<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRouter, useRoute } from 'vue-router'
import { useTerminalStore } from './stores/terminal'
import { useI18n } from 'vue-i18n'
import SvgIcon from '@/components/ui/svg-icon.vue'
import { useSettingsStore } from './stores/settings'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const isLoaded = ref(false)
const terminalStore = useTerminalStore()
const settingsStore = useSettingsStore()

// 版本信息（来自后端 /api/version）/ Version info from backend /api/version
const versionInfo = ref<{
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
} | null>(null)

// 是否显示顶部标题 - 从应用配置中读取 / Whether to show top title - read from app config
const showTitle = computed(() => {
  // 尽量从完整配置中读取 app.showTitle，默认为 true
  // Prefer reading app.showTitle from full config, default to true
  const appConfig = settingsStore.configData?.app as any | undefined
  if (appConfig && typeof appConfig.showTitle === 'boolean') {
    return appConfig.showTitle
  }
  return true
})

const createNewTerminal = () => {
  terminalStore.createNewTerminal()
}

// 顶部搜索框：快速定位 Tab / Top search: quick locate tabs
const tabSearchQuery = computed({
  get: () => terminalStore.tabSearchQuery,
  set: (value: string) => terminalStore.setTabSearchQuery(value)
})

// 导航到设置页面
const navigateToSettings = () => {
  router.push('/settings')
}

// 终结所有终端（只读模式也允许）/ Terminate all terminals (allowed even in read-only mode)
const killAllTerminals = async () => {
  const confirmed = window.confirm(t('app.confirmKillAllTerminals'))
  if (!confirmed) return

  try {
    const response = await fetch('http://localhost:1106/api/terminals/kill-all', { method: 'POST' })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    terminalStore.refreshTerminals()
  } catch (error) {
    console.warn('Failed to kill all terminals:', error)
    window.alert(t('app.killAllFailed'))
  }
}

const loadVersionInfo = async () => {
  try {
    const response = await fetch('http://localhost:1106/api/version', { method: 'GET' })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    const data = await response.json()
    versionInfo.value = {
      currentVersion: data.currentVersion || '0.0.0',
      latestVersion: data.latestVersion ?? null,
      updateAvailable: Boolean(data.updateAvailable)
    }
  } catch (error) {
    console.warn('Failed to load version info:', error)
    versionInfo.value = null
  }
}

onMounted(() => {
  // 页面加载完成后添加动画
  setTimeout(() => {
    isLoaded.value = true
  }, 100)

  // 尝试加载完整配置以便读取顶部标题设置 / Try to load full config to read top title setting
  settingsStore.loadFullConfig().catch((error) => {
    console.warn('Failed to load full settings for title visibility:', error)
  })

  // 拉取版本信息 / Fetch version info
  loadVersionInfo()
})
</script>

<template>
  <div class="app-container luxury-theme text-text-primary" :class="{ 'app-loaded': isLoaded }">

    <!-- 主内容区域 -->
    <div class="relative z-10 h-screen flex flex-col">
      <!-- 奢华顶部导航栏 - 只在首页显示 -->
      <header v-if="route.name === 'home'" class="luxury-header sticky top-0 z-50 animate-slide-up">
        <div class="w-full h-16 flex items-center justify-between px-4">
          <!-- 左侧：Logo和标题 / Left: logo and title -->
          <div class="flex items-center flex-shrink-0">
            <div class="luxury-logo-container rounded-lg flex items-center justify-center text-jet-black hover:scale-105 transition-transform duration-200 shadow-luxury" style="margin-right: 1rem;">
              <img src="/CTI.svg" alt="CTI Logo" class="w-6 h-6" />
            </div>

            <!-- 版本号放在最左侧图标右边 / Put version right next to the left icon -->
            <div class="text-xs text-text-secondary font-mono whitespace-nowrap mr-4">
              <span v-if="versionInfo">v{{ versionInfo.currentVersion }}</span>
              <span v-else>v0.0.0</span>
              <span v-if="versionInfo?.updateAvailable && versionInfo.latestVersion" class="text-amber-300 ml-2">
                {{ t('app.updateAvailable') }} v{{ versionInfo.latestVersion }}
              </span>
            </div>

            <h1
              v-if="showTitle"
              class="text-xl font-bold font-serif-luxury bg-gradient-luxury bg-clip-text text-transparent"
            >
              Cheezmil Terminal Interactive
            </h1>
          </div>
          
          <!-- 右侧：搜索、版本、终结全部、设置 / Right: search, version, kill-all, settings -->
          <div class="flex items-center gap-3 flex-shrink-0">
            <div class="hidden md:flex items-center gap-3">
              <div class="w-72">
                <Input
                  v-model="tabSearchQuery"
                  :placeholder="t('app.searchTabsPlaceholder')"
                  class="h-9 bg-black/30 border border-luxury-gold/30 text-text-primary placeholder:text-text-muted"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                class="h-9 border-rose-500/40 text-rose-200 hover:bg-rose-500/10"
                @click="killAllTerminals"
              >
                <SvgIcon name="stop" class="w-4 h-4 mr-2" />
                {{ t('app.killAll') }}
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              class="w-10 h-10 luxury-settings-button hover:text-luxury-gold transition-all duration-200 hover:rotate-90"
              @click="navigateToSettings"
            >
              <SvgIcon name="settings" class="w-5 h-5 text-luxury-gold" />
            </Button>
          </div>
        </div>
      </header>

      <!-- 页面内容 -->
      <main class="flex-1 min-h-0 overflow-hidden flex">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" class="flex-1 min-h-0" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* 奢华应用容器 */
.luxury-theme {
  height: 100vh;
  background: var(--jet-black);
  position: relative;
  font-family: var(--font-sans-luxury);
}

/* 奢华应用容器动画 */
  .luxury-theme {
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .app-loaded {
    opacity: 1;
    transform: translateY(0);
  }
  
  /* 奢华网格背景 */
  .luxury-grid-pattern {
    background-image:
      linear-gradient(rgba(212, 175, 55, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(212, 175, 55, 0.05) 1px, transparent 1px);
    background-size: 60px 60px;
  }
  
  /* 奢华金属纹理 */
  .luxury-metal-texture {
    background:
      radial-gradient(circle at 20% 80%, rgba(212, 175, 55, 0.03) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(232, 180, 184, 0.03) 0%, transparent 50%),
      radial-gradient(circle at 40% 40%, rgba(229, 228, 226, 0.02) 0%, transparent 50%);
  }
  
  /* 奢华头部样式 */
  .luxury-header {
    background: var(--luxury-glass);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--luxury-gold);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 1px 0 rgba(212, 175, 55, 0.1);
  }
  
  /* 奢华Logo容器 */
  .luxury-logo-container {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
    margin-left: 0 !important;
    position: relative;
    overflow: hidden;
    display: inline-block;
  }
  
  .luxury-logo-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    transition: left 0.6s;
  }
  
  .luxury-logo-container:hover::before {
    left: 100%;
  }
  
  /* 奢华统计项 */
  .luxury-stat-item {
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: rgba(212, 175, 55, 0.05);
    border: 1px solid rgba(212, 175, 55, 0.1);
    transition: all 0.3s ease;
  }
  
  .luxury-stat-item:hover {
    background: rgba(212, 175, 55, 0.1);
    border-color: var(--luxury-gold);
    transform: translateY(-1px);
  }
  
  /* 奢华设置按钮 */
  .luxury-settings-button {
    background: rgba(212, 175, 55, 0.05);
    border: 1px solid rgba(212, 175, 55, 0.1);
    border-radius: 50%;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .luxury-settings-button:hover {
    background: rgba(212, 175, 55, 0.1);
    border-color: var(--luxury-gold);
    box-shadow: 0 4px 12px rgba(212, 175, 55, 0.2);
  }
  
  /* 页面切换动画 */
  .page-enter-active,
  .page-leave-active {
    transition: all 0.3s ease;
  }
  
  .page-enter-from {
    opacity: 0;
    transform: translateX(20px);
  }
  
  .page-leave-to {
    opacity: 0;
    transform: translateX(-20px);
  }
  
  /* 响应式设计 */
  @media (max-width: 768px) {
    .luxury-theme h1 {
      font-size: 1.125rem;
    }
    
    .luxury-stat-item {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
    }
  }
  
  /* 高对比度模式支持 */
  @media (prefers-contrast: high) {
    .luxury-header {
      background: rgba(0, 0, 0, 0.9);
      border: 2px solid var(--luxury-gold);
    }
    
    .luxury-stat-item {
      background: rgba(212, 175, 55, 0.2);
      border: 1px solid var(--luxury-gold);
    }
  }
  
  /* 减少动画偏好支持 */
  @media (prefers-reduced-motion: reduce) {
    .luxury-theme,
    .luxury-header,
    .luxury-logo-container,
    .luxury-stat-item,
    .luxury-settings-button {
      animation: none;
      transition: none;
    }
  
    .page-enter-active,
    .page-leave-active {
      transition: none;
    }
  }
  </style>
  
  <style>
  /* 奢华全局样式重置和增强 */
  * {
    box-sizing: border-box;
  }
  
  html {
    scroll-behavior: smooth;
    height: 100%;
  }
  
  body {
    margin: 0;
    font-family: var(--font-sans-luxury);
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary);
    background-color: var(--jet-black);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    height: 100%;
    overflow: auto;
  }
  
  /* 奢华自定义滚动条 */
  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  
  ::-webkit-scrollbar-track {
    background: var(--charcoal);
    border-radius: 5px;
    border: 1px solid rgba(212, 175, 55, 0.1);
  }
  
  ::-webkit-scrollbar-thumb {
    background: linear-gradient(145deg, var(--luxury-gold), var(--rose-gold));
    border-radius: 5px;
    transition: all 0.3s ease;
    border: 1px solid rgba(212, 175, 55, 0.2);
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(145deg, var(--rose-gold), var(--bronze-gold));
    box-shadow: 0 2px 8px rgba(212, 175, 55, 0.3);
  }
  
  /* Firefox 奢华滚动条 */
  * {
    scrollbar-width: thin;
    scrollbar-color: var(--luxury-gold) var(--charcoal);
  }
  
  /* 奢华选择文本样式 */
  ::selection {
    background: var(--luxury-gold);
    color: var(--jet-black);
    text-shadow: none;
  }
  
  ::-moz-selection {
    background: var(--luxury-gold);
    color: var(--jet-black);
    text-shadow: none;
  }
  
  /* 奢华焦点样式 */
  :focus-visible {
    outline: 2px solid var(--luxury-gold);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px rgba(212, 175, 55, 0.2);
  }
  
  /* 奢华终端输出滚动条 */
  #terminal-output::-webkit-scrollbar {
    width: 10px;
  }
  
  #terminal-output::-webkit-scrollbar-track {
    background: var(--charcoal);
    border-radius: 5px;
    border: 1px solid rgba(212, 175, 55, 0.1);
  }
  
  #terminal-output::-webkit-scrollbar-thumb {
    background: linear-gradient(145deg, var(--luxury-gold), var(--rose-gold));
    border-radius: 5px;
    border: 1px solid rgba(212, 175, 55, 0.2);
  }
  
  #terminal-output::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(145deg, var(--rose-gold), var(--bronze-gold));
    box-shadow: 0 2px 8px rgba(212, 175, 55, 0.3);
  }
  
  /* 奢华全局按钮样式增强 - shadcn-vue兼容 */
  button {
    border-radius: 0.5rem;
    font-weight: 500;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  button:hover {
    transform: translateY(-1px);
  }
  
  /* 奢华输入框样式增强 - shadcn-vue兼容 */
  input, textarea {
    border-radius: 0.5rem;
    transition: all 0.3s ease;
  }
  
  input:focus, textarea:focus {
    box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.2);
  }
  
  /* 奢华卡片样式增强 - shadcn-vue兼容 */
  .card {
    border-radius: 1rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .card:hover {
    transform: translateY(-2px);
  }
  </style>
