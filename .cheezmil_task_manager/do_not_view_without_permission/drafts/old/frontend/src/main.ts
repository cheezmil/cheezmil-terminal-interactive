import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import Aura from '@primeuix/themes/aura'
import 'primeicons/primeicons.css' // 导入PrimeIcons CSS
import i18n from './i18n'

import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(PrimeVue, {
  theme: {
    preset: Aura
  }
})
app.use(ToastService)
app.directive('tooltip', Tooltip)

app.mount('#app')