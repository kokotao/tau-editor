<template>
  <div v-if="visible" class="cloud-sync-dialog-backdrop" data-testid="cloud-sync-dialog" @click.self="requestClose">
    <section class="cloud-sync-dialog" role="dialog" aria-modal="true">
      <header class="cloud-sync-dialog__header">
        <h3>{{ copy.title }}</h3>
        <span class="cloud-sync-dialog__file" :title="filePath ?? ''">{{ fileName || filePath }}</span>
        <button type="button" class="cloud-sync-dialog__close" data-testid="cloud-sync-dialog-close" @click="requestClose">×</button>
      </header>

      <div class="cloud-sync-dialog__body">
        <section class="cloud-sync-dialog__section">
          <label class="cloud-sync-dialog__label">{{ copy.categoryLabel }}</label>
          <button
            type="button"
            class="cloud-sync-dialog__trigger"
            data-testid="cloud-sync-dialog-category-trigger"
            :aria-expanded="categoryOpen"
            :disabled="busy"
            @click="toggleCategoryPanel()"
          >
            <span class="cloud-sync-dialog__trigger-text">{{ categoryLabel }}</span>
            <span class="cloud-sync-dialog__trigger-caret" aria-hidden="true">{{ categoryOpen ? '▴' : '▾' }}</span>
          </button>

          <div v-if="categoryOpen" class="cloud-sync-dialog__panel" data-testid="cloud-sync-dialog-category-panel">
            <input
              ref="categorySearchRef"
              v-model="search"
              class="cloud-sync-dialog__input"
              data-testid="cloud-sync-dialog-category-search"
              type="search"
              :placeholder="copy.searchPlaceholder"
              :disabled="busy"
            />
            <p v-if="categoriesState === 'loading'" class="cloud-sync-dialog__hint" data-testid="cloud-sync-dialog-categories-loading">
              {{ copy.categoriesLoading }}
            </p>
            <p
              v-else-if="categoriesState === 'failed'"
              class="cloud-sync-dialog__hint cloud-sync-dialog__hint--warn"
              data-testid="cloud-sync-dialog-categories-error"
            >
              {{ copy.categoriesFailed }}
            </p>
            <p
              v-else-if="categoryOptions.length === 0"
              class="cloud-sync-dialog__hint"
              data-testid="cloud-sync-dialog-categories-empty"
            >
              {{ copy.noCategories }}
            </p>
            <ul v-else class="cloud-sync-dialog__list" data-testid="cloud-sync-dialog-category-list">
              <li>
                <button
                  type="button"
                  class="cloud-sync-dialog__option"
                  :class="{ 'is-selected': selectedId === null && !newCategory.trim() }"
                  data-testid="cloud-sync-dialog-category-none"
                  :disabled="busy"
                  @click="clearCategory"
                >
                  {{ copy.none }}
                </button>
              </li>
              <li v-for="option in categoryOptions" :key="option.id">
                <button
                  type="button"
                  class="cloud-sync-dialog__option"
                  :class="{ 'is-selected': selectedId === option.id }"
                  :data-testid="`cloud-sync-dialog-category-${option.id}`"
                  :style="{ paddingLeft: `${8 + option.depth * 12}px` }"
                  :disabled="busy"
                  @click="selectCategory(option)"
                >
                  {{ option.name }}
                </button>
              </li>
            </ul>
          </div>
        </section>

        <section class="cloud-sync-dialog__section">
          <label class="cloud-sync-dialog__label">{{ copy.newCategoryLabel }}</label>
          <input
            v-model="newCategory"
            class="cloud-sync-dialog__input"
            data-testid="cloud-sync-dialog-new-category"
            type="text"
            :placeholder="copy.newCategoryPlaceholder"
            :disabled="busy"
          />
          <p class="cloud-sync-dialog__hint">{{ copy.newCategoryHint }}</p>
        </section>

        <div v-if="needsOverwrite" class="cloud-sync-dialog__conflict" data-testid="cloud-sync-dialog-conflict">
          <p class="cloud-sync-dialog__conflict-title">{{ copy.conflictTitle }}</p>
          <p class="cloud-sync-dialog__hint">{{ copy.conflictHint }}</p>
          <div class="cloud-sync-dialog__actions">
            <button
              type="button"
              class="cloud-sync-dialog__button"
              data-testid="cloud-sync-dialog-overwrite"
              :disabled="busy"
              @click="confirm(true)"
            >
              {{ copy.overwrite }}
            </button>
            <button
              type="button"
              class="cloud-sync-dialog__button"
              data-testid="cloud-sync-dialog-conflict-cancel"
              :disabled="busy"
              @click="requestClose"
            >
              {{ copy.cancel }}
            </button>
          </div>
        </div>

        <StatusNotice
          v-for="(line, index) in assetStatusLines"
          :key="`asset-${index}`"
          :tone="line.tone"
          :text="line.text"
          :details="line.details"
          collapsible
          :expand-label="copy.expandDetails"
          :collapse-label="copy.collapseDetails"
          :test-id="line.testId"
        />
        <StatusNotice
          v-if="notice"
          :tone="noticeTone"
          :text="notice"
          test-id="cloud-sync-dialog-notice"
        />
        <StatusNotice
          v-if="errorText"
          tone="error"
          :text="errorText"
          test-id="cloud-sync-dialog-error"
        />
      </div>

      <footer class="cloud-sync-dialog__footer">
        <button type="button" class="cloud-sync-dialog__button" data-testid="cloud-sync-dialog-cancel" :disabled="busy" @click="requestClose">
          {{ copy.cancel }}
        </button>
        <button
          type="button"
          class="cloud-sync-dialog__button cloud-sync-dialog__button--primary"
          data-testid="cloud-sync-dialog-confirm"
          :disabled="busy || !filePath"
          @click="confirm(false)"
        >
          {{ busy ? copy.syncing : copy.confirm }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 右键「同步至云端」的分类选择弹窗：选已有分类（可搜索）或新建分类名，确定后同步。
 * 新建分类按「文档级分类名」实现（写 category 自由文本，不调管理端分类接口）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 16:10
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { fetchManagedCategories } from '@/services/cloudCategoryService';
import { syncDocumentByPath, type CloudSyncResult } from '@/services/cloudSyncService';
import type { CloudAssetSyncSummary } from '@/services/cloudAssetService';
import { getCloudDocSyncI18n } from '@/i18n/ui';
import { isCategoryPath } from '@/lib/categoryPath';
import { ensureCategoryPath } from '@/services/cloudCategoryPathService';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useWorkspaceStore } from '@/stores/workspace';
import { resolveCloudDocIdentity, type CloudDocIdentityMeta } from '@/services/cloudSyncService';
import StatusNotice, { type StatusNoticeTone } from '@/components/ui/StatusNotice.vue';
import { useSettingsStore } from '@/stores/settings';
import type { CloudCategoryNode } from '@/lib/tauri';

