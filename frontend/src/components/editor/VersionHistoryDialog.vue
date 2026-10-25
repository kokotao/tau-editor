<template>
  <div v-if="visible" class="cloud-hist-backdrop" data-testid="version-history-dialog" @click.self="emit('close')">
    <section class="cloud-hist" role="dialog" aria-modal="true" @keydown.esc.prevent="emit('close')">
      <header class="cloud-hist__header">
        <h3 data-testid="version-history-title">{{ copy.historyTitle(fileName || '') }}</h3>
        <button type="button" class="cloud-hist__close" data-testid="version-history-close" @click="emit('close')">×</button>
      </header>

      <p v-if="loading" class="cloud-hist__hint" data-testid="version-history-loading">{{ copy.historyLoading }}</p>
      <p v-else-if="error" class="cloud-hist__hint cloud-hist__hint--error" data-testid="version-history-error">{{ error }}</p>
      <p v-else-if="versions.length === 0" class="cloud-hist__hint" data-testid="version-history-empty">{{ copy.historyEmpty }}</p>
      <ul v-else class="cloud-hist__list" data-testid="version-history-list">
        <li
          v-for="row in versions"
          :key="row.versionId"
          class="cloud-hist__row"
          :class="{ 'is-current': row.version === currentVersion }"
          :data-testid="`version-history-row-${row.version}`"
        >
          <span class="cloud-hist__version">{{ copy.versionLabel(row.version) }}</span>
          <span v-if="row.version === currentVersion" class="cloud-hist__badge">{{ copy.currentVersion }}</span>
          <span class="cloud-hist__meta">
            <span v-if="row.createdAt">{{ formatTime(row.createdAt) }}</span>
            <span>{{ formatSize(row.size) }}</span>
            <span v-if="row.remark" class="cloud-hist__remark">{{ row.remark }}</span>
          </span>
          <button
            type="button"
            class="cloud-hist__button"
            :data-testid="`version-history-restore-${row.version}`"
            :disabled="busy || row.version === currentVersion"
            @click="restore(row.version, row.versionId)"
          >
            {{ copy.restore }}
          </button>
        </li>
      </ul>

      <p v-if="notice" class="cloud-hist__hint" data-testid="version-history-notice">{{ notice }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 云文档历史版本弹窗：标题写清「《文件名》的历史版本」，列出时间/大小/说明并可恢复。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 19:20
 */
import { computed, ref, watch } from 'vue';
import { listCloudDocVersions, restoreCloudDocVersion } from '@/services/cloudDocService';
import { getCloudDocPanelI18n } from '@/i18n/ui';
import { useSettingsStore } from '@/stores/settings';
import type { CloudDocVersion } from '@/lib/tauri';

const props = withDefaults(defineProps<{
  visible?: boolean;
  fileId?: number | null;
  fileName?: string;
  currentVersion?: number | null;
}>(), { visible: false, fileId: null, fileName: '', currentVersion: null });

const emit = defineEmits<{ close: []; restored: [version: number] }>();

const settingsStore = useSettingsStore();
const copy = computed(() => getCloudDocPanelI18n(settingsStore.uiLanguage));

const versions = ref<CloudDocVersion[]>([]);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const notice = ref('');

function formatTime(value: string | null): string {
  if (!value) {
    return '';
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(settingsStore.uiLanguage) : value;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index] ?? 'B'}`;
}

async function load(): Promise<void> {
  const fileId = props.fileId;
  versions.value = [];
  error.value = '';
  notice.value = '';
  if (fileId === null || fileId === undefined) {
    return;
  }
  loading.value = true;
  try {
    const outcome = await listCloudDocVersions(fileId);
    if (!outcome.ok) {
      error.value = copy.value.loadFailed(outcome.message);
      return;
    }
    versions.value = outcome.data;
  } finally {
    loading.value = false;
  }
}

async function restore(version: number, versionId: number): Promise<void> {
  const fileId = props.fileId;
  if (fileId === null || fileId === undefined || busy.value) {
    return;
  }
  busy.value = true;
  try {
    const outcome = await restoreCloudDocVersion(fileId, versionId);
    if (!outcome.ok) {
      error.value = copy.value.loadFailed(outcome.message);
      return;
    }
    emit('restored', outcome.data.version);
    await load();
    // load() 会清空 notice，恢复提示放在刷新之后
    notice.value = copy.value.restoreDone(outcome.data.version);
  } finally {
    busy.value = false;
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void load();
    }
  },
  { immediate: true },
);

defineExpose({ load });
</script>

<style scoped>
.cloud-hist-backdrop {
  position: fixed;
  inset: 0;
  z-index: 12500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6vh 6vw;
  background: var(--bg-backdrop, rgba(8, 13, 26, 0.78));
}

.cloud-hist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(560px, 100%);
  max-height: min(640px, 88vh);
  padding: 14px 16px;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-elevated, #151d2d);
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.38));
  border-radius: var(--radius-dialog, 10px);
  box-shadow: var(--shadow-overlay, 0 24px 60px rgba(0, 0, 0, 0.45));
}

.cloud-hist__header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.cloud-hist__header h3 {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-hist__close {
  padding: 0 4px;
  font-size: 16px;
  line-height: 1;
  color: var(--text-secondary, #a8b3c5);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.cloud-hist__hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-muted, #75829e);
}

.cloud-hist__hint--error {
  color: var(--state-danger, #dc2626);
}

.cloud-hist__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.cloud-hist__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  border-radius: var(--radius-control, 5px);
}

.cloud-hist__row:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.cloud-hist__row.is-current {
  background: var(--surface-active, rgba(124, 199, 255, 0.14));
}

.cloud-hist__version {
  font-weight: 600;
  white-space: nowrap;
}

.cloud-hist__badge {
  padding: 0 6px;
  font-size: 10px;
  color: var(--accent-brand, #7cc7ff);
  border: 1px solid var(--accent-brand, #7cc7ff);
  border-radius: var(--radius-badge, 999px);
}

.cloud-hist__meta {
  display: flex;
  gap: 8px;
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted, #75829e);
}

.cloud-hist__remark {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-hist__button {
  padding: 3px 10px;
  font-size: 11.5px;
  color: var(--text-primary, #e5e9f0);
  cursor: pointer;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-hist__button:hover:not(:disabled) {
  color: var(--accent-brand, #7cc7ff);
  border-color: var(--accent-brand, #7cc7ff);
}

.cloud-hist__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
