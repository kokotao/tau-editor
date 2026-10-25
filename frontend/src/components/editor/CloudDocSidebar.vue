<template>
  <section v-if="active" class="cloud-sidebar" data-testid="cloud-doc-sidebar">
    <header class="cloud-sidebar__header">
      <span class="cloud-sidebar__title">{{ copy.title }}</span>
      <span v-if="loaded" class="cloud-sidebar__count" data-testid="cloud-doc-sidebar-count">{{ fileCount }}</span>
      <button
        type="button"
        class="cloud-sidebar__icon-button"
        data-testid="cloud-doc-sidebar-refresh"
        :title="copy.refresh"
        :disabled="loading"
        @click="reload()"
      >
        ⟳
      </button>
    </header>

    <div class="cloud-sidebar__body">
      <p v-if="!signedIn" class="cloud-sidebar__hint" data-testid="cloud-doc-sidebar-signin-hint">
        {{ copy.loginHint }}
        <button
          type="button"
          class="cloud-sidebar__link"
          data-testid="cloud-doc-sidebar-login"
          @click="emit('login-request')"
        >
          {{ copy.loginAction }}
        </button>
      </p>
      <p v-else-if="loading" class="cloud-sidebar__hint" data-testid="cloud-doc-sidebar-loading">{{ copy.loading }}</p>
      <div v-else-if="error" class="cloud-sidebar__hint cloud-sidebar__hint--error" data-testid="cloud-doc-sidebar-error">
        <span>{{ error }}</span>
        <button type="button" class="cloud-sidebar__link" data-testid="cloud-doc-sidebar-retry" @click="reload()">{{ copy.retry }}</button>
      </div>
      <div v-else-if="fileCount === 0" class="cloud-sidebar__hint" data-testid="cloud-doc-sidebar-empty">
        <p class="cloud-sidebar__hint-line">{{ copy.empty }}</p>
        <p class="cloud-sidebar__diag" data-testid="cloud-doc-sidebar-empty-diagnostic">{{ emptyDiagnostic }}</p>
        <p v-if="spaceIssue" class="cloud-sidebar__diag cloud-sidebar__diag--warn" data-testid="cloud-doc-sidebar-me-error">{{ spaceIssue }}</p>
      </div>
      <CloudDocTree
        v-else
        :nodes="tree"
        compact
        @open-file="emit('open-file', $event)"
        @written="emit('cloud-file-saved')"
        @changed="reload()"
        @doc-action="(action, node) => emit('doc-action', action, node)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * @description 左侧边栏「云端文档」面板（与工作区文件树互斥切换）：激活时懒加载云端文档树，
 * 可展开目录、点文件打开/编辑。数据与打开流程复用 cloudBrowserService + CloudDocTree。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 16:00
 */
import { computed, ref, watch } from 'vue';
import {
  buildCloudDocTreeByCategory,
  countCloudDocFiles,
  fetchAllCloudDocs,
  type CloudDocTreeNode,
} from '@/services/cloudBrowserService';
import { fetchCloudCategories } from '@/services/cloudBlogService';
import type { CloudCategoryNode, CloudDocItem } from '@/lib/tauri';
import { getCloudDocBrowserI18n } from '@/i18n/ui';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/workspace';
import CloudDocTree from './CloudDocTree.vue';

const props = withDefaults(defineProps<{
  /** 当前是否处于激活（侧栏面板被选中）；首次激活才发请求 */
  active?: boolean;
  /** 外部要求刷新云端树时自增（例如右键同步成功后） */
  refreshToken?: number;
}>(), { active: false, refreshToken: 0 });

const emit = defineEmits<{
  'open-file': [path: string];
  'login-request': [];
  /** 云端内容已写入磁盘：上层据此刷新工作区文件树 */
  'cloud-file-saved': [];
  /** 云文档右键动作（同步/分享）交给上层处理 */
  'doc-action': [action: 'sync' | 'share', node: CloudDocTreeNode];
}>();

const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const cloudSyncStore = useCloudSyncStore();
const copy = computed(() => getCloudDocBrowserI18n(settingsStore.uiLanguage));

const loaded = ref(false);
const loading = ref(false);
const error = ref('');
const records = ref<CloudDocItem[]>([]);
const total = ref(0);
const pages = ref(0);

