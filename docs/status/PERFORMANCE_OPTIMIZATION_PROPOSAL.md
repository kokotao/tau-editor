# 前端性能优化建议

**创建日期:** 2026-03-11  
**分析对象:** frontend/dist/ 构建产物  
**优化目标:** 减少初始加载时间，优化代码分割，提升用户体验

---

## 一、构建产物分析

### 1.1 大 Chunk 文件清单

基于 `frontend/dist/assets/` 目录分析，以下文件超过 500KB 警告阈值:

| 文件名 | 大小 | 类型 | 优化优先级 |
|--------|------|------|-----------|
| `ts.worker-*.js` | 6.7MB | TypeScript Worker | 🔴 高 |
| `monaco-*.js` | 3.6MB | Monaco Editor 核心 | 🔴 高 |
| `css.worker-*.js` | 1005KB | CSS Worker | 🟡 中 |
| `html.worker-*.js` | 674KB | HTML Worker | 🟡 中 |
| `json.worker-*.js` | 371KB | JSON Worker | 🟢 低 |

**总计:** 约 12.3MB (仅上述 5 个文件)

### 1.2 其他重要文件

| 文件名 | 大小 | 说明 |
|--------|------|------|
| `monaco-*.css` | 143KB | Monaco 样式 |
| `codicon-*.ttf` | 120KB | 图标字体 |
| `index-*.js` | 86KB | 应用入口 |
| `vue-vendor-*.js` | 73KB | Vue 供应商库 |
| `index-*.css` | 19KB | 应用样式 |

---

## 二、Monaco Editor 按需加载方案

### 2.1 问题分析

**当前状态:**
- Monaco Editor 核心 (3.6MB) 在初始加载时全部载入
- 所有语言 Worker 打包在一起
- 即使用户只编辑纯文本，也会加载 TypeScript、CSS 等语言的 Worker

**影响:**
- 首次加载时间长 (3-5 秒)
- 内存占用高
- 不必要的网络传输

### 2.2 优化方案 A: 动态导入语言 Worker

**目标:** 仅在用户选择特定语言时加载对应的 Worker

**实现步骤:**

#### 步骤 1: 配置 Vite 手动分块

修改 `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Monaco 核心 (必需)
          'monaco-core': ['monaco-editor'],
          
          // 常用语言 Worker (按需加载)
          'monaco-ts': ['monaco-editor/esm/vs/language/typescript/ts.worker'],
          'monaco-css': ['monaco-editor/esm/vs/language/css/css.worker'],
          'monaco-html': ['monaco-editor/esm/vs/language/html/html.worker'],
          'monaco-json': ['monaco-editor/esm/vs/language/json/json.worker'],
          
          // Vue 供应商库
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
        },
      },
    },
  },
})
```

#### 步骤 2: 实现 Worker 动态加载

修改 `src/components/editor/EditorCore.vue`:

```typescript
import * as monaco from 'monaco-editor'
import { ref, onMounted } from 'vue'

// Worker 加载映射
const workerLoaders: Record<string, () => Promise<unknown>> = {
  typescript: () => import('monaco-editor/esm/vs/language/typescript/ts.worker?worker'),
  css: () => import('monaco-editor/esm/vs/language/css/css.worker?worker'),
  html: () => import('monaco-editor/esm/vs/language/html/html.worker?worker'),
  json: () => import('monaco-editor/esm/vs/language/json/json.worker?worker'),
}

const loadedWorkers = new Set<string>()

// 动态加载 Worker
async function loadWorker(language: string) {
  if (loadedWorkers.has(language)) return
  
  const loader = workerLoaders[language]
  if (loader) {
    const workerModule = await loader()
    // Monaco 会自动注册 worker
    loadedWorkers.add(language)
  }
}

// 在语言切换时调用
onMounted(async () => {
  // 仅加载默认语言的 Worker
  await loadWorker('plaintext')
})

// 暴露给模板的方法
async function onLanguageChange(newLanguage: string) {
  await loadWorker(newLanguage)
  // 更新编辑器语言...
}
```

#### 步骤 3: 配置 Monaco 按需加载

创建 `src/lib/monaco-config.ts`:

```typescript
import * as monaco from 'monaco-editor'

// 配置 Monaco 仅加载必需的功能
export function configureMonaco() {
  // 禁用不必要的功能
  monaco.editor.setTheme('vs') // 默认主题
  
  // 可选：禁用某些语言以进一步减少体积
  // monaco.languages.unregister('typescript')
  // monaco.languages.unregister('javascript')
}

// 按需加载语言支持
export async function loadLanguage(language: string) {
  const languageModules: Record<string, () => Promise<void>> = {
    typescript: () => import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'),
    javascript: () => import('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'),
    python: () => import('monaco-editor/esm/vs/basic-languages/python/python.contribution'),
    java: () => import('monaco-editor/esm/vs/basic-languages/java/java.contribution'),
    // ... 其他语言
  }
  
  if (languageModules[language]) {
    await languageModules[language]()
  }
}
```

