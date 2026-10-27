import './assets/main.css'
import './assets/workbench-theme.css'
// 云文档设计稿（Stitch Nocturne）专属视觉层：只在 .cd-nocturne 作用域内生效
import './assets/clouddoc-nocturne.css'
import 'animate.css'
import '@fontsource-variable/manrope'
import '@fontsource-variable/geist'
import '@fontsource-variable/jetbrains-mono'

import { createApp, type Component } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import App from './App.vue'
import router from './router'

/**
 * 开发环境下 `?design-preview=cloud-doc` 直接挂载云文档设计稿预览页，
 * 不装载路由与编辑器外壳，便于在无 Tauri 运行时的浏览器里验收样式。
 */
async function resolveRoot(): Promise<{ component: Component; withRouter: boolean }> {
  const isDev = import.meta.env.DEV
  const preview = isDev ? new URLSearchParams(window.location.search).get('design-preview') : null
  if (preview === 'cloud-doc') {
    const mod = await import('./dev/DesignPreview.vue')
    return { component: mod.default, withRouter: false }
  }
  return { component: App, withRouter: true }
}

async function bootstrap(): Promise<void> {
  const { component, withRouter } = await resolveRoot()

  const app = createApp(component)

  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)

  app.use(pinia)
  if (withRouter) {
    app.use(router)
  }

  app.mount('#app')
}

void bootstrap()
