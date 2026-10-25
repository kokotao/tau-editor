<template>
  <div v-if="visible" class="cloud-props-backdrop" data-testid="doc-properties-dialog" @click.self="emit('close')">
    <section class="cloud-props" role="dialog" aria-modal="true" @keydown.esc.prevent="emit('close')">
      <header class="cloud-props__header">
        <h3 data-testid="doc-properties-title">{{ copy.propsTitle }}</h3>
        <button type="button" class="cloud-props__close" data-testid="doc-properties-close" @click="emit('close')">×</button>
      </header>

      <p v-if="loading" class="cloud-props__hint" data-testid="doc-properties-loading">{{ copy.historyLoading }}</p>
      <p v-else-if="error" class="cloud-props__hint cloud-props__hint--error" data-testid="doc-properties-error">{{ error }}</p>

      <div v-else class="cloud-props__body">
        <dl class="cloud-props__meta" data-testid="doc-properties-meta">
          <div><dt>{{ copy.fileNameLabel }}</dt><dd data-testid="doc-properties-name">{{ detail?.title || doc?.title || '' }}</dd></div>
          <div><dt>{{ copy.pathLabel }}</dt><dd data-testid="doc-properties-path">{{ detail?.path || doc?.path || '' }}</dd></div>
          <div><dt>{{ copy.sizeLabel }}</dt><dd>{{ formatSize(detail?.size ?? doc?.size ?? 0) }}</dd></div>
          <div><dt>{{ copy.currentVersionLabel }}</dt><dd data-testid="doc-properties-version">v{{ detail?.version ?? doc?.version ?? 0 }}</dd></div>
          <div><dt>{{ copy.createdAtLabel }}</dt><dd>{{ formatTime(detail?.createdAt ?? null) }}</dd></div>
          <div><dt>{{ copy.updatedAtLabel }}</dt><dd>{{ formatTime(detail?.updatedAt ?? null) }}</dd></div>
          <div>
            <dt>{{ copy.sharedLabel }}</dt>
            <dd data-testid="doc-properties-shared">
              {{ shared ? copy.sharedYes : copy.sharedNo }}
              <a v-if="shared && shareUrl" class="cloud-props__link" :href="shareUrl" @click.prevent="openShare">{{ shareUrl }}</a>
            </dd>
          </div>
        </dl>

        <label class="cloud-props__field">
          <span>{{ copy.categoryLabel }}</span>
          <select v-model="categorySelection" class="cloud-props__input" data-testid="doc-properties-category">
            <option value="">{{ copy.moveRoot }}</option>
            <option
              v-for="option in categoryOptions"
              :key="option.id"
              :value="option.id"
            >
              {{ `${'　'.repeat(Math.max(0, option.depth - 1))}${option.name}` }}
            </option>
          </select>
        </label>

        <label class="cloud-props__field">
          <span>{{ copy.tagsLabel }}</span>
          <input v-model="tagsText" class="cloud-props__input" data-testid="doc-properties-tags" type="text" />
        </label>

        <label class="cloud-props__field">
          <span>{{ copy.visibilityLabel }}</span>
          <select v-model="visibility" class="cloud-props__input" data-testid="doc-properties-visibility">
            <option value="PRIVATE">{{ copy.visibilityPrivate }}</option>
            <option value="PUBLIC">{{ copy.visibilityPublic }}</option>
          </select>
        </label>

        <div class="cloud-props__actions">
          <button type="button" class="cloud-props__button" data-testid="doc-properties-cancel" @click="emit('close')">
            {{ copy.cancel }}
          </button>
          <button
            type="button"
            class="cloud-props__button cloud-props__button--primary"
            data-testid="doc-properties-save"
            :disabled="busy"
            @click="save"
          >
            {{ busy ? copy.saving : copy.save }}
          </button>
        </div>

        <p v-if="notice" class="cloud-props__hint" data-testid="doc-properties-notice">{{ notice }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 云文档属性弹窗：读云端详情 + 分类/标签/可见性（可改），只在有改动时提交。
 * 新文档默认 PRIVATE；分享状态一并展示。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 19:25
 */
import { computed, ref, watch } from 'vue';
import { appCommands, type CloudDocItem } from '@/lib/tauri';
import { getCloudDoc, saveCloudDoc } from '@/services/cloudDocService';
import { fetchManagedCategories, flattenCategoryTree } from '@/services/cloudCategoryService';
import { getShareStatus } from '@/services/cloudShareService';
import { getCloudDocPanelI18n } from '@/i18n/ui';
import { useSettingsStore } from '@/stores/settings';

const props = withDefaults(defineProps<{
  visible?: boolean;
  doc?: CloudDocItem | null;
}>(), { visible: false, doc: null });

const emit = defineEmits<{ close: []; saved: [] }>();

const settingsStore = useSettingsStore();
const copy = computed(() => getCloudDocPanelI18n(settingsStore.uiLanguage));

const detail = ref<CloudDocItem & { content?: string | null; createdAt?: string | null } | null>(null);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const categories = ref<{ id: string; name: string; depth: number }[]>([]);
const categorySelection = ref('');
const tagsText = ref('');
const visibility = ref<'PRIVATE' | 'PUBLIC'>('PRIVATE');
const shared = ref(false);
const shareUrl = ref('');
/** 原始值，用于「有改动才提交」判断 */
const initial = ref({ categoryId: '', tags: '', visibility: 'PRIVATE' as 'PRIVATE' | 'PUBLIC' });

const categoryOptions = computed(() => categories.value);

function formatTime(value: string | null): string {
  if (!value) {
    return '—';
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

async function openShare(): Promise<void> {
  if (!shareUrl.value) {
    return;
  }
  try {
    await appCommands.openExternalLink(shareUrl.value);
  } catch {
    // 打不开时保留链接文本让用户手动复制
  }
}

async function load(): Promise<void> {
  const doc = props.doc;
  detail.value = null;
  error.value = '';
  notice.value = '';
  shared.value = false;
  shareUrl.value = '';
  if (!doc) {
    return;
  }
  loading.value = true;
  try {
    const [outcome, categoriesOutcome] = await Promise.all([
      getCloudDoc(doc.fileId),
      fetchManagedCategories(),
    ]);
    if (outcome.ok) {
      detail.value = outcome.data;
      tagsText.value = outcome.data.tags ?? '';
      visibility.value = outcome.data.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE';
      categorySelection.value = outcome.data.categoryId === null || outcome.data.categoryId === undefined
        ? ''
        : String(outcome.data.categoryId);
      initial.value = {
        categoryId: categorySelection.value,
        tags: tagsText.value,
        visibility: visibility.value,
      };
    } else {
      error.value = copy.value.loadFailed(outcome.message);
    }
    categories.value = categoriesOutcome.ok
      ? flattenCategoryTree(categoriesOutcome.data).map((row) => ({ id: row.id, name: row.name, depth: row.depth }))
      : [];

    const status = await getShareStatus(doc.fileId);
    if (status.ok) {
      shared.value = Boolean(status.data.shared);
      shareUrl.value = status.data.shareUrl ?? '';
    }
  } finally {
    loading.value = false;
  }
}

/** 只在有改动时提交，未改动直接提示。 */
async function save(): Promise<void> {
  const doc = props.doc;
  const current = detail.value;
  if (!doc || busy.value) {
    return;
  }
  const changed: {
    categoryId?: number | null;
    category?: string | null;
    tags?: string | null;
    visibility?: 'PRIVATE' | 'PUBLIC';
  } = {};
  if (categorySelection.value !== initial.value.categoryId) {
    const numeric = Number(categorySelection.value);
    changed.categoryId = categorySelection.value && Number.isFinite(numeric) ? numeric : null;
    changed.category = categorySelection.value
      ? categories.value.find((item) => item.id === categorySelection.value)?.name ?? null
      : null;
  }
  if (tagsText.value !== initial.value.tags) {
    changed.tags = tagsText.value.trim() || null;
  }
  if (visibility.value !== initial.value.visibility) {
    changed.visibility = visibility.value;
  }
  if (Object.keys(changed).length === 0) {
    notice.value = copy.value.nothingChanged;
    return;
  }
  busy.value = true;
  notice.value = '';
  try {
    const outcome = await saveCloudDoc({
      path: current?.path ?? doc.path,
      title: current?.title ?? doc.title,
      baseVersion: current?.version ?? doc.version,
      ...changed,
    });
    if (!outcome.ok) {
      error.value = copy.value.loadFailed(outcome.message);
      return;
    }
    notice.value = copy.value.saved;
    emit('saved');
    await load();
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

defineExpose({ load, save });
</script>

<style scoped>
.cloud-props-backdrop {
  position: fixed;
  inset: 0;
  z-index: 12500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6vh 6vw;
  background: var(--bg-backdrop, rgba(8, 13, 26, 0.78));
}

.cloud-props {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(560px, 100%);
  max-height: min(680px, 88vh);
  padding: 14px 16px;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-elevated, #151d2d);
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.38));
  border-radius: var(--radius-dialog, 10px);
  box-shadow: var(--shadow-overlay, 0 24px 60px rgba(0, 0, 0, 0.45));
}

.cloud-props__header {
  display: flex;
  align-items: baseline;
}

.cloud-props__header h3 {
  flex: 1;
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
}

.cloud-props__close {
  padding: 0 4px;
  font-size: 16px;
  color: var(--text-secondary, #a8b3c5);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.cloud-props__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: auto;
}

.cloud-props__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 6px 16px;
  margin: 0;
  font-size: 11.5px;
}

.cloud-props__meta dt {
  color: var(--text-muted, #75829e);
}

.cloud-props__meta dd {
  margin: 0;
  overflow: hidden;
  color: var(--text-secondary, #a8b3c5);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-props__link {
  margin-left: 6px;
  color: var(--accent-brand, #7cc7ff);
  text-decoration: underline;
  cursor: pointer;
}

.cloud-props__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11.5px;
  color: var(--text-secondary, #a8b3c5);
}

.cloud-props__input {
  padding: 5px 9px;
  font-size: 12px;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-base, #101726);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-props__input:focus {
  border-color: var(--accent-brand, #7cc7ff);
  outline: none;
}

.cloud-props__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
}

.cloud-props__button {
  padding: 5px 12px;
  font-size: 11.5px;
  color: var(--text-primary, #e5e9f0);
  cursor: pointer;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-props__button:hover:not(:disabled) {
  color: var(--accent-brand, #7cc7ff);
  border-color: var(--accent-brand, #7cc7ff);
}

.cloud-props__button--primary {
  color: var(--accent-brand, #7cc7ff);
  border-color: var(--accent-brand, #7cc7ff);
}

.cloud-props__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.cloud-props__hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted, #75829e);
}

.cloud-props__hint--error {
  color: var(--state-danger, #dc2626);
}
</style>