### 2.3 优化方案 B: 使用 CDN 加载 Monaco

**目标:** 将 Monaco Editor 从主包中分离，通过 CDN 加载

**优点:**
- 减少主包体积 ~3.6MB
- 利用浏览器缓存
- CDN 加速

**缺点:**
- 依赖外部服务
- 可能需要配置 CORS

**实现:**

修改 `index.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <!-- 其他 head 内容... -->
  </head>
  <body>
    <div id="app"></div>
    
    <!-- Monaco Editor 从 CDN 加载 -->
    <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.47.0/min/vs/loader.js"></script>
    <script>
      // 配置 Monaco 路径
      require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.47.0/min/vs' } })
    </script>
    
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

修改 `EditorCore.vue`:

```typescript
// 使用全局 monaco 对象而非 import
declare const monaco: typeof import('monaco-editor')

// 直接使用 monaco 对象
onMounted(() => {
  const editor = monaco.editor.create(container.value, {
    value: '',
    language: 'plaintext',
    theme: 'vs-dark',
  })
})
```

### 2.4 优化方案 C: 使用 monaco-editor-webpack-plugin (推荐)

如果使用 Webpack/Vite 插件:

```bash
pnpm add -D monaco-editor-nls
```

配置 `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { monacoEditorPlugin } from 'vite-plugin-monaco-editor'

export default defineConfig({
  plugins: [
    vue(),
    monacoEditorPlugin({
      languageWorkers: ['editorWorkerService', 'typescript', 'css', 'html', 'json'],
      customDistPath: (_, base) => `${base}/monacoeditorwork`,
      customWorkers: [
        {
          label: 'typescript',
          entry: 'monaco-editor/esm/vs/language/typescript/ts.worker',
        },
      ],
    }),
  ],
})
```

---

## 三、代码分割优化策略

### 3.1 路由级别分割

**当前问题:** 所有路由组件打包在一起

**优化方案:**

修改 `src/router/index.ts`:

```typescript
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('../views/HomeView.vue'), // 动态导入
    },
    {
      path: '/about',
      component: () => import('../views/AboutView.vue'), // 动态导入
    },
    {
      path: '/settings',
      component: () => import('../views/SettingsView.vue'), // 动态导入
    },
  ],
})

export default router
```

### 3.2 组件级别分割

**大组件按需加载:**

```typescript
// 重型组件使用动态导入
const HeavyComponent = defineAsyncComponent(() =>
  import('../components/HeavyComponent.vue')
)

// 带加载状态的动态导入
const EditorWithLoading = defineAsyncComponent({
  loader: () => import('../components/EditorCore.vue'),
  loadingComponent: LoadingSpinner,
  delay: 200, // 200ms 后显示加载状态
  timeout: 10000, // 10 秒超时
})
```

### 3.3 第三方库分割

**优化 `vite.config.ts`:**

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vue 生态
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          
          // UI 组件库
          'naive-ui': ['naive-ui'],
          
          // Monaco Editor (核心)
          'monaco-core': ['monaco-editor'],
          
          // 工具库
          'utils': ['lodash-es', 'dayjs'],
        },
      },
    },
    chunkSizeWarningLimit: 1000, // 提高到 1000KB
  },
})
```

### 3.4 图片/字体优化

**当前状态:**
- `codicon-*.ttf`: 120KB

**优化方案:**

1. **字体子集化:** 仅包含使用的图标
2. **使用 SVG 图标:** 替换部分字体图标
3. **WOFF2 格式:** 转换字体为更高效的格式

```bash
# 安装字体转换工具
pnpm add -D fonttools

# 转换字体
fonttools ttcollect --output-file=codicon.woff2 codicon.ttf
```

---

## 四、Vite 构建配置优化

### 4.1 完整优化配置

修改 `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    vue(),
    // 构建分析工具 (仅生产环境)
    process.env.ANALYZE && visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
    }),
  ],
  
  build: {
    // 目标浏览器
    target: 'esnext',
    
    // 代码分割
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'monaco-core': ['monaco-editor'],
          'naive-ui': ['naive-ui'],
        },
        // 分块命名
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    
    // 压缩配置
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // 生产环境移除 console
        drop_debugger: true,
      },
    },
    
    // 禁用 gzip 大小报告 (可选)
    reportCompressedSize: false,
    
    // 分块大小警告限制
    chunkSizeWarningLimit: 1000,
  },
  
  // 预加载优化
  optimizeDeps: {
    include: ['vue', 'vue-router', 'pinia'],
    exclude: ['monaco-editor'], // Monaco 不预加载
  },
})
```