const signedIn = computed(() => cloudSyncStore.signedIn);

/** 分类树数据源（cloud_blog_categories）；取不到时文档统一落到「未分类」。 */
const categories = ref<CloudCategoryNode[]>([]);

/** 显示层按「分类 → 文件」分组；节点 path 仍是完整云端路径。 */
const tree = computed(() =>
  buildCloudDocTreeByCategory(records.value, categories.value, {
    uncategorized: copy.value.groupUncategorized,
    customGroup: copy.value.groupCustom,
  }),
);
const fileCount = computed(() => countCloudDocFiles(tree.value));
/** 空态诊断：区分「云端真的没有文档」与「接口失败」。 */
const emptyDiagnostic = computed(() =>
  copy.value.emptyDetail(total.value, records.value.length, pages.value),
);
const spaceIssue = computed(() => {
  const issue = cloudSyncStore.spaceError;
  return issue ? copy.value.meError(issue.kind, issue.message) : '';
});

async function reload(): Promise<void> {
  if (!signedIn.value) {
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const [outcome, categoriesOutcome] = await Promise.all([
      fetchAllCloudDocs(),
      fetchCloudCategories(),
    ]);
    categories.value = categoriesOutcome.ok ? categoriesOutcome.data : [];
    if (!outcome.ok) {
      records.value = [];
      total.value = 0;
      pages.value = 0;
      error.value = outcome.message;
      return;
    }
    records.value = outcome.data.records;
    total.value = outcome.data.total;
    pages.value = outcome.data.pages;
    loaded.value = true;
  } finally {
    loading.value = false;
  }
}

/** 首次激活（或切换登录态）按需拉取：未激活/未登录都不请求。 */
watch(
  () => [props.active, signedIn.value] as const,
  ([isActive, isSignedIn]) => {
    if (!isActive || !isSignedIn) {
      return;
    }
    if (!loaded.value) {
      void reload();
    }
  },
  { immediate: true },
);

/** 登出后清空，下次激活重新拉。 */
watch(signedIn, (value) => {
  if (!value) {
    records.value = [];
    loaded.value = false;
    error.value = '';
  }
});

/** 外部刷新信号（同步成功等）：激活状态下重新拉一次。 */
watch(
  () => props.refreshToken,
  (token, previous) => {
    if (token === previous) {
      return;
    }
    if (props.active && signedIn.value) {
      void reload();
    } else {
      loaded.value = false;
    }
  },
);

defineExpose({ reload });
</script>

<style scoped>
.cloud-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--text-secondary, #a8b3c5);
  background: var(--sidebar-bg, var(--panel-base, #101726));
}

.cloud-sidebar__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  flex-shrink: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border-soft, rgba(148, 163, 184, 0.24)) 60%, transparent);
}

.cloud-sidebar__title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-primary, #e5e9f0);
}

.cloud-sidebar__count {
  margin-left: auto;
  padding: 0 6px;
  font-size: 10px;
  color: var(--text-muted, #75829e);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border-radius: var(--radius-badge, 999px);
}

.cloud-sidebar__icon-button {
  padding: 2px 6px;
  font-size: 12px;
  color: var(--text-secondary, #a8b3c5);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control, 5px);
}

.cloud-sidebar__icon-button:hover:not(:disabled) {
  color: var(--text-primary, #e5e9f0);
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.cloud-sidebar__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 6px 8px 8px;
  overflow: auto;
}

.cloud-sidebar__hint {
  margin: 2px 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-muted, #75829e);
}

.cloud-sidebar__hint--error {
  color: var(--state-danger, #dc2626);
}

.cloud-sidebar__hint-line {
  margin: 0;
}

.cloud-sidebar__diag {
  margin: 2px 0 0;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--text-muted, #75829e);
  word-break: break-word;
}

.cloud-sidebar__diag--warn {
  color: var(--state-warning, #fbbf24);
}

.cloud-sidebar__link {
  padding: 0 2px;
  font-size: 11px;
  color: var(--accent-brand, #7cc7ff);
  text-decoration: underline;
  cursor: pointer;
  background: transparent;
  border: 0;
}
</style>
