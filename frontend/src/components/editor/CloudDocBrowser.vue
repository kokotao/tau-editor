<template>
  <div
    v-if="visible"
    class="cloud-browser-backdrop"
    data-testid="cloud-doc-browser-backdrop"
    @click.self="emit('close')"
  >
    <section
      class="cloud-browser"
      data-testid="cloud-doc-browser"
      role="dialog"
      aria-modal="true"
      @keydown.esc.prevent="emit('close')"
    >
      <header class="cloud-browser__header">
        <div class="cloud-browser__title">
          <h2>{{ copy.title }}</h2>
          <span class="cloud-browser__count" data-testid="cloud-browser-count">{{ countLabel }}</span>
        </div>
        <div class="cloud-browser__actions">
          <input
            ref="searchInputRef"
            v-model="keywordInput"
            class="cloud-browser__input"
            data-testid="cloud-browser-search"
            type="search"
            :placeholder="copy.searchPlaceholder"
            :disabled="loading"
            @keydown.enter.prevent="reload()"
          />
          <button type="button" class="cloud-browser__button" data-testid="cloud-browser-search-btn" :disabled="loading" @click="reload()">
            {{ copy.search }}
          </button>
          <button type="button" class="cloud-browser__button" data-testid="cloud-browser-refresh" :disabled="loading" @click="reload()">
            {{ copy.refresh }}
          </button>
          <button type="button" class="cloud-browser__button" data-testid="cloud-browser-new-category" :disabled="loading" @click="openNewCategory()">
            {{ panel.newCategory }}
          </button>
          <button type="button" class="cloud-browser__button" data-testid="cloud-browser-close" @click="emit('close')">
            {{ copy.close }}
          </button>
        </div>
      </header>

      <p v-if="truncated" class="cloud-browser__hint cloud-browser__hint--warning" data-testid="cloud-browser-truncated">
        {{ copy.truncated(records.length, total) }}
      </p>

      <div v-if="loading" class="cloud-browser__state" data-testid="cloud-browser-loading">{{ copy.loading }}</div>
      <div v-else-if="error" class="cloud-browser__state cloud-browser__state--error" data-testid="cloud-browser-error">
        <span>{{ error }}</span>
        <button type="button" class="cloud-browser__button" data-testid="cloud-browser-retry" @click="reload()">{{ copy.retry }}</button>
      </div>
      <div v-else-if="fileCount === 0" class="cloud-browser__state cloud-browser__state--empty" data-testid="cloud-browser-empty">
        <p class="cloud-browser__empty-title">{{ activeKeyword ? copy.emptySearch : copy.empty }}</p>
        <p class="cloud-browser__diag" data-testid="cloud-browser-empty-diagnostic">{{ emptyDiagnostic }}</p>
        <p v-if="spaceIssue" class="cloud-browser__diag cloud-browser__diag--warn" data-testid="cloud-browser-me-error">{{ spaceIssue }}</p>
      </div>
      <CloudDocTree
        v-else
        ref="treeRef"
        :nodes="filteredTree"
        @open-file="emit('open-file', $event)"
        @written="emit('cloud-file-saved')"
        @changed="reload()"
        @doc-action="(action, node) => emit('doc-action', action, node)"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 云端文档浏览面板外壳：分页拉取（搜索/刷新）与加载·空·错误·截断态；树与打开流程由 CloudDocTree 承担。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 15:25
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  buildCloudDocTreeByCategory,
  countCloudDocFiles,
  fetchAllCloudDocs,
  filterCloudDocTree,
  type CloudDocTreeNode,
} from '@/services/cloudBrowserService';
import { fetchCloudCategories } from '@/services/cloudBlogService';
import type { CloudCategoryNode, CloudDocItem } from '@/lib/tauri';
import { getCloudDocBrowserI18n, getCloudDocPanelI18n } from '@/i18n/ui';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/workspace';
import CloudDocTree from './CloudDocTree.vue';

const props = withDefaults(defineProps<{ visible?: boolean }>(), { visible: true });
const emit = defineEmits<{
  close: [];
  'open-file': [path: string];
  /** 云端内容已写入磁盘：上层据此刷新工作区文件树 */
  'cloud-file-saved': [];
  /** 云文档右键动作（同步/分享）交给上层处理 */
  'doc-action': [action: 'sync' | 'share', node: CloudDocTreeNode];
}>();

const treeRef = ref<{ openCreateCategory?: () => void } | null>(null);
const panel = computed(() => getCloudDocPanelI18n(settingsStore.uiLanguage));

function openNewCategory(): void {
  treeRef.value?.openCreateCategory?.();
}

const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const cloudSyncStore = useCloudSyncStore();
const copy = computed(() => getCloudDocBrowserI18n(settingsStore.uiLanguage));

const records = ref<CloudDocItem[]>([]);
const total = ref(0);
const pages = ref(0);
const truncated = ref(false);
const loading = ref(false);
const error = ref('');
const keywordInput = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);
const activeKeyword = ref('');

