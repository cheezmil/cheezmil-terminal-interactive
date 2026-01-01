<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Badge from 'primevue/badge'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { useTerminalStore } from '../stores/terminal'

const router = useRouter()
const { t } = useI18n()
const toast = useToast()
const terminalStore = useTerminalStore()

const terminals = ref<any[]>([])
const isLoading = ref(true)
const newTerminalShell = ref('')
const newTerminalCwd = ref('')

// 使用store中的showCreateModal
const showCreateModal = computed({
  get: () => terminalStore.showCreateModal,
  set: (value) => {
    if (!value) {
      terminalStore.closeCreateModal()
    }
  }
})

// 计算属性
const stats = computed(() => ({
  total: terminals.value.length,
  active: terminals.value.filter(t => t.status === 'active').length,
  inactive: terminals.value.filter(t => t.status === 'inactive').length,
  terminated: terminals.value.filter(t => t.status === 'terminated').length
}))

const fetchTerminals = async () => {
  try {
    const response = await fetch('/api/terminals')
    if (!response.ok) {
      throw new Error('Failed to fetch terminals')
    }
    const data = await response.json()
    terminals.value = data.terminals || []
  } catch (error) {
    console.error('Error fetching terminals:', error)
    terminals.value = []
    toast.add({
      severity: 'error',
      summary: t('common.error'),
      detail: t('messages.fetchTerminalsError'),
      life: 3000
    })
  } finally {
    isLoading.value = false
  }
}

const createTerminal = async () => {
  try {
    const response = await fetch('/api/terminals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        shell: newTerminalShell.value || undefined,
        cwd: newTerminalCwd.value || undefined,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to create terminal')
    }

    const newTerminal = await response.json()
    terminals.value.unshift(newTerminal) // 添加到开头
    
    toast.add({
      severity: 'success',
      summary: t('common.success'),
      detail: t('messages.terminalCreated'),
      life: 3000
    })

    // Reset form and close modal
    newTerminalShell.value = ''
    newTerminalCwd.value = ''
    terminalStore.closeCreateModal()
  } catch (error) {
    console.error('Error creating terminal:', error)
    toast.add({
      severity: 'error',
      summary: t('common.error'),
      detail: t('messages.createTerminalError'),
      life: 3000
    })
  }
}

