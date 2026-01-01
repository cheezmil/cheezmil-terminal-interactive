<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import type { MenuItem } from 'primevue/menuitem'

const { locale } = useI18n()
const menu = ref()
const isAnimating = ref(false)

const currentLanguage = computed(() => {
  return locale.value === 'zh' ? '中文' : 'English'
})

const currentFlag = computed(() => {
  return locale.value === 'zh' ? '🇨🇳' : '🇺🇸'
})

const items = ref<MenuItem[]>([
  {
    label: '🇨🇳 简体中文',
    command: () => {
      switchLanguage('zh')
    }
  },
  {
    label: '🇺🇸 English',
    command: () => {
      switchLanguage('en')
    }
  }
])

const toggle = (event: Event) => {
  menu.value.toggle(event)
}

const switchLanguage = (lang: string) => {
  if (lang === locale.value || isAnimating.value) return
  
  isAnimating.value = true
  
  // 添加切换动画
  setTimeout(() => {
    locale.value = lang
    localStorage.setItem('language', lang)
    
    setTimeout(() => {
      isAnimating.value = false
    }, 300)
  }, 150)
}

// 初始化语言设置
const initializeLanguage = () => {
  const savedLanguage = localStorage.getItem('language')
  if (savedLanguage && (savedLanguage === 'zh' || savedLanguage === 'en')) {
    locale.value = savedLanguage
  }
}

// 在组件挂载后初始化语言设置
onMounted(() => {
  initializeLanguage()
})
</script>

<template>
  <div class="language-switcher">
    <Button 
      type="button" 
      class="language-button"
      :class="{ 'animating': isAnimating }"
      @click="toggle" 
      aria-haspopup="true" 
      aria-controls="language_menu"
      v-tooltip="'切换语言 / Switch Language'"
    >
      <div class="button-content">
        <span class="flag-icon" :class="{ 'flag-rotate': isAnimating }">
          {{ currentFlag }}
        </span>
        <span class="language-text" :class="{ 'text-fade': isAnimating }">
          {{ currentLanguage }}
        </span>
        <i class="pi pi-chevron-down dropdown-icon" :class="{ 'icon-rotate': menu?.visible }"></i>
      </div>
    </Button>
    
    <Menu 
      ref="menu" 
      id="language_menu" 
      :model="items" 
      :popup="true"
      class="language-menu"
    >
      <template #item="{ item, props }">
        <div class="menu-item" v-bind="props.action">
          <span class="menu-flag">{{ item.label.split(' ')[0] }}</span>
          <span class="menu-text">{{ item.label.split(' ')[1] }}</span>
          <span 
            v-if="item.label.includes(currentLanguage)" 
            class="menu-check"
          >
            <i class="pi pi-check"></i>
          </span>
        </div>
      </template>
    </Menu>
  </div>
</template>

<style scoped>
/* 语言切换器容器 */
.language-switcher {
  position: relative;
  display: inline-block;
}

/* 主按钮样式 */
.language-button {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--text-primary);
  padding: var(--spacing-sm) var(--spacing);
  border-radius: var(--radius-lg);
  font-weight: 500;
  transition: all var(--transition-normal);
  position: relative;
  overflow: hidden;
}

.language-button:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.language-button.animating {
  pointer-events: none;
}

.language-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left var(--transition-slow);
}

.language-button:hover::before {
  left: 100%;
}

/* 按钮内容 */
.button-content {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  position: relative;
  z-index: 1;
}

.flag-icon {
  font-size: var(--text-lg);
  transition: transform var(--transition-normal);
}

.flag-icon.flag-rotate {
  animation: flagRotate 0.6s ease-in-out;
}

.language-text {
  font-size: var(--text-sm);
  font-weight: 500;
  transition: opacity var(--transition-normal);
}

.language-text.text-fade {
  animation: textFade 0.6s ease-in-out;
}

.dropdown-icon {
  font-size: var(--text-xs);
  transition: transform var(--transition-fast);
}

.dropdown-icon.icon-rotate {
  transform: rotate(180deg);
}

/* 下拉菜单样式 */
.language-menu {
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-light);
  backdrop-filter: blur(20px);
  background: rgba(255, 255, 255, 0.95);
  min-width: 180px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

.menu-item:hover {
  background: var(--bg-secondary);
  transform: translateX(2px);
}

.menu-flag {
  font-size: var(--text-lg);
  width: 24px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.menu-text {
  flex: 1;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  line-height: 1;
}

.menu-check {
  color: var(--primary-500);
  font-size: var(--text-sm);
  animation: checkBounce 0.3s ease-out;
}

/* 动画定义 */
@keyframes flagRotate {
  0% {
    transform: rotateY(0deg) scale(1);
  }
  50% {
    transform: rotateY(90deg) scale(0.8);
  }
  100% {
    transform: rotateY(0deg) scale(1);
  }
}

@keyframes textFade {
  0% {
    opacity: 1;
    transform: translateX(0);
  }
  50% {
    opacity: 0;
    transform: translateX(-10px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes checkBounce {
  0% {
    transform: scale(0);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

/* 暗色模式支持 */
@media (prefers-color-scheme: dark) {
  .language-button {
    background: rgba(15, 23, 42, 0.8);
    border-color: var(--border-light);
    color: var(--text-inverse);
  }

  .language-button:hover {
    background: rgba(15, 23, 42, 0.9);
    border-color: var(--border-medium);
  }

  .language-menu {
    background: rgba(15, 23, 42, 0.95);
    border-color: var(--border-light);
  }

  .menu-item:hover {
    background: var(--bg-dark-tertiary);
  }

  .menu-text {
    color: var(--text-inverse);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .language-button {
    padding: var(--spacing-xs) var(--spacing-sm);
  }

  .language-text {
    display: none;
  }

  .language-menu {
    min-width: 150px;
  }
}

@media (max-width: 480px) {
  .language-button {
    padding: var(--spacing-xs);
  }

  .button-content {
    gap: var(--spacing-xs);
  }

  .flag-icon {
    font-size: var(--text-base);
  }
}

/* 减少动画偏好支持 */
@media (prefers-reduced-motion: reduce) {
  .language-button,
  .flag-icon,
  .language-text,
  .dropdown-icon,
  .menu-item {
    animation: none;
    transition: none;
  }

  .flag-icon.flag-rotate,
  .language-text.text-fade,
  .dropdown-icon.icon-rotate {
    animation: none;
    transform: none;
  }
}

/* 高对比度模式支持 */
@media (prefers-contrast: high) {
  .language-button {
    background: var(--bg-primary);
    border: 2px solid var(--text-primary);
    color: var(--text-primary);
  }

  .language-button:hover {
    background: var(--bg-secondary);
    border-color: var(--primary-500);
  }

  .language-menu {
    background: var(--bg-primary);
    border: 2px solid var(--text-primary);
  }

  .menu-item:hover {
    background: var(--bg-secondary);
  }
}

/* 焦点样式 */
.language-button:focus-visible {
  outline: 2px solid var(--primary-500);
  outline-offset: 2px;
}

.menu-item:focus-visible {
  outline: 2px solid var(--primary-500);
  outline-offset: -2px;
}

/* 加载状态 */
.language-button.animating .flag-icon,
.language-button.animating .language-text {
  opacity: 0.7;
}
</style>