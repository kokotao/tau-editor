<template>
  <Teleport to="body">
    <div v-if="visible" class="cd-backdrop cd-nocturne" data-testid="cloud-doc-conflict-overlay" @click.self="emit('close')">
      <section
        class="cloud-conflict cd-dialog cd-dialog--compact"
        data-testid="cloud-doc-conflict-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="copy.title"
      >
        <header class="cloud-conflict__header">
          <span class="cloud-conflict__icon" aria-hidden="true">⚠</span>
          <div class="cloud-conflict__heading">
            <h3 class="cloud-conflict__title" data-testid="cloud-doc-conflict-title">{{ copy.title }}</h3>
            <p v-if="fileName" class="cloud-conflict__file cd-mono" data-testid="cloud-doc-conflict-file">{{ fileName }}</p>
          </div>
          <button type="button" class="cd-icon-btn cd-icon-btn--close" :aria-label="copy.close" @click="emit('close')">×</button>
        </header>

        <div class="cloud-conflict__body">
          <p class="cloud-conflict__intro" data-testid="cloud-doc-conflict-intro">{{ copy.intro }}</p>
          <p v-if="message" class="cloud-conflict__message" data-testid="cloud-doc-conflict-message">{{ message }}</p>

          <div class="cloud-conflict__versions">
            <div class="cloud-conflict__version">
              <span class="cloud-conflict__version-label">{{ copy.localLabel }}</span>
              <span class="cloud-conflict__version-value cd-mono">{{ copy.localValue }}</span>
            </div>
            <div class="cloud-conflict__version">
              <span class="cloud-conflict__version-label">{{ copy.remoteLabel }}</span>
              <span class="cloud-conflict__version-value cd-mono">{{ remoteVersion ? `v${remoteVersion}` : copy.remoteUnknown }}</span>
            </div>
          </div>

          <ul class="cloud-conflict__options">
            <li class="cloud-conflict__option cloud-conflict__option--recommended">
              <span class="cloud-conflict__option-title">{{ copy.saveCopy }}</span>
              <span class="cloud-conflict__option-hint">{{ copy.saveCopyHint }}</span>
            </li>
            <li class="cloud-conflict__option">
              <span class="cloud-conflict__option-title">{{ copy.keepMine }}</span>
              <span class="cloud-conflict__option-hint">{{ copy.keepMineHint }}</span>
            </li>
            <li class="cloud-conflict__option">
              <span class="cloud-conflict__option-title">{{ copy.useRemote }}</span>
              <span class="cloud-conflict__option-hint">{{ copy.useRemoteHint }}</span>
            </li>
          </ul>
        </div>

        <footer class="cloud-conflict__actions">
          <button type="button" class="cd-btn cd-btn--ghost" :disabled="busy" data-testid="cloud-doc-conflict-cancel" @click="emit('close')">
            {{ copy.later }}
          </button>
          <button type="button" class="cd-btn cd-btn--secondary" :disabled="busy" data-testid="cloud-doc-conflict-use-remote" @click="emit('useRemote')">
            {{ copy.useRemote }}
          </button>
          <button type="button" class="cd-btn cd-btn--secondary" :disabled="busy" data-testid="cloud-doc-conflict-keep-mine" @click="emit('keepMine')">
            {{ copy.keepMine }}
          </button>
          <button type="button" class="cd-btn cd-btn--primary" :disabled="busy" data-testid="cloud-doc-conflict-save-copy" @click="emit('saveCopy')">
            {{ busy ? copy.busy : copy.saveCopy }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @description 云端文档保存冲突（409）三选一对话框：保留我的 / 用云端版本 / 另存副本。
 * 云端内容被另一处更新时，保存会被服务端乐观锁拒绝；此前的实现只发一条通知、不提供出口，
 * 该对话框把编辑流水线里的 resolveConflict 决策接到 UI 上。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 10:05
 */
import { computed } from 'vue';
import { getCloudDocConflictI18n } from '@/i18n/ui';
import { useSettingsStore } from '@/stores/settings';

const props = withDefaults(defineProps<{
  visible?: boolean;
  fileName?: string;
  message?: string;
  /** 冲突时云端最新版本号，仅用于展示 */
  remoteVersion?: number | null;
  busy?: boolean;
}>(), {
  visible: false,
  fileName: '',
  message: '',
  remoteVersion: null,
  busy: false,
});

const emit = defineEmits<{
  close: [];
  keepMine: [];
  useRemote: [];
  saveCopy: [];
}>();

const settingsStore = useSettingsStore();
const copy = computed(() => getCloudDocConflictI18n(settingsStore.uiLanguage));
</script>

<style scoped>
.cloud-conflict {
  width: min(600px, calc(100vw - 32px));
  max-height: min(84vh, 720px);
}

.cloud-conflict__header {
  display: flex;
  flex: 0 0 auto;
  gap: 10px;
  align-items: flex-start;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--cd-border-soft);
}

.cloud-conflict__icon {
  flex: 0 0 auto;
  font-size: 18px;
  line-height: 1.2;
  color: var(--cd-warning);
}

.cloud-conflict__heading {
  flex: 1;
  min-width: 0;
}

.cloud-conflict__title {
  margin: 0;
  font-size: var(--cd-fs-title);
  font-weight: 600;
  color: var(--cd-text);
}

.cloud-conflict__file {
  margin: 2px 0 0;
  overflow: hidden;
  font-size: var(--cd-fs-label);
  color: var(--cd-text-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-conflict__body {
  flex: 1 1 auto;
  padding: 14px 18px;
  overflow-y: auto;
}

.cloud-conflict__intro {
  margin: 0 0 6px;
  font-size: var(--cd-fs-sm);
  line-height: 1.6;
  color: var(--cd-text-2);
}

.cloud-conflict__message {
  margin: 0 0 12px;
  font-family: var(--cd-font-mono);
  font-size: var(--cd-fs-label);
  color: var(--cd-danger);
  word-break: break-word;
}

.cloud-conflict__versions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.cloud-conflict__version {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  background: var(--cd-bg-card);
  border: 1px solid var(--cd-border-soft);
  border-radius: var(--cd-r-panel);
}

.cloud-conflict__version-label {
  font-size: var(--cd-fs-label);
  color: var(--cd-text-3);
}

.cloud-conflict__version-value {
  font-size: var(--cd-fs-meta);
  color: var(--cd-text);
}

.cloud-conflict__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cloud-conflict__option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--cd-bg-card) 70%, transparent);
  border: 1px solid transparent;
  border-radius: var(--cd-r-panel);
}

.cloud-conflict__option--recommended {
  border-color: color-mix(in srgb, var(--cd-accent) 40%, transparent);
  background: var(--cd-active);
}

.cloud-conflict__option-title {
  font-size: var(--cd-fs-sm);
  font-weight: 500;
  color: var(--cd-text);
}

.cloud-conflict__option-hint {
  font-size: var(--cd-fs-label);
  color: var(--cd-text-2);
}

.cloud-conflict__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  padding: 12px 18px;
  border-top: 1px solid var(--cd-border-soft);
}
</style>
