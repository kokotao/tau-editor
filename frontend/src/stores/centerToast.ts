/**
 * @description 全局居中 toast：同步成功等一次性提示，3 秒自动消失（屏幕中央，统一视觉）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 21:05
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export type CenterToastTone = 'success' | 'error' | 'info';

export const useCenterToastStore = defineStore('center-toast', () => {
  const message = ref('');
  const tone = ref<CenterToastTone>('success');
  const visible = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function hide(): void {
    visible.value = false;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /** 展示 3 秒（可调）；重复调用会重置计时。 */
  function show(text: string, nextTone: CenterToastTone = 'success', duration = 3000): void {
    if (!text) {
      return;
    }
    message.value = text;
    tone.value = nextTone;
    visible.value = true;
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      visible.value = false;
      timer = null;
    }, duration);
  }

  return { message, tone, visible, show, hide };
});