/** 分类树数据源（cloud_blog_categories）；取不到时文档统一落到「未分类」。 */
const categories = ref<CloudCategoryNode[]>([]);

/** 显示层按「分类 → 文件」分组；节点 path 仍是完整云端路径，打开/同步逻辑不变。 */
const tree = computed(() =>
  buildCloudDocTreeByCategory(records.value, categories.value, {
    uncategorized: copy.value.groupUncategorized,
    customGroup: copy.value.groupCustom,
  }),
);
const filteredTree = computed(() => filterCloudDocTree(tree.value, activeKeyword.value));
const fileCount = computed(() => countCloudDocFiles(filteredTree.value));
const countLabel = computed(() => copy.value.count(fileCount.value, total.value || records.value.length));
/** 空态诊断：直接暴露服务端 total / 实拉条数 / 请求页数，区分「真没文档」与「接口异常」。 */
const emptyDiagnostic = computed(() =>
  copy.value.emptyDetail(total.value, records.value.length, pages.value),
);
/** /me（配额）失败原因：让空配额不再是空白。 */
const spaceIssue = computed(() => {
  const issue = cloudSyncStore.spaceError;
  return issue ? copy.value.meError(issue.kind, issue.message) : '';
});

async function reload(): Promise<void> {
  loading.value = true;
  error.value = '';
  activeKeyword.value = keywordInput.value.trim();
  try {
    const [outcome, categoriesOutcome] = await Promise.all([
      fetchAllCloudDocs({ keyword: activeKeyword.value }),
      fetchCloudCategories(),
    ]);
    categories.value = categoriesOutcome.ok ? categoriesOutcome.data : [];
    if (!outcome.ok) {
      records.value = [];
      total.value = 0;
      pages.value = 0;
      truncated.value = false;
      error.value = outcome.message;
      return;
    }
    records.value = outcome.data.records;
    total.value = outcome.data.total;
    pages.value = outcome.data.pages;
    truncated.value = outcome.data.truncated;
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void reload();
      void nextTick(() => searchInputRef.value?.focus());
      return;
    }
    records.value = [];
  },
  { immediate: true },
);
</script>

<style scoped>
.cloud-browser-backdrop {
  position: fixed;
  inset: 0;
  /* 高于设置面板整页层（2000），低于同步弹窗（12000）与 toast */
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4vh 4vw;
  background: var(--bg-backdrop, rgba(8, 13, 26, 0.78));
}

.cloud-browser {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 固定尺寸（不再随内容自适应跳动），窄屏时按视口收缩 */
  width: 960px;
  height: 640px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  min-width: min(320px, calc(100vw - 32px));
  min-height: 0;
  padding: 16px;
  overflow: hidden;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-elevated, #151d2d);
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.38));
  border-radius: var(--radius-dialog, 10px);
  box-shadow: var(--shadow-overlay, 0 24px 60px rgba(0, 0, 0, 0.45));
}

.cloud-browser__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cloud-browser__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.cloud-browser__title h2 {
  margin: 0;
  font-size: var(--font-size-ui-lg, 14px);
  font-weight: 600;
  color: var(--text-primary, #e5e9f0);
}

.cloud-browser__count {
  font-size: 11px;
  color: var(--text-muted, #75829e);
}

.cloud-browser__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.cloud-browser__input {
  min-width: 190px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-base, #101726);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-browser__input::placeholder {
  color: var(--text-muted, #75829e);
}

.cloud-browser__input:focus {
  border-color: var(--accent-brand, #7cc7ff);
  outline: none;
}

.cloud-browser__button {
  padding: 4px 10px;
  font-size: 11.5px;
  color: var(--text-primary, #e5e9f0);
  cursor: pointer;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-browser__button:hover:not(:disabled) {
  border-color: var(--accent-brand, #7cc7ff);
  color: var(--accent-brand, #7cc7ff);
}

.cloud-browser__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.cloud-browser__hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-secondary, #a8b3c5);
}

.cloud-browser__hint--warning {
  color: var(--state-warning, #fbbf24);
}

/* 树占据剩余高度并内部滚动，避免整棵树把弹窗撑出视口 */
.cloud-browser :deep(.cloud-doc-tree) {
  flex: 1;
  min-height: 0;
}

.cloud-browser :deep(.cloud-doc-tree__list) {
  flex: 1;
  min-height: 0;
}

.cloud-browser__state {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 22px 12px;
  font-size: 12.5px;
  color: var(--text-secondary, #a8b3c5);
}

.cloud-browser__state--error {
  color: var(--state-danger, #dc2626);
}

.cloud-browser__state--empty {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.cloud-browser__empty-title {
  margin: 0;
  font-size: 12.5px;
}

.cloud-browser__diag {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted, #75829e);
  word-break: break-word;
}

.cloud-browser__diag--warn {
  color: var(--state-warning, #fbbf24);
}
</style>
