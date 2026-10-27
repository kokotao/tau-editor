<!--
  /**
   * @description 「联系管理员开通」的微信二维码弹窗（产品需求 ③）：
   *              支付通道不可用 / 需要人工开通时，不再跳浏览器，直接展示管理员微信二维码，
   *              用户扫码添加好友并备注『扩容』，由管理员协助开通。
   *
   * 交互：Esc / 点击遮罩 / 底部关闭按钮都能关；`visible=false` 时整个弹层不渲染。
   * 视觉：沿用 `assets/clouddoc-nocturne.css` 的 `.cd-*` 原语，不引入新的 UI 库。
   *
   * @author Albert_Luo
   * @email 480199976@qq.com
   * @date 2026-10-27 17:20
   */
-->
<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="cd-backdrop cd-nocturne"
      data-testid="wechat-contact-overlay"
      @click.self="handleClose"
    >
      <section
        class="wechat-contact cd-dialog cd-dialog--compact"
        data-testid="wechat-contact-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="copy.title"
      >
        <header class="wechat-contact__header">
          <div class="wechat-contact__heading">
            <h2 class="wechat-contact__title">{{ copy.title }}</h2>
            <p class="wechat-contact__hint">{{ copy.hint }}</p>
          </div>
          <button
            type="button"
            class="cd-icon-btn cd-icon-btn--close"
            :aria-label="copy.close"
            @click="handleClose"
          >
            ×
          </button>
        </header>

        <div class="wechat-contact__body cd-scroll">
          <div class="wechat-contact__qr-frame">
            <img
              class="wechat-contact__qr"
              data-testid="wechat-contact-qr"
              :src="wechatQr"
              :alt="copy.qrAlt"
              draggable="false"
            />
          </div>
          <p class="wechat-contact__note cd-mono">{{ copy.note }}</p>
        </div>

        <footer class="wechat-contact__actions">
          <button
            type="button"
            class="cd-btn cd-btn--secondary"
            data-testid="wechat-contact-close"
            @click="handleClose"
          >
            {{ copy.close }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import wechatQr from '@/assets/wechat/contact-qr.png';
import { getWechatContactI18n } from '@/i18n/ui';
import { useSettingsStore } from '@/stores/settings';

const props = withDefaults(defineProps<{ visible?: boolean }>(), { visible: false });
const emit = defineEmits<{ close: [] }>();

const settingsStore = useSettingsStore();
const copy = computed(() => getWechatContactI18n(settingsStore.uiLanguage));

function handleClose(): void {
  emit('close');
}

/** Esc 关闭：只在弹层可见时响应，避免弹窗关掉后还吃掉编辑器的 Esc。 */
function onKeydown(event: KeyboardEvent): void {
  if (!props.visible || event.key !== 'Escape') {
    return;
  }
  event.preventDefault();
  handleClose();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.wechat-contact {
  width: min(420px, calc(100vw - 32px));
  max-height: min(86vh, 640px);
  border-radius: var(--cd-r-window);
}

.wechat-contact__header {
  display: flex;
  flex: 0 0 auto;
  gap: 12px;
  align-items: flex-start;
  padding: 18px 20px 12px;
  border-bottom: 1px solid var(--cd-border-soft);
}

.wechat-contact__heading {
  flex: 1;
  min-width: 0;
}

.wechat-contact__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--cd-text);
}

.wechat-contact__hint {
  margin: 6px 0 0;
  font-size: var(--cd-fs-sm);
  line-height: 1.6;
  color: var(--cd-text-2);
}

.wechat-contact__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  padding: 18px 20px;
  overflow-y: auto;
}

/* 白底 + 留边：保证微信扫码识别率，暗色主题下二维码也必须有静区 */
.wechat-contact__qr-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  background: #fff;
  border-radius: var(--cd-r-dialog);
  box-shadow: 0 8px 28px -18px rgba(0, 0, 0, 0.9);
}

.wechat-contact__qr {
  display: block;
  width: min(240px, 62vw);
  height: auto;
  user-select: none;
  -webkit-user-drag: none;
}

.wechat-contact__note {
  margin: 0;
  font-size: var(--cd-fs-label);
  line-height: 1.6;
  color: var(--cd-text-3);
  text-align: center;
}

.wechat-contact__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--cd-border-soft);
}
</style>