const props = withDefaults(defineProps<{
  visible?: boolean;
  filePath?: string | null;
  fileName?: string;
  /** 云端文档 id：临时区落位的文档靠它认身份（回显分类 + 更新而非新建） */
  cloudFileId?: number | null;
  /** 云端完整路径（云端文档树节点的 path） */
  cloudPath?: string | null;
  /** 云端记录里的分类（DB 回显的第一来源） */
  category?: string | null;
  /** 云端记录里的分类 id：雪花 id 按字符串 */
  categoryId?: string | number | null;
}>(), {
  visible: false,
  filePath: null,
  fileName: '',
  cloudFileId: null,
  cloudPath: null,
  category: null,
  categoryId: null,
});

const emit = defineEmits<{
  close: [];
  synced: [result: CloudSyncResult];
}>();

const settingsStore = useSettingsStore();
const cloudSyncStore = useCloudSyncStore();
const workspaceStore = useWorkspaceStore();
const copy = computed(() => getCloudDocSyncI18n(settingsStore.uiLanguage));

interface CategoryOption {
  id: string;
  name: string;
  depth: number;
}

const categories = ref<CloudCategoryNode[]>([]);
const categoriesState = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle');
const search = ref('');
const selectedId = ref<string | null>(null);
const newCategory = ref('');
const busy = ref(false);
const notice = ref('');
const errorText = ref('');
const needsOverwrite = ref(false);
const noticeTone = ref<StatusNoticeTone>('info');
const lastAssets = ref<CloudAssetSyncSummary | null>(null);