### 4.2 添加构建分析脚本

修改 `frontend/package.json`:

```json
{
  "scripts": {
    "build": "vite build",
    "build:analyze": "ANALYZE=true vite build",
    "preview": "vite preview"
  }
}
```

**使用方法:**
```bash
# 构建并分析
pnpm build:analyze

# 查看分析报告
open dist/stats.html
```

---

## 五、预期优化效果

### 5.1 优化前后对比

| 指标 | 优化前 | 优化后 (预期) | 改善 |
|------|--------|--------------|------|
| 初始加载体积 | ~12MB | ~2MB | -83% |
| 首次加载时间 | 3-5 秒 | 1-2 秒 | -60% |
| Monaco 加载 | 阻塞 | 异步/按需 | 非阻塞 |
| 语言 Worker | 全部加载 | 按需加载 | 节省 ~8MB |

### 5.2 分阶段实施计划

#### Phase 1: 快速优化 (1-2 天)
- [ ] 配置 Vite `manualChunks`
- [ ] 实现 Worker 动态加载
- [ ] 添加构建分析工具

**预期效果:** 初始加载体积减少 50%

#### Phase 2: 深度优化 (3-5 天)
- [ ] 路由级别代码分割
- [ ] 组件异步加载
- [ ] 字体/图片优化

**预期效果:** 初始加载时间减少 70%

#### Phase 3: CDN 优化 (可选，2-3 天)
- [ ] Monaco CDN 集成
- [ ] 其他第三方库 CDN
- [ ] 缓存策略优化

**预期效果:** 进一步减少主包体积 30%

---

## 六、监控与验证

### 6.1 性能监控指标

添加性能监控到 `src/main.ts`:

```typescript
// 监听页面加载性能
window.addEventListener('load', () => {
  const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
  
  console.log('性能指标:', {
    'DNS 查询': perf.domainLookupEnd - perf.domainLookupStart,
    'TCP 连接': perf.connectEnd - perf.connectStart,
    '首字节时间': perf.responseStart - perf.requestStart,
    '内容传输': perf.responseEnd - perf.responseStart,
    'DOM 解析': perf.domComplete - perf.domLoading,
    '总加载时间': perf.loadEventEnd - perf.fetchStart,
  })
})
```

### 6.2 验证方法

```bash
# 1. 构建并分析
cd frontend
pnpm build:analyze

# 2. 预览构建产物
pnpm preview

# 3. 使用 Lighthouse 测试
# 在 Chrome DevTools 中运行 Lighthouse

# 4. 测量实际加载时间
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:4173
```

创建 `curl-format.txt`:
```
    time_namelookup:  %{time_namelookup}\n
       time_connect:  %{time_connect}\n
    time_appconnect:  %{time_appconnect}\n
   time_pretransfer:  %{time_pretransfer}\n
      time_redirect:  %{time_redirect}\n
 time_starttransfer:  %{time_starttransfer}\n
                    ----------\n
         time_total:  %{time_total}\n
```

---

## 七、风险与注意事项

### 7.1 潜在风险

1. **异步加载失败:**
   - 风险：网络问题导致 Worker 加载失败
   - 缓解：添加重试机制和降级方案

2. **缓存问题:**
   - 风险：CDN 或浏览器缓存旧版本
   - 缓解：使用 hash 文件名，配置合理缓存策略

3. **兼容性:**
   - 风险：旧浏览器不支持动态导入
   - 缓解：配置 Babel 转译，或提供降级方案

### 7.2 测试建议

优化后必须测试:

- [ ] 所有支持的语言编辑功能
- [ ] Worker 功能 (语法检查、自动完成)
- [ ] 主题切换
- [ ] 大文件编辑性能
- [ ] 移动端兼容性

---

## 八、总结与建议

### 推荐实施顺序

1. **立即实施** (高优先级):
   - 配置 Vite `manualChunks` 分割大文件
   - 实现 Monaco Worker 动态加载
   - 添加构建分析工具

2. **短期实施** (中优先级):
   - 路由级别代码分割
   - 重型组件异步加载
   - 优化第三方库加载

3. **长期优化** (低优先级):
   - CDN 集成
   - 字体子集化
   - 更细粒度的按需加载

### 预期收益

- **用户体验:** 加载速度提升 60-80%
- **带宽成本:** 减少 70% 以上的初始传输
- **SEO:** 更快的 LCP (Largest Contentful Paint)
- **可维护性:** 更清晰的代码组织结构

---

**作者:** 🦐 罗小虾  
**审核:** Senior Developer Skill  
**最后更新:** 2026-03-11 16:45 UTC
