<script setup lang="ts">
import { computed } from 'vue'
import * as Icons from 'lucide-vue-next'

interface Props {
  name: string
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  class: ''
})

// Map icon names to Lucide icons / 将图标名称映射到Lucide图标
const iconMap = {
  terminal: Icons.Terminal,
  play: Icons.Play,
  pause: Icons.Pause,
  stop: Icons.Square,
  settings: Icons.Settings,
  chevronRight: Icons.ChevronRight,
  chevronLeft: Icons.ChevronLeft,
  computer: Icons.Monitor,
  refresh: Icons.RefreshCw,
  trash: Icons.Trash2,
  pin: Icons.Pin,
  folder: Icons.Folder,
  clock: Icons.Clock,
  cog: Icons.Settings,
  check: Icons.Check,
  x: Icons.X,
  server: Icons.Server,
  monitor: Icons.Monitor,
  archive: Icons.Archive,
  spinner: Icons.Loader
}

const iconComponent = computed(() => {
  const IconComponent = iconMap[props.name as keyof typeof iconMap] || Icons.Terminal
  return IconComponent
})
</script>

<template>
  <span :class="props.class" class="inline-flex items-center justify-center">
    <component
      :is="iconComponent"
      :size="16"
      :stroke-width="2"
    />
  </span>
</template>

<style scoped>
span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