/** 图片同步结果按分级拆成多行：失败红字加粗并带原因，成功一行，跳过黄色。 */
const assetStatusLines = computed<Array<{ tone: StatusNoticeTone; text: string; details: string[]; testId: string }>>(() => {
  const assets = lastAssets.value;
  if (!assets) {
    return [];
  }
  const lines: Array<{ tone: StatusNoticeTone; text: string; details: string[]; testId: string }> = [];
  if (assets.failed > 0) {
    lines.push({
      tone: 'error',
      text: copy.value.assetsFailed(assets.failed),
      details: assets.failures.map((item) => `${item.relPath}: ${item.reason}`),
      testId: 'cloud-sync-dialog-assets-failed',
    });
  }
  if (assets.uploaded > 0 || assets.unchanged > 0) {
    lines.push({
      tone: 'success',
      text: copy.value.assetsSummary(assets.total, assets.uploaded, assets.unchanged),
      details: [],
      testId: 'cloud-sync-dialog-assets-summary',
    });
  }
  if (assets.skipped > 0) {
    lines.push({
      tone: 'warning',
      text: copy.value.assetsSkipped(assets.skipped),
      details: [],
      testId: 'cloud-sync-dialog-assets-skipped',
    });
  }
  if (assets.disabled) {
    lines.push({
      tone: 'warning',
      text: '同步文档内图片已关闭，文中图片不会同步',
      details: [],
      testId: 'cloud-sync-dialog-assets-disabled',
    });
  }
  return lines;
});

const flatten = (nodes: CloudCategoryNode[], depth = 0): CategoryOption[] => {
  const options: CategoryOption[] = [];
  for (const node of nodes) {
    options.push({ id: node.id, name: node.name, depth });
    options.push(...flatten(node.children ?? [], depth + 1));
  }
  return options;
};

const categoryOpen = ref(false);
const categorySearchRef = ref<HTMLInputElement | null>(null);

const allOptions = computed(() => flatten(categories.value));

/** 触发器上显示：已选分类名 / 手填的新分类 / 「不分类」 */
const categoryLabel = computed(() => {
  if (newCategory.value.trim()) {
    return newCategory.value.trim();
  }
  const matched = allOptions.value.find((option) => option.id === selectedId.value);
  return matched ? matched.name : copy.value.none;
});

function toggleCategoryPanel(): void {
  categoryOpen.value = !categoryOpen.value;
  if (categoryOpen.value && selectedId.value === null && !newCategory.value.trim()) {
    applyInitialCategory();
  }
  if (categoryOpen.value) {
    void nextTick(() => categorySearchRef.value?.focus());
  }
}
const categoryOptions = computed(() => {
  const needle = search.value.trim().toLowerCase();
  if (!needle) {
    return allOptions.value;
  }
  return allOptions.value.filter((option) => option.name.toLowerCase().includes(needle));
});

async function loadCategories(): Promise<void> {
  categoriesState.value = 'loading';
  const outcome = await fetchManagedCategories();
  if (outcome.ok) {
    categories.value = outcome.data;
    categoriesState.value = 'ready';
    applyInitialCategory();
    return;
  }
  categories.value = [];
  categoriesState.value = 'failed';
}

function resetState(): void {
  search.value = '';
  selectedId.value = null;
  newCategory.value = '';
  categoryOpen.value = false;
  busy.value = false;
  notice.value = '';
  errorText.value = '';
  noticeTone.value = 'info';
  lastAssets.value = null;
  needsOverwrite.value = false;
}

function selectCategory(option: CategoryOption): void {
  if (busy.value) {
    return;
  }
  selectedId.value = option.id;
  // 选已有分类与新建分类互斥
  newCategory.value = '';
  closeCategoryPanel();
}

/**
 * 打开弹窗时回显该文档在云端已有的分类。
 *
 * 回显优先级（都是"云端数据"，不再依赖本地路径反推）：
 * 1. 调用方直接传进来的云端记录字段 categoryId / category（来自 CloudDocItem，最权威、无额外请求）；
 * 2. docMap 里按 fileId 命中的元数据（同一份云端记录的历史快照）；
 * 3. 最后才用本地路径推导一次（仅覆盖"文档就在当前工作区内"的老场景）。
 */