const deleteTerminal = async (id: string) => {
  try {
    const response = await fetch(`/api/terminals/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Failed to delete terminal')
    }

    terminals.value = terminals.value.filter(t => t.id !== id)
    
    toast.add({
      severity: 'success',
      summary: t('common.success'),
      detail: t('messages.terminalDeleted'),
      life: 3000
    })
  } catch (error) {
    console.error('Error deleting terminal:', error)
    toast.add({
      severity: 'error',
      summary: t('common.error'),
      detail: t('messages.deleteTerminalError'),
      life: 3000
    })
  }
}

const openTerminal = (id: string) => {
  router.push(`/terminal/${id}`)
}

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

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'active':
      return 'pi-check-circle'
    case 'inactive':
      return 'pi-pause-circle'
    case 'terminated':
      return 'pi-times-circle'
    default:
      return 'pi-question-circle'
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

// 监听刷新触发器
watch(() => terminalStore.refreshTrigger, () => {
  fetchTerminals()
})

// 监听创建触发器
watch(() => terminalStore.createTrigger, () => {
  // 创建触发器会自动设置showCreateModal为true
})

onMounted(() => {
  fetchTerminals()
})

onUnmounted(() => {
  // 清理工作
})
</script>

<template>
  <div class="dashboard-container">
    <Toast />
    
    <!-- 统计卡片区域 -->
    <section class="stats-section">
      <div class="stats-grid">
        <div class="stat-card stat-total">
          <div class="stat-icon">
            <i class="pi pi-server"></i>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.total }}</div>
            <div class="stat-label">{{ t('home.totalTerminals') }}</div>
          </div>
          <div class="stat-trend">
            <span class="trend-indicator positive">+0%</span>
          </div>
        </div>

        <div class="stat-card stat-active">
          <div class="stat-icon">
            <i class="pi pi-play-circle"></i>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.active }}</div>
            <div class="stat-label">{{ t('home.activeTerminals') }}</div>
          </div>
          <div class="stat-trend">
            <span class="trend-indicator positive">+{{ stats.active }}</span>
          </div>
        </div>

        <div class="stat-card stat-inactive">
          <div class="stat-icon">
            <i class="pi pi-pause-circle"></i>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.inactive }}</div>
            <div class="stat-label">{{ t('home.inactiveTerminals') }}</div>
          </div>
          <div class="stat-trend">
            <span class="trend-indicator neutral">{{ stats.inactive }}</span>
          </div>
        </div>

        <div class="stat-card stat-terminated">
          <div class="stat-icon">
            <i class="pi pi-stop-circle"></i>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.terminated }}</div>
            <div class="stat-label">{{ t('home.terminatedTerminals') }}</div>
          </div>
          <div class="stat-trend">
            <span class="trend-indicator negative">{{ stats.terminated }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-content">
        <div class="loading-spinner">
          <i class="pi pi-spin pi-spinner"></i>
        </div>
        <p class="loading-text">{{ t('common.loading') }}</p>
      </div>
    </div>

    <!-- 终端列表 -->
    <section v-else-if="terminals.length > 0" class="terminals-section">
      <div class="section-header">
        <h2 class="section-title">{{ t('home.terminalList') }}</h2>
        <div class="section-actions">
          <span class="terminal-count">{{ terminals.length }} {{ t('home.terminals') }}</span>
        </div>
      </div>
      
      <div class="terminals-grid">
        <div 
          v-for="(terminal, index) in terminals" 
          :key="terminal.id" 
          class="terminal-card"
          :style="{ animationDelay: `${index * 100}ms` }"
        >
          <div class="terminal-header">
            <div class="terminal-id">
              <span class="id-label">ID:</span>
              <span class="id-value">{{ terminal.id.substring(0, 8) }}</span>
            </div>
            <div class="terminal-status">
              <Badge 
                :severity="getStatusSeverity(terminal.status)" 
                :value="terminal.status"
                class="status-badge"
              />
            </div>
          </div>

          <div class="terminal-body">
            <div class="terminal-info">
              <div class="info-row">
                <span class="info-label">
                  <i class="pi pi-cog"></i>
                  {{ t('home.pid') }}
                </span>
                <span class="info-value">{{ terminal.pid }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">
                  <i class="pi pi-terminal"></i>
                  {{ t('home.shell') }}
                </span>
                <span class="info-value">{{ terminal.shell || t('home.default') }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">
                  <i class="pi pi-folder"></i>
                  {{ t('home.directory') }}
                </span>
                <span class="info-value truncate" :title="terminal.cwd">
                  {{ terminal.cwd || t('home.defaultDirectory') }}
                </span>
              </div>
              <div class="info-row">
                <span class="info-label">
                  <i class="pi pi-clock"></i>
                  {{ t('home.created') }}
                </span>
                <span class="info-value">{{ formatDate(terminal.created) }}</span>
              </div>
            </div>
          </div>

          <div class="terminal-footer">
            <Button 
              icon="pi pi-external-link" 
              :label="t('home.open')" 
              severity="primary" 
              size="small"
              class="action-btn action-primary"
              @click="openTerminal(terminal.id)"
            />
            <Button
              icon="pi pi-trash"
              :label="t('home.terminate')"
              severity="danger"
              size="small"
              class="action-btn action-danger"
              @click="deleteTerminal(terminal.id)"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- 空状态 -->
    <section v-else class="empty-state">
      <div class="empty-content">
        <div class="empty-icon">
          <i class="pi pi-inbox"></i>
        </div>
        <h3 class="empty-title">{{ t('home.noTerminals') }}</h3>
        <p class="empty-description">
          {{ t('home.createFirstTerminal') }}
        </p>
        <Button 
          icon="pi pi-plus" 
          :label="t('home.createNewTerminal')" 
          severity="primary" 
          class="modern-btn-primary"
          @click="showCreateModal = true"
        />
      </div>
    </section>

    <!-- 创建终端模态框 -->
    <Dialog
      v-model:visible="showCreateModal"
      :header="t('home.createNewTerminal')"
      :style="{ width: '500px' }"
      :modal="true"
      :closeButtonProps="{ 'aria-label': t('common.close') }"
      class="create-modal"
    >
      <div class="modal-content">
        <div class="form-group">
          <label for="shell" class="form-label">
            <i class="pi pi-terminal"></i>
            {{ t('home.shellType') }}
          </label>
          <InputText 
            id="shell"
            v-model="newTerminalShell" 
            :placeholder="t('home.shellPlaceholder')"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label for="cwd" class="form-label">
            <i class="pi pi-folder"></i>
            {{ t('home.workingDirectory') }}
          </label>
          <InputText 
            id="cwd"
            v-model="newTerminalCwd" 
            :placeholder="t('home.directoryPlaceholder')"
            class="form-input"
          />
        </div>
      </div>
      <template #footer>
        <div class="modal-footer">
          <Button 
            :label="t('common.cancel')" 
            severity="secondary" 
            class="modal-btn-secondary"
            @click="showCreateModal = false"
          />
          <Button 
            :label="t('home.create')" 
            severity="primary" 
            class="modal-btn-primary"
            @click="createTerminal"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
/* 仪表板容器 */
.dashboard-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: var(--spacing-lg);
  animation: fadeIn var(--transition-slow) ease-out;
}

/* 英雄区域 */
.hero-section {
  margin-bottom: var(--spacing-xl);
  background: var(--gradient-primary);
  border-radius: var(--radius-2xl);
  padding: var(--spacing-xl);
  color: var(--text-inverse);
  position: relative;
  overflow: hidden;
}

.hero-section::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 300px;
  height: 300px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  transform: translate(50%, -50%);
}

.hero-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-xl);
  position: relative;
  z-index: 1;
}

.hero-text {
  flex: 1;
}

.hero-title {
  font-size: var(--text-4xl);
  font-weight: 700;
  margin: 0 0 var(--spacing) 0;
  display: flex;
  align-items: center;
  gap: var(--spacing);
}

.hero-icon {
  font-size: var(--text-4xl);
  animation: float 3s ease-in-out infinite;
}

.hero-description {
  font-size: var(--text-lg);
  opacity: 0.9;
  margin: 0;
  line-height: var(--leading-relaxed);
}

.hero-actions {
  display: flex;
  gap: var(--spacing);
  flex-shrink: 0;
}

/* 统计区域 */
.stats-section {
  margin-bottom: var(--spacing-xl);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--spacing-lg);
}

.stat-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xl);
  padding: var(--spacing-lg);
  display: flex;
  align-items: center;
  gap: var(--spacing);
  transition: all var(--transition-normal);
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--gradient-primary);
  transition: width var(--transition-fast);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.stat-card:hover::before {
  width: 8px;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-2xl);
  color: white;
}

.stat-total .stat-icon {
  background: var(--gradient-primary);
}

.stat-active .stat-icon {
  background: var(--gradient-secondary);
}

.stat-inactive .stat-icon {
  background: linear-gradient(135deg, var(--warning-500) 0%, var(--warning-600) 100%);
}

.stat-terminated .stat-icon {
  background: linear-gradient(135deg, var(--danger-500) 0%, var(--danger-600) 100%);
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
  margin-bottom: var(--spacing-xs);
}

.stat-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.stat-trend {
  text-align: right;
}

.trend-indicator {
  font-size: var(--text-xs);
  font-weight: 600;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
}

.trend-indicator.positive {
  background: var(--success-100);
  color: var(--success-700);
}

.trend-indicator.negative {
  background: var(--danger-100);
  color: var(--danger-700);
}

.trend-indicator.neutral {
  background: var(--gray-100);
  color: var(--gray-700);
}

/* 加载状态 */
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.loading-content {
  text-align: center;
}

.loading-spinner {
  font-size: var(--text-4xl);
  color: var(--primary-500);
  margin-bottom: var(--spacing);
}

.loading-text {
  color: var(--text-secondary);
  font-size: var(--text-lg);
}

/* 终端列表区域 */
.terminals-section {
  margin-bottom: var(--spacing-xl);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.section-title {
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.section-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing);
}

.terminal-count {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
}

.terminals-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: var(--spacing-lg);
}

.terminal-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xl);
  overflow: hidden;
  transition: all var(--transition-normal);
  animation: slideUp var(--transition-normal) ease-out;
  animation-fill-mode: both;
}

.terminal-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-xl);
  border-color: var(--primary-200);
}

.terminal-header {
  padding: var(--spacing-lg);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.terminal-id {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.id-label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.id-value {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-primary);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius);
}

.status-badge {
  font-size: var(--text-xs);
  font-weight: 600;
}

.terminal-body {
  padding: var(--spacing-lg);
}

.terminal-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--border-light);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.info-label i {
  font-size: var(--text-sm);
  color: var(--primary-500);
}

.info-value {
  font-size: var(--text-sm);
  color: var(--text-primary);
  font-weight: 500;
  max-width: 200px;
}

.info-value.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-footer {
  padding: var(--spacing-lg);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-light);
  display: flex;
  gap: var(--spacing);
}

.action-btn {
  flex: 1;
  font-weight: 500;
  transition: all var(--transition-fast);
}

.action-primary:hover {
  transform: translateY(-1px);
}

.action-danger:hover {
  transform: translateY(-1px);
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: var(--spacing-2xl);
  background: var(--bg-primary);
  border: 2px dashed var(--border-medium);
  border-radius: var(--radius-2xl);
  margin-bottom: var(--spacing-xl);
}

.empty-content {
  max-width: 400px;
  margin: 0 auto;
}

.empty-icon {
  font-size: var(--text-6xl);
  color: var(--text-tertiary);
  margin-bottom: var(--spacing-lg);
}

.empty-title {
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 var(--spacing) 0;
}

.empty-description {
  font-size: var(--text-lg);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-xl) 0;
  line-height: var(--leading-relaxed);
}

/* 模态框样式 */
.create-modal {
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.modal-content {
  padding: var(--spacing) 0;
}

.form-group {
  margin-bottom: var(--spacing-lg);
}

.form-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--spacing-sm);
}

.form-label i {
  color: var(--primary-500);
}

.form-input {
  width: 100%;
  font-size: var(--text-sm);
}

.modal-footer {
  display: flex;
  gap: var(--spacing);
  justify-content: flex-end;
}

.modal-btn-secondary,
.modal-btn-primary {
  min-width: 100px;
}

/* 按钮样式增强 */
.modern-btn-primary,
.modern-btn-secondary {
  padding: var(--spacing-sm) var(--spacing-lg);
  font-weight: 600;
  border-radius: var(--radius-lg);
  transition: all var(--transition-fast);
}

.modern-btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.modern-btn-secondary:hover {
  transform: translateY(-1px);
}

/* 动画定义 */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .terminals-grid {
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  }
}

@media (max-width: 768px) {
  .dashboard-container {
    padding: var(--spacing);
  }

  .hero-content {
    flex-direction: column;
    text-align: center;
    gap: var(--spacing-lg);
  }

  .hero-title {
    font-size: var(--text-3xl);
    justify-content: center;
  }

  .hero-actions {
    justify-content: center;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .terminals-grid {
    grid-template-columns: 1fr;
  }

  .section-header {
    flex-direction: column;
    gap: var(--spacing);
    text-align: center;
  }

  .terminal-footer {
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .hero-section {
    padding: var(--spacing-lg);
  }

  .hero-title {
    font-size: var(--text-2xl);
  }

  .hero-description {
    font-size: var(--text-base);
  }

  .stat-card {
    padding: var(--spacing);
  }

  .stat-icon {
    width: 50px;
    height: 50px;
    font-size: var(--text-xl);
  }

  .stat-value {
    font-size: var(--text-2xl);
  }
}

/* 暗色模式支持 */
@media (prefers-color-scheme: dark) {
  .hero-section {
    background: var(--gradient-dark);
  }

  .stat-card {
    background: var(--bg-dark-secondary);
    border-color: var(--border-light);
  }

  .terminal-card {
    background: var(--bg-dark-secondary);
    border-color: var(--border-light);
  }

  .terminal-header,
  .terminal-footer {
    background: var(--bg-dark-tertiary);
    border-color: var(--border-light);
  }

  .empty-state {
    background: var(--bg-dark-secondary);
    border-color: var(--border-medium);
  }
}

/* 减少动画偏好支持 */
@media (prefers-reduced-motion: reduce) {
  .dashboard-container,
  .terminal-card,
  .hero-icon {
    animation: none;
  }

  .stat-card,
  .terminal-card,
  .modern-btn-primary,
  .modern-btn-secondary,
  .action-btn {
    transition: none;
  }
}
</style>