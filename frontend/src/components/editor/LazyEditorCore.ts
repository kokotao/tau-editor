/**
 * Monaco Editor 懒加载包装器
 * 
 * 使用 defineAsyncComponent 实现代码分割和懒加载
 * 仅在需要时加载 Monaco Editor
 */

import { defineAsyncComponent, h, defineComponent, ref, onMounted } from 'vue';

// 懒加载 EditorCore 组件
export const LazyEditorCore = defineAsyncComponent({
  // 工厂函数
  loader: () => import('./components/editor/EditorCore.vue'),
  
  // 加载时要显示的组件
  loadingComponent: defineComponent({
    template: '<div class="editor-loading">加载编辑器...</div>',
  }),
  
  // 加载失败时要显示的组件
  errorComponent: defineComponent({
    props: ['error'],
    template: '<div class="editor-error">加载失败：{{ error }}</div>',
  }),
  
  // 显示加载组件前的延迟 (ms)
  delay: 200,
  
  // 超时时间 (ms)
  timeout: 30000,
  
  // 错误处理
  onError: (error: Error, retry: () => void, fail: () => void, attempts: number) => {
    // 最多重试 3 次
    if (attempts <= 3) {
      // 指数退避重试
      setTimeout(retry, 1000 * attempts);
    } else {
      fail();
    }
  },
});

// 预加载函数 - 在空闲时预加载 Monaco Editor
export function preloadMonaco() {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => {
      // 预加载 Monaco Editor 核心模块
      import('monaco-editor').catch(console.error);
    });
  } else {
    // 降级方案：立即加载
    import('monaco-editor').catch(console.error);
  }
}

// 检查 Monaco 是否已加载
let monacoLoaded = false;
export function isMonacoLoaded(): boolean {
  return monacoLoaded;
}

// 标记 Monaco 已加载
export function markMonacoLoaded() {
  monacoLoaded = true;
}