function applyInitialCategory(): void {
  const matchById = (rawId: string | number | null | undefined): CategoryOption | undefined => {
    if (rawId === null || rawId === undefined || rawId === '') {
      return undefined;
    }
    return allOptions.value.find((option) => String(option.id) === String(rawId));
  };
  const matchByName = (rawName: string | null | undefined): CategoryOption | undefined => {
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    return name ? allOptions.value.find((option) => option.name === name) : undefined;
  };

  // 1) 云端记录字段（DB 里有存 category/categoryId，直接回显）
  const fromProps = matchById(props.categoryId) ?? matchByName(props.category);
  if (fromProps) {
    selectedId.value = fromProps.id;
    return;
  }

  // 2) docMap：按 fileId（或云端路径）命中的历史元数据
  const filePath = props.filePath ?? '';
  // store 里每条记录都带 fileId；按服务层的身份元数据结构收窄，便于直接传给 resolveCloudDocIdentity
  const docMap = cloudSyncStore.docMap as unknown as Record<string, CloudDocIdentityMeta>;
  let record: CloudDocIdentityMeta | undefined;
  if (props.cloudFileId !== null) {
    record = Object.values(docMap).find((item) => item.fileId === props.cloudFileId);
  }
  if (!record && filePath) {
    const identity = resolveCloudDocIdentity({
      filePath,
      cloudFileId: props.cloudFileId,
      cloudPath: props.cloudPath,
      docMap,
      workspaceName: workspaceStore.currentWorkspaceName,
      workspacePath: workspaceStore.currentWorkspacePath,
    });
    record = identity.meta ?? docMap[identity.cloudPath];
  }
  if (!record) {
    return;
  }
  const fromDocMap = matchById(record.categoryId) ?? matchByName(record.category);
  if (fromDocMap) {
    selectedId.value = fromDocMap.id;
  }
}

function closeCategoryPanel(): void {
  categoryOpen.value = false;
}

function handleOutsideClick(event: MouseEvent): void {
  if (!categoryOpen.value) {
    return;
  }
  const target = event.target;
  if (target instanceof Element && target.closest('.cloud-sync-dialog__panel, .cloud-sync-dialog__trigger')) {
    return;
  }
  closeCategoryPanel();
}

// 分类面板展开后点空白处收起（弹窗本身不关闭）；卸载时解绑，避免残留监听。
onMounted(() => {
  document.addEventListener('mousedown', handleOutsideClick);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', handleOutsideClick);
});

function clearCategory(): void {
  if (busy.value) {
    return;
  }
  selectedId.value = null;
  newCategory.value = '';
  closeCategoryPanel();
}

/** 分类选择与「新建分类」互斥：填了名称就忽略选中项。 */
const resolveCategory = (): { category: string | null; categoryId: string | null } => {
  const typed = newCategory.value.trim();
  if (typed) {
    return { category: typed, categoryId: null };
  }
  const selected = allOptions.value.find((option) => option.id === selectedId.value);
  if (!selected) {
    return { category: null, categoryId: null };
  }
  // 分类 id 是雪花 id（> 2^53）：按字符串原样下发，绝不能再转 number
  return {
    category: selected.name,
    categoryId: selected.id,
  };
};

async function confirm(overwrite: boolean): Promise<void> {
  const filePath = props.filePath;
  if (!filePath || busy.value) {
    return;
  }
  busy.value = true;
  errorText.value = '';
  notice.value = '';
  try {
    let category = resolveCategory();
    // 「新建分类」输入框支持 A/B/C 多级：先确保路径存在，再用末级分类同步
    if (category.category && isCategoryPath(category.category)) {
      const ensured = await ensureCategoryPath({ path: category.category });
      if (!ensured.ok) {
        errorText.value = copy.value.failed(ensured.message);
        return;
      }
      category = { category: ensured.data.name, categoryId: ensured.data.id };
    }
    const result = await syncDocumentByPath({
      filePath,
      // 云端身份：临时区落位的文档必须靠 fileId/cloudPath 定位，避免被当成新文档
      fileId: props.cloudFileId,
      cloudPath: props.cloudPath,
      category: category.category,
      categoryId: category.categoryId,
      overwrite,
    });

    lastAssets.value = result.assets ?? null;
    if (result.status === 'conflict') {
      needsOverwrite.value = true;
      noticeTone.value = 'warning';
      notice.value = result.message ?? copy.value.conflictHint;
      return;
    }
    if (result.status === 'skipped') {
      needsOverwrite.value = false;
      noticeTone.value = 'success';
      notice.value = result.message || copy.value.alreadySynced;
      return;
    }
    if (result.status === 'failed') {
      errorText.value = copy.value.failed(result.message ?? '');
      return;
    }
    noticeTone.value = 'success';
    // 成功后关闭弹窗；居中 toast 由 App 用 i18n 统一弹（避免两处各弹一次）
    emit('synced', result);
    emit('close');
  } catch (syncError) {
    errorText.value = copy.value.failed(syncError instanceof Error ? syncError.message : String(syncError));
  } finally {
    busy.value = false;
  }
}

