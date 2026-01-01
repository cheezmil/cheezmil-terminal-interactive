<script setup lang="ts">
import { ref, onMounted } from 'vue'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
import Button from 'primevue/button'
import { useTerminalStore } from './stores/terminal'

const isLoaded = ref(false)
const terminalStore = useTerminalStore()

const refreshTerminals = () => {
  terminalStore.refreshTerminals()
}

const createNewTerminal = () => {
  terminalStore.createNewTerminal()
}

onMounted(() => {
  // 页面加载完成后添加动画
  setTimeout(() => {
    isLoaded.value = true
  }, 100)
})
</script>

<template>
  <div class="app-container" :class="{ 'app-loaded': isLoaded }">
    <!-- 背景装饰元素 -->
    <div class="bg-decoration">
      <div class="bg-circle bg-circle-1"></div>
      <div class="bg-circle bg-circle-2"></div>
      <div class="bg-circle bg-circle-3"></div>
      <div class="bg-grid"></div>
    </div>

    <!-- 主内容区域 -->
    <div class="main-content">
      <!-- 顶部导航栏 -->
      <header class="app-header">
        <div class="header-content">
          <div class="logo-section">
            <div class="logo-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4h16v16H4z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M4 9h16M9 4v16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <h1 class="logo-text">Cheezmil Terminal Interactive</h1>
          </div>
          
          <div class="header-actions">
            <Button
              icon="pi pi-refresh"
              label="刷新"
              severity="secondary"
              class="modern-btn-secondary"
              @click="refreshTerminals"
            />
            <Button
              icon="pi pi-plus"
              label="创建新终端"
              severity="primary"
              class="modern-btn-primary"
              @click="createNewTerminal"
            />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <!-- 页面内容 -->
      <main class="app-main">
        <div class="page-wrapper">
          <router-view v-slot="{ Component }">
            <transition name="page" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* 应用容器 */
.app-container {
  min-height: 100vh;
  background: var(--bg-primary);
  position: relative;
  overflow-x: hidden;
  opacity: 0;
  transform: translateY(20px);
  transition: all var(--transition-slow);
}

.app-loaded {
  opacity: 1;
  transform: translateY(0);
}

/* 背景装饰 */
.bg-decoration {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.3;
  animation: float 20s ease-in-out infinite;
}

.bg-circle-1 {
  width: 400px;
  height: 400px;
  background: var(--primary-400);
  top: -200px;
  right: -200px;
  animation-delay: 0s;
}

.bg-circle-2 {
  width: 300px;
  height: 300px;
  background: var(--secondary-400);
  bottom: -150px;
  left: -150px;
  animation-delay: 5s;
}

.bg-circle-3 {
  width: 250px;
  height: 250px;
  background: var(--success-400);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: 10s;
}

.bg-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(148, 163, 184, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.05) 1px, transparent 1px);
  background-size: 50px 50px;
}

/* 主内容区域 */
.main-content {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 顶部导航栏 */
.app-header {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-light);
  position: sticky;
  top: 0;
  z-index: 100;
  animation: slideDown var(--transition-slow) ease-out;
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-lg);
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 70px;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: var(--spacing);
}

.logo-icon {
  width: 40px;
  height: 40px;
  background: var(--gradient-primary);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: var(--shadow-md);
  transition: all var(--transition-fast);
}

.logo-icon:hover {
  transform: scale(1.05);
  box-shadow: var(--shadow-lg);
}

.logo-text {
  font-size: var(--text-xl);
  font-weight: 700;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing);
}

/* 主内容区域 */
.app-main {
  flex: 1;
  padding: var(--spacing-lg);
}

.page-wrapper {
  max-width: 1400px;
  margin: 0 auto;
  animation: fadeIn var(--transition-slow) ease-out;
}

/* 页面切换动画 */
.page-enter-active,
.page-leave-active {
  transition: all var(--transition-normal);
}

.page-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.page-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* 动画定义 */
@keyframes float {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  25% {
    transform: translate(30px, -30px) scale(1.05);
  }
  50% {
    transform: translate(-20px, 20px) scale(0.95);
  }
  75% {
    transform: translate(-30px, -10px) scale(1.02);
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header-content {
    padding: 0 var(--spacing);
    height: 60px;
  }

  .logo-text {
    font-size: var(--text-lg);
  }

  .app-main {
    padding: var(--spacing);
  }

  .bg-circle-1 {
    width: 300px;
    height: 300px;
  }

  .bg-circle-2 {
    width: 200px;
    height: 200px;
  }

  .bg-circle-3 {
    width: 150px;
    height: 150px;
  }
}

@media (max-width: 480px) {
  .logo-section {
    gap: var(--spacing-sm);
  }

  .logo-icon {
    width: 35px;
    height: 35px;
  }

  .logo-text {
    font-size: var(--text-base);
  }
}

/* 暗色模式支持 */
@media (prefers-color-scheme: dark) {
  .app-header {
    background: rgba(15, 23, 42, 0.8);
    border-bottom-color: var(--border-light);
  }

  .bg-grid {
    background-image: 
      linear-gradient(rgba(71, 85, 105, 0.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(71, 85, 105, 0.1) 1px, transparent 1px);
  }
}

/* 高对比度模式支持 */
@media (prefers-contrast: high) {
  .app-header {
    background: var(--bg-primary);
    backdrop-filter: none;
    border-bottom-width: 2px;
  }

  .bg-circle {
    opacity: 0.1;
  }
}

/* 减少动画偏好支持 */
@media (prefers-reduced-motion: reduce) {
  .app-container,
  .app-header,
  .page-wrapper,
  .bg-circle {
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
/* 全局样式重置和增强 */
* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  height: 100%;
  overflow: hidden;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--text-primary);
  background-color: var(--bg-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transition: background-color var(--transition-normal), color var(--transition-normal);
  height: 100%;
  overflow: auto;
}

/* 自定义滚动条 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-secondary);
  border-radius: var(--radius);
}

::-webkit-scrollbar-thumb {
  background: var(--border-medium);
  border-radius: var(--radius);
  transition: background var(--transition-fast);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--border-dark);
}

/* Firefox 滚动条 */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--border-medium) var(--bg-secondary);
}

/* 选择文本样式 */
::selection {
  background: var(--primary-200);
  color: var(--primary-900);
}

::-moz-selection {
  background: var(--primary-200);
  color: var(--primary-900);
}

/* 焦点样式 */
:focus-visible {
  outline: 2px solid var(--primary-500);
  outline-offset: 2px;
}

/* 终端输出自定义滚动条 */
#terminal-output::-webkit-scrollbar {
  width: 8px;
}

#terminal-output::-webkit-scrollbar-track {
  background: var(--bg-dark-secondary);
  border-radius: var(--radius);
}

#terminal-output::-webkit-scrollbar-thumb {
  background: var(--gray-600);
  border-radius: var(--radius);
}

#terminal-output::-webkit-scrollbar-thumb:hover {
  background: var(--gray-500);
}
</style>