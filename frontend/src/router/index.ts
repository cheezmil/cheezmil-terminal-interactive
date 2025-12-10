import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import TerminalTestView from '../views/TerminalTestView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/terminal/:id',
      name: 'terminal-detail',
      component: () => import('../views/TerminalDetailView.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue')
    },
    {
      path: '/terminal-test',
      name: 'terminal-test',
      component: TerminalTestView
    }
  ]
})

export default router