function requestClose(): void {
  if (busy.value) {
    return;
  }
  emit('close');
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      return;
    }
    resetState();
    void loadCategories();
  },
  { immediate: true },
);

// 同一个弹窗被不同文档复用（或分类数据晚到）时，重新回显一次，避免停在上一个文档的分类上
watch(
  () => [props.filePath, props.cloudFileId, props.category, props.categoryId] as const,
  () => {
    if (!props.visible || categoriesState.value !== 'ready') {
      return;
    }
    if (newCategory.value.trim()) {
      return;
    }
    selectedId.value = null;
    applyInitialCategory();
  },
);

defineExpose({ confirm, resolveCategory });
</script>

<style scoped>
.cloud-sync-dialog-backdrop {
  position: fixed;
  inset: 0;
  /* 高于设置面板/浏览面板，低于最顶层 toast */
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6vh 6vw;
  background: var(--bg-backdrop, rgba(8, 13, 26, 0.78));
}

.cloud-sync-dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(520px, 100%);
  max-height: 100%;
  min-height: 0;
  padding: 14px 16px;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-elevated, #151d2d);
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.38));
  border-radius: var(--radius-dialog, 10px);
  box-shadow: var(--shadow-overlay, 0 24px 60px rgba(0, 0, 0, 0.45));
}

.cloud-sync-dialog__header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.cloud-sync-dialog__header h3 {
  flex-shrink: 0;
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
}

.cloud-sync-dialog__file {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 11.5px;
  color: var(--text-muted, #75829e);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-sync-dialog__close {
  padding: 0 4px;
  font-size: 16px;
  line-height: 1;
  color: var(--text-secondary, #a8b3c5);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.cloud-sync-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: auto;
}

.cloud-sync-dialog__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cloud-sync-dialog__label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary, #a8b3c5);
}

.cloud-sync-dialog__input {
  width: 100%;
  padding: 5px 9px;
  font-size: 12px;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-base, #101726);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-sync-dialog__input:focus {
  border-color: var(--accent-brand, #7cc7ff);
  outline: none;
}

/* ---------- 分类下拉：点击展开 + 搜索 ---------- */
.cloud-sync-dialog__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--text-primary, #e5e9f0);
  text-align: left;
  cursor: pointer;
  background: var(--panel-base, #101726);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-sync-dialog__trigger:hover:not(:disabled) {
  border-color: var(--accent-brand, #7cc7ff);
}

.cloud-sync-dialog__trigger-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-sync-dialog__trigger-caret {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted, #75829e);
}

.cloud-sync-dialog__panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  padding: 6px;
  margin-top: 4px;
  overflow: auto;
  background: var(--panel-base, #101726);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}
.cloud-sync-dialog__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 180px;
  margin: 0;
  padding: 2px;
  overflow: auto;
  list-style: none;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-sync-dialog__option {
  width: 100%;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-secondary, #a8b3c5);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control, 5px);
}

.cloud-sync-dialog__option:hover {
  color: var(--text-primary, #e5e9f0);
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.cloud-sync-dialog__option.is-selected {
  color: var(--accent-brand, #7cc7ff);
  background: var(--surface-active, rgba(124, 199, 255, 0.14));
}

.cloud-sync-dialog__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted, #75829e);
}

.cloud-sync-dialog__hint--warn {
  color: var(--state-warning, #fbbf24);
}

.cloud-sync-dialog__hint--error {
  color: var(--state-danger, #dc2626);
}

.cloud-sync-dialog__conflict {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--panel-base, #101726);
  border: 1px solid var(--state-warning, #fbbf24);
  border-radius: var(--radius-card, 7px);
}

.cloud-sync-dialog__conflict-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}

.cloud-sync-dialog__actions,
.cloud-sync-dialog__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cloud-sync-dialog__footer {
  justify-content: flex-end;
  padding-top: 4px;
  border-top: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
}

.cloud-sync-dialog__button {
  padding: 5px 12px;
  font-size: 11.5px;
  color: var(--text-primary, #e5e9f0);
  cursor: pointer;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-sync-dialog__button:hover:not(:disabled) {
  border-color: var(--accent-brand, #7cc7ff);
  color: var(--accent-brand, #7cc7ff);
}

.cloud-sync-dialog__button--primary {
  color: var(--accent-brand, #7cc7ff);
  border-color: var(--accent-brand, #7cc7ff);
}

.cloud-sync-dialog__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
