<template>
  <!--
    Teleport 到 body：弹窗原先直接挂在编辑器容器里，祖先上的 `transform` / `will-change`
    会让 `position: fixed` 相对该容器解析，窗口一小就被上下裁掉（标题栏钻到标签栏后面）。
    挪到 body 后遮罩真正铺满视口；`inline` 仅给 DesignPreview 复用（预览页要求画布内渲染）。
  -->
  <Teleport to="body" :disabled="inline">
    <div
      v-if="visible"
      class="cloud-browser-backdrop cd-nocturne cd-backdrop"
      data-testid="cloud-doc-browser-backdrop"
      @click.self="emit('close')"
    >
    <section
      class="cloud-browser cd-dialog cd-dialog--window"
      data-testid="cloud-doc-browser"
      role="dialog"
      aria-modal="true"
      @keydown.esc.prevent="emit('close')"
    >
      <!-- ==================== 标题栏（设计稿 h56） ==================== -->
      <header class="cloud-browser__header cd-titlebar">
        <div class="cloud-browser__title">
          <svg class="cloud-browser__title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M17.5 19a4.5 4.5 0 0 0 .4-8.98A6 6 0 0 0 6.3 12.4 3.6 3.6 0 0 0 7 19h10.5Z" />
          </svg>
          <h2 class="cd-titlebar__title">{{ copy.title }}</h2>
          <span class="cloud-browser__count cd-pill cd-pill--success" data-testid="cloud-browser-count">
            <span class="cloud-browser__pulse" aria-hidden="true"></span>
            {{ countLabel }}
          </span>
          <span v-if="quotaLabel" class="cloud-browser__capacity cd-mono">{{ copy.shell.capacity(quotaLabel) }}</span>
        </div>

        <div class="cloud-browser__actions">
          <span class="cd-search cloud-browser__search">
            <svg class="cloud-browser__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4.5 4.5" />
            </svg>
            <input
              ref="searchInputRef"
              v-model="keywordInput"
              class="cd-input cloud-browser__search-input"
              data-testid="cloud-browser-search"
              type="search"
              :placeholder="copy.shell.searchFull"
              :disabled="loading"
              :aria-label="copy.shell.searchFull"
              @keydown.enter.prevent="reload()"
            />
            <kbd class="cd-kbd cd-search__kbd">{{ copy.shell.shortcut }}</kbd>
          </span>
          <button
            type="button"
            class="cd-btn cd-btn--secondary"
            data-testid="cloud-browser-search-btn"
            :disabled="loading"
            @click="reload()"
          >
            {{ copy.search }}
          </button>
          <button
            type="button"
            class="cd-btn cd-btn--secondary"
            data-testid="cloud-browser-refresh"
            :title="copy.shell.refreshHint"
            :disabled="loading"
            @click="reload()"
          >
            <svg class="cloud-browser__btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 15.5-6.2M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2M3 21v-5h5" />
            </svg>
            {{ copy.refresh }}
          </button>
          <button
            type="button"
            class="cd-btn cd-btn--secondary"
            data-testid="cloud-browser-new-category"
            :disabled="loading"
            @click="openNewCategory()"
          >
            <svg class="cloud-browser__btn-icon cloud-browser__btn-icon--accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {{ panel.newCategory }}
          </button>
          <button
            type="button"
            class="cd-icon-btn cd-icon-btn--close cloud-browser__close"
            data-testid="cloud-browser-close"
            :title="copy.shell.closeWindow"
            :aria-label="copy.shell.closeWindow"
            @click="emit('close')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <!-- ==================== 三栏工作台 ==================== -->
      <div class="cloud-browser__body cd-dialog__body">
        <!-- ---------- 左栏 256：工作空间 / 目录树 / 标签 / 同步底栏 ---------- -->
        <aside class="cloud-browser__sidebar" aria-label="云文档导航" data-testid="cloud-browser-sidebar">
          <div class="cloud-browser__sidebar-scroll cd-scroll">
            <!-- 工作空间（数据驱动：由云端路径 `tau/<workspace>/…` 派生，后端没有独立的空间实体） -->
            <section class="cloud-browser__section">
              <div class="cloud-browser__section-head cd-mono">
                <span>{{ copy.shell.workspaceSection }}</span>
              </div>
              <nav class="cloud-browser__spaces" data-testid="cloud-browser-workspaces">
                <button
                  type="button"
                  class="cloud-browser__space"
                  :class="{ 'cloud-browser__space--active': activeWorkspace === '' }"
                  :aria-pressed="activeWorkspace === ''"
                  data-testid="cloud-browser-workspace-all"
                  @click="selectWorkspace('')"
                >
                  <svg class="cloud-browser__space-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M17.5 19a4.5 4.5 0 0 0 .4-8.98A6 6 0 0 0 6.3 12.4 3.6 3.6 0 0 0 7 19h10.5Z" />
                  </svg>
                  <span class="cloud-browser__space-name">{{ copy.shell.workspaceAll }}</span>
                  <span class="cloud-browser__space-count cd-mono">{{ allFileCount }}</span>
                </button>
                <button
                  v-for="space in workspaces"
                  :key="space.name"
                  type="button"
                  class="cloud-browser__space"
                  :class="{ 'cloud-browser__space--active': activeWorkspace === space.name }"
                  :aria-pressed="activeWorkspace === space.name"
                  :title="space.name"
                  :data-testid="`cloud-browser-workspace-${space.name}`"
                  @click="selectWorkspace(space.name)"
                >
                  <svg class="cloud-browser__space-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                  <span class="cloud-browser__space-name">{{ space.name }}</span>
                  <span class="cloud-browser__space-count cd-mono">{{ space.count }}</span>
                </button>
                <p v-if="workspaces.length === 0" class="cloud-browser__spaces-empty" data-testid="cloud-browser-workspace-empty">
                  {{ copy.shell.workspaceNone }}
                </p>
              </nav>
            </section>

            <!-- 文件目录树（分类树由 CloudDocTree 渲染，行样式归设计稿三任务） -->
            <section class="cloud-browser__section">
              <div class="cloud-browser__section-head cd-mono">
                <span>{{ copy.shell.treeSection }}</span>
                <button
                  type="button"
                  class="cloud-browser__section-action"
                  :title="copy.shell.collapseAll"
                  :aria-label="copy.shell.collapseAll"
                  data-testid="cloud-browser-collapse-all"
                  @click="collapseAll()"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="m6 15 6-6 6 6" />
                  </svg>
                </button>
              </div>
              <div class="cloud-browser__tree" data-testid="cloud-browser-sidebar-tree">
                <CloudDocTree
                  ref="sidebarTreeRef"
                  layout="tree"
                  compact
                  :nodes="workspaceTree"
                  :selected-key="selectedKey"
                  @select="onSelect"
                  @open-file="emit('open-file', $event)"
                  @written="emit('cloud-file-saved')"
                  @changed="reload()"
                  @doc-action="(action, node) => emit('doc-action', action, node)"
                  @edit-cloud-doc="(node) => emit('edit-cloud-doc', node)"
                />
              </div>
            </section>

            <!-- 标签筛选 -->
            <section class="cloud-browser__section">
              <div class="cloud-browser__section-head cd-mono">
                <span>{{ copy.shell.tagsSection }}</span>
              </div>
              <div class="cloud-browser__tags">
                <button
                  v-for="tag in allTags"
                  :key="tag"
                  type="button"
                  class="cloud-browser__tag cd-mono"
                  :class="{ 'cloud-browser__tag--active': activeTags.includes(tag) }"
                  :aria-pressed="activeTags.includes(tag)"
                  :data-testid="`cloud-browser-tag-${tag}`"
                  @click="toggleTag(tag)"
                >
                  #{{ tag }}
                </button>
                <p v-if="allTags.length === 0" class="cloud-browser__tags-empty">{{ copy.shell.noTags }}</p>
              </div>
            </section>
          </div>

          <!-- 左栏底栏：Tau Sync Engine + 配额 -->
          <footer class="cloud-browser__sidebar-footer">
            <div class="cloud-browser__engine">
              <span class="cloud-browser__engine-name">
                <span class="cloud-browser__engine-dot" aria-hidden="true"></span>
                {{ copy.shell.syncEngine }}
              </span>
              <span class="cloud-browser__engine-quota cd-mono">{{ quotaLabel || copy.shell.quotaUnknown }}</span>
            </div>
            <div class="cloud-browser__quota cd-progress" role="progressbar" :aria-valuenow="quotaPercent" aria-valuemin="0" aria-valuemax="100">
              <div class="cd-progress__bar" :style="{ width: `${quotaBarWidth}%` }"></div>
            </div>
            <div class="cloud-browser__engine-meta">
              <span>{{ copy.shell.syncReady }}</span>
              <span class="cloud-browser__storage">{{ copy.shell.storageSettings }}</span>
            </div>
          </footer>
        </aside>

        <!-- ---------- 中间：子头 / 表头 / 列表 / 底栏 ---------- -->
        <main class="cloud-browser__main" data-testid="cloud-browser-main">
          <div class="cloud-browser__subheader">
            <nav class="cloud-browser__crumbs" aria-label="Breadcrumb">
              <button type="button" class="cloud-browser__crumb cloud-browser__crumb--home" @click="clearSelection()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m3 11 9-8 9 8M5 10v10h14V10" />
                </svg>
                {{ copy.shell.rootCrumb }}
              </button>
              <template v-for="segment in breadcrumb" :key="segment">
                <span class="cloud-browser__crumb-sep">/</span>
                <span class="cloud-browser__crumb">{{ segment }}</span>
              </template>
            </nav>

            <div class="cloud-browser__viewtools">
              <div class="cloud-browser__formats" role="group">
                <button
                  v-for="chip in FORMAT_CHIPS"
                  :key="chip"
                  type="button"
                  class="cloud-browser__format"
                  :class="{ 'cloud-browser__format--active': activeFormat === chip }"
                  :aria-pressed="activeFormat === chip"
                  :data-testid="`cloud-browser-format-${chip}`"
                  @click="activeFormat = chip"
                >
                  {{ formatChipLabel(chip) }}
                </button>
              </div>
              <div class="cloud-browser__views">
                <button type="button" class="cloud-browser__view cloud-browser__view--active" :title="copy.shell.viewList" aria-pressed="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
                </button>
                <button type="button" class="cloud-browser__view" disabled :title="copy.shell.viewGrid">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <p v-if="truncated" class="cloud-browser__hint" data-testid="cloud-browser-truncated">
            {{ copy.truncated(records.length, total) }}
          </p>

          <!-- 表头与行渲染由 CloudDocTree 的 table 布局承担（.cd-thead 12 栅格 5:2:1:3:1） -->
          <div class="cloud-browser__list" data-testid="cloud-browser-table">
            <!-- 加载态 -->
            <div v-if="loading" class="cd-state" data-testid="cloud-browser-loading">
              <span class="cd-spinner" aria-hidden="true"></span>
              <span>{{ copy.loading }}</span>
            </div>
            <!-- 错误态（设计稿：打开失败：{message} + 重试） -->
            <div v-else-if="error" class="cd-state cd-state--error" data-testid="cloud-browser-error">
              <span>{{ copy.openFailed(error) }}</span>
              <button type="button" class="cd-btn cd-btn--secondary" data-testid="cloud-browser-retry" @click="reload()">
                {{ copy.retry }}
              </button>
            </div>
            <!-- 空态（含诊断，SPEC D5 保留） -->
            <div v-else-if="fileCount === 0" class="cd-state" data-testid="cloud-browser-empty">
              <span class="cloud-browser__empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.5 19a4.5 4.5 0 0 0 .4-8.98A6 6 0 0 0 6.3 12.4 3.6 3.6 0 0 0 7 19h10.5Z" />
                </svg>
              </span>
              <p class="cd-state__title">{{ activeKeyword ? copy.emptySearch : copy.empty }}</p>
              <p class="cd-state__hint" data-testid="cloud-browser-empty-diagnostic">{{ emptyDiagnostic }}</p>
              <p v-if="spaceIssue" class="cd-state__hint cloud-browser__diag-warn" data-testid="cloud-browser-me-error">{{ spaceIssue }}</p>
            </div>
            <!-- 筛选后为空 -->
            <div v-else-if="visibleFileCount === 0" class="cd-state" data-testid="cloud-browser-filter-empty">
              <p class="cd-state__title">{{ copy.shell.filterEmpty }}</p>
              <button type="button" class="cd-btn cd-btn--secondary" @click="clearFilters()">{{ copy.shell.clearFilters }}</button>
            </div>
            <!-- 列表（表格行渲染由 CloudDocTree 的 table 布局承担） -->
            <CloudDocTree
              v-else
              ref="tableTreeRef"
              layout="table"
              :nodes="tableTree"
              :selected-key="selectedKey"
              @select="onSelect"
              @open-file="emit('open-file', $event)"
              @written="emit('cloud-file-saved')"
              @changed="reload()"
              @doc-action="(action, node) => emit('doc-action', action, node)"
              @edit-cloud-doc="(node) => emit('edit-cloud-doc', node)"
            />
          </div>

          <!-- 底栏 h36 -->
          <footer class="cloud-browser__statusbar">
            <span class="cloud-browser__status-dir">{{ copy.shell.currentDir(currentDir) }}</span>
            <span class="cloud-browser__status-sep" aria-hidden="true">|</span>
            <span data-testid="cloud-browser-selected-count">{{ copy.shell.selectedCount(selectedNode ? 1 : 0) }}</span>
            <span class="cloud-browser__synced cd-mono">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {{ copy.shell.allSynced }}
            </span>
          </footer>
        </main>

        <!-- ---------- 右栏 320：检查器 ---------- -->
        <aside class="cloud-browser__inspector" aria-label="文档检查器" data-testid="cloud-browser-inspector">
          <template v-if="selectedNode && selectedFile">
            <div class="cloud-browser__inspect-block">
              <div class="cloud-browser__inspect-badges">
                <span class="cd-badge" :class="`cd-badge--${fileBadge.kind}`">{{ fileBadge.label }}</span>
                <span class="cd-pill cd-pill--success">{{ copy.shell.syncing }}</span>
              </div>
              <h3 class="cloud-browser__inspect-name">{{ selectedNode.name }}</h3>
              <p class="cloud-browser__inspect-meta cd-mono">
                {{ copy.shell.creatorHash(copy.shell.creatorSelf, hashLabel) }}
              </p>
            </div>

            <div class="cloud-browser__inspect-block">
              <button
                type="button"
                class="cd-btn cd-btn--primary cloud-browser__open-btn"
                data-testid="cloud-browser-open-in-editor"
                @click="openSelectedInEditor()"
              >
                <svg class="cloud-browser__btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                </svg>
                {{ copy.shell.editInEditor }}
              </button>
              <div class="cloud-browser__inspect-actions">
                <button type="button" class="cd-btn cd-btn--secondary" data-testid="cloud-browser-download" @click="notifyDesktopOnly()">
                  {{ copy.shell.downloadCopy }}
                </button>
                <button type="button" class="cd-btn cd-btn--secondary" data-testid="cloud-browser-share-link" @click="notifyDesktopOnly()">
                  {{ copy.shell.shareLink }}
                </button>
              </div>
            </div>

            <div class="cloud-browser__inspect-block">
              <div class="cloud-browser__inspect-title cd-mono">
                <span>{{ copy.shell.snapshotTitle }}</span>
                <span class="cloud-browser__inspect-format">{{ fileBadge.label }}</span>
              </div>
              <div class="cloud-browser__snapshot cd-mono">
                <p
                  v-for="line in snapshotLines"
                  :key="line.text"
                  :class="{ 'cloud-browser__snapshot-head': line.accent }"
                >
                  {{ line.text }}
                </p>
              </div>
            </div>

            <div class="cloud-browser__inspect-block cloud-browser__inspect-block--last">
              <div class="cloud-browser__inspect-title cd-mono">
                <span>{{ copy.shell.versionTitle }}</span>
                <button type="button" class="cloud-browser__link" data-testid="cloud-browser-history" @click="historyVisible = true">
                  {{ copy.shell.historyAction }}
                </button>
              </div>
              <ol class="cloud-browser__timeline">
                <li class="cloud-browser__version cloud-browser__version--current">
                  <span class="cloud-browser__version-dot" aria-hidden="true"></span>
                  <div class="cloud-browser__version-head">
                    <span class="cloud-browser__version-name cd-mono">{{ copy.shell.versionCurrent(selectedFile.version) }}</span>
                    <span class="cloud-browser__version-time cd-mono">{{ formatClock(selectedFile.updatedAt) }}</span>
                  </div>
                  <p class="cloud-browser__version-hint">{{ copy.shell.versionSyncedHint(selectedFile.version) }}</p>
                </li>
                <li v-if="selectedFile.version > 1" class="cloud-browser__version">
                  <span class="cloud-browser__version-dot" aria-hidden="true"></span>
                  <div class="cloud-browser__version-head">
                    <span class="cloud-browser__version-name cd-mono">{{ copy.shell.versionInitial }}</span>
                  </div>
                  <p class="cloud-browser__version-hint">{{ copy.shell.versionInitialHint }}</p>
                </li>
              </ol>
            </div>

            <VersionHistoryDialog
              :visible="historyVisible"
              :file-id="selectedFile.fileId"
              :file-name="selectedNode.name"
              :current-version="selectedFile.version"
              @close="historyVisible = false"
              @restored="reload()"
            />
          </template>
          <div v-else class="cd-state">
            <p class="cd-state__title">{{ copy.shell.noSelection }}</p>
            <p class="cd-state__hint">{{ copy.shell.noSelectionHint }}</p>
          </div>
        </aside>
      </div>
    </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @description 云端文档浏览弹窗外壳（设计稿一：三栏工作台）。
 * 左栏 = 工作空间 + 分类树 + 标签 + 同步状态；中间 = 面包屑/格式筛选 + 数据表 + 状态栏；右栏 = 检查器。
 * 数据与打开流程仍然复用 cloudBrowserService / CloudDocTree，本组件只做外壳编排（行渲染归 CloudDocTree 的 table 布局）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-26 23:52
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  buildCloudDocTreeByCategory,
  countCloudDocFiles,
  fetchAllCloudDocs,
  filterCloudDocTree,
  formatCloudDocSize,
  type CloudDocTreeNode,
} from '@/services/cloudBrowserService';
import { fetchCloudCategories } from '@/services/cloudBlogService';
import { cloudWorkspaceNameFromPath } from '@/services/cloudDocLanding';
import type { CloudCategoryNode, CloudDocItem } from '@/lib/tauri';
import { getCloudDocBrowserI18n, getCloudDocPanelI18n } from '@/i18n/ui';
import { useCenterToastStore } from '@/stores/centerToast';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useSettingsStore } from '@/stores/settings';
import CloudDocTree from './CloudDocTree.vue';
import VersionHistoryDialog from './VersionHistoryDialog.vue';

const props = withDefaults(defineProps<{
  visible?: boolean;
  /** 开发预览（design-preview=cloud-doc）：直接注入已构好的树，跳过网络请求 */
  previewNodes?: CloudDocTreeNode[] | null;
  /** 开发预览：树对应的云端匹配总数（缺省取树内文件数） */
  previewTotal?: number | null;
  /**
   * 开发预览专用：禁用 Teleport，让遮罩留在画布内渲染（DesignPreview 需要）。
   * 正式环境必须为 false，否则又会回到「被编辑器容器裁剪」的老问题。
   */
  inline?: boolean;
}>(), { visible: true, previewNodes: null, previewTotal: null, inline: false });

const emit = defineEmits<{
  close: [];
  'open-file': [path: string];
  /** 云端内容已写入磁盘：上层据此刷新工作区文件树 */
  'cloud-file-saved': [];
  /** 云文档右键动作（同步/分享）交给上层处理 */
  'doc-action': [action: 'sync' | 'share', node: CloudDocTreeNode];
  /**
   * 「在编辑器中打开」：树只做编排，落位/开标签/绑定 cloudFileId 一律由宿主完成
   * （与 CloudDocTree 的 `edit-cloud-doc` 同一契约，这里原样透传给上一层）。
   */
  'edit-cloud-doc': [node: CloudDocTreeNode];
}>();

/** CloudDocTree 暴露面（折叠/新建分类为既有能力；openNode 为三栏工作台的打开入口）。 */
interface CloudDocTreeExposed {
  openCreateCategory?: () => void;
  openNode?: (node: CloudDocTreeNode) => void | Promise<void>;
  $el?: HTMLElement;
}

const settingsStore = useSettingsStore();
const cloudSyncStore = useCloudSyncStore();
const centerToast = useCenterToastStore();
const copy = computed(() => getCloudDocBrowserI18n(settingsStore.uiLanguage));
const panel = computed(() => getCloudDocPanelI18n(settingsStore.uiLanguage));

const sidebarTreeRef = ref<CloudDocTreeExposed | null>(null);
const tableTreeRef = ref<CloudDocTreeExposed | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

// ---------------------------------------------------------------------------
// 数据（网络 / 预览两条路径）
// ---------------------------------------------------------------------------
const records = ref<CloudDocItem[]>([]);
const total = ref(0);
const pages = ref(0);
const truncated = ref(false);
const loading = ref(false);
const error = ref('');
const keywordInput = ref('');
const activeKeyword = ref('');

/** 分类树数据源（cloud_blog_categories）；取不到时文档统一落到「未分类」。 */
const categories = ref<CloudCategoryNode[]>([]);

/** 开发预览模式：注入树即视为已就绪，不触发任何网络请求。 */
const previewMode = computed(() => props.previewNodes !== null);

/** 显示层按「分类 → 文件」分组；节点 path 仍是完整云端路径，打开/同步逻辑不变。 */
const sourceTree = computed<CloudDocTreeNode[]>(() => {
  if (previewMode.value) {
    return props.previewNodes ?? [];
  }
  return buildCloudDocTreeByCategory(records.value, categories.value, {
    uncategorized: copy.value.groupUncategorized,
    customGroup: copy.value.groupCustom,
  });
});

/** 关键字过滤（左栏与中间栏共用）。 */
const keywordTree = computed(() => filterCloudDocTree(sourceTree.value, activeKeyword.value));

// ---------------------------------------------------------------------------
// 交互筛选：格式 chips + 标签
// ---------------------------------------------------------------------------
type FormatChip = 'all' | 'markdown' | 'word' | 'code';
const FORMAT_CHIPS: FormatChip[] = ['all', 'markdown', 'word', 'code'];
const activeFormat = ref<FormatChip>('all');
const activeTags = ref<string[]>([]);

/** 文件类型判定：徽标配色 + 格式筛选 + 检查器徽标共用一套分类。 */
type FileKind = 'markdown' | 'word' | 'code' | 'json' | 'image' | 'other';
const CODE_EXTENSIONS = new Set(['py', 'js', 'ts', 'tsx', 'jsx', 'sh', 'ps1', 'yml', 'yaml', 'toml', 'rs', 'go', 'java', 'c', 'h', 'cpp', 'rb', 'sql', 'vue', 'html', 'css', 'scss']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']);

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function fileKind(name: string): FileKind {
  const extension = extensionOf(name);
  if (extension === 'md' || extension === 'markdown' || extension === 'mdx') {
    return 'markdown';
  }
  if (extension === 'doc' || extension === 'docx') {
    return 'word';
  }
  if (extension === 'json') {
    return 'json';
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return 'code';
  }
  return 'other';
}

/** 格式 chips 的归类：代码脚本把 json/其他文本都算进去，与设计稿计数口径一致。 */
function matchesFormat(name: string, chip: FormatChip): boolean {
  if (chip === 'all') {
    return true;
  }
  const kind = fileKind(name);
  if (chip === 'markdown') {
    return kind === 'markdown';
  }
  if (chip === 'word') {
    return kind === 'word';
  }
  return kind !== 'markdown' && kind !== 'word' && kind !== 'image';
}

/** 遍历取文件节点。 */
function collectFiles(nodes: CloudDocTreeNode[]): CloudDocTreeNode[] {
  const files: CloudDocTreeNode[] = [];
  const walk = (list: CloudDocTreeNode[]): void => {
    for (const node of list) {
      if (node.kind === 'file') {
        files.push(node);
      } else {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return files;
}

/** 按文件谓词过滤树（保留命中文件的祖先目录）。 */
function filterTreeByFile(
  nodes: CloudDocTreeNode[],
  predicate: (node: CloudDocTreeNode) => boolean,
): CloudDocTreeNode[] {
  const walk = (list: CloudDocTreeNode[]): CloudDocTreeNode[] => {
    const kept: CloudDocTreeNode[] = [];
    for (const node of list) {
      if (node.kind === 'file') {
        if (predicate(node)) {
          kept.push(node);
        }
        continue;
      }
      const children = walk(node.children);
      if (children.length > 0) {
        kept.push({ ...node, children });
      }
    }
    return kept;
  };
  return walk(nodes);
}

// ---------------------------------------------------------------------------
// 工作空间导航（真实数据）
// ---------------------------------------------------------------------------
/**
 * 全部云端文档的文件数（不含工作空间/格式/标签筛选，只跟关键字无关的数据源走）。
 * 「全部云端文档」这一项是导航入口，计数口径要保持稳定。
 */
const allFileCount = computed(() => countCloudDocFiles(sourceTree.value));

/**
 * 工作空间列表：后端没有「团队空间 / 归档 / CLOUD PRO」这类实体，
 * 因此只能从云端路径反查——`CloudDocItem.path` 形如 `tau/<workspace>/<relative…>`，
 * `tau` 之后的第一段就是工作空间名（与 cloudDocLanding 的落位规则同一套判定）。
 *
 * 统计用 sourceTree（与关键字无关）而非 keywordTree：边打字边增删导航项会让左栏「跳」。
 * 排序固定为「文件数降序 → 名称升序」，保证同样数据每次渲染顺序一致。
 * 反查不到工作空间的文档（路径不以 `tau/` 开头）只出现在「全部云端文档」里。
 */
const workspaces = computed<{ name: string; count: number }[]>(() => {
  const counts = new Map<string, number>();
  for (const node of collectFiles(sourceTree.value)) {
    const name = cloudWorkspaceNameFromPath(node.path);
    if (!name) {
      continue;
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count
      || left.name.localeCompare(right.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));
});

/** 当前工作空间（'' = 全部云端文档）。 */
const activeWorkspace = ref('');

/** 工作空间过滤层：叠在关键字之后，供格式 chips / 标签 / 表格共用。 */
const workspaceTree = computed(() => {
  const name = activeWorkspace.value;
  if (!name) {
    return keywordTree.value;
  }
  return filterTreeByFile(keywordTree.value, (node) => cloudWorkspaceNameFromPath(node.path) === name);
});

function selectWorkspace(name: string): void {
  activeWorkspace.value = name;
}

/** 数据刷新后该工作空间消失（文件被删/移动）时，退回「全部云端文档」。 */
watch(workspaces, (list) => {
  if (activeWorkspace.value && !list.some((space) => space.name === activeWorkspace.value)) {
    activeWorkspace.value = '';
  }
});

/** 标签是后端自由文本：逗号/分号/换行分隔，去掉 # 前缀后去重。 */
function parseTags(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  const parts = raw.split(/[,，;；|\n\r]+/);
  const seen = new Set<string>();
  for (const part of parts) {
    const tag = part.trim().replace(/^#+/, '').trim();
    if (tag) {
      seen.add(tag);
    }
  }
  return [...seen];
}

const allTags = computed<string[]>(() => {
  const seen = new Set<string>();
  for (const node of collectFiles(sourceTree.value)) {
    for (const tag of parseTags(node.file?.tags ?? null)) {
      seen.add(tag);
    }
  }
  return [...seen].slice(0, 16);
});

const formatCounts = computed(() => {
  const counts = { all: 0, markdown: 0, word: 0, code: 0 };
  for (const node of collectFiles(workspaceTree.value)) {
    counts.all += 1;
    if (matchesFormat(node.name, 'markdown')) {
      counts.markdown += 1;
    } else if (matchesFormat(node.name, 'word')) {
      counts.word += 1;
    } else if (matchesFormat(node.name, 'code')) {
      counts.code += 1;
    }
  }
  return counts;
});

/** 中间列表：工作空间 + 关键字 + 格式 + 标签多重筛选后的树。 */
const tableTree = computed(() => {
  const chip = activeFormat.value;
  const tags = activeTags.value;
  const tagFilter = tags.length > 0;
  return filterTreeByFile(workspaceTree.value, (node) => {
    if (!matchesFormat(node.name, chip)) {
      return false;
    }
    if (!tagFilter) {
      return true;
    }
    const fileTags = parseTags(node.file?.tags ?? null);
    return tags.some((tag) => fileTags.includes(tag));
  });
});

function toggleTag(tag: string): void {
  activeTags.value = activeTags.value.includes(tag)
    ? activeTags.value.filter((item) => item !== tag)
    : [...activeTags.value, tag];
}

/** 清除筛选：格式 + 标签 + 工作空间一起复位（关键字由搜索框单独维护）。 */
function clearFilters(): void {
  activeFormat.value = 'all';
  activeTags.value = [];
  activeWorkspace.value = '';
}

function formatChipLabel(chip: FormatChip): string {
  const counts = formatCounts.value;
  if (chip === 'markdown') {
    return copy.value.shell.formatMarkdown(counts.markdown);
  }
  if (chip === 'word') {
    return copy.value.shell.formatWord(counts.word);
  }
  if (chip === 'code') {
    return copy.value.shell.formatCode(counts.code);
  }
  return copy.value.shell.formatAll(counts.all);
}

// ---------------------------------------------------------------------------
// 计数 / 选中 / 面包屑
// ---------------------------------------------------------------------------
const fileCount = computed(() => countCloudDocFiles(workspaceTree.value));
const visibleFileCount = computed(() => countCloudDocFiles(tableTree.value));
const matchedTotal = computed(() =>
  previewMode.value ? (props.previewTotal ?? fileCount.value) : (total.value || records.value.length),
);
/** 标题计数胶囊：选中工作空间时补一段作用域提示，让「数字为什么变了」一眼可见。 */
const countLabel = computed(() => {
  const label = copy.value.count(fileCount.value, matchedTotal.value);
  return activeWorkspace.value
    ? `${label} · ${copy.value.shell.workspaceScope(activeWorkspace.value)}`
    : label;
});
/** 空态诊断：直接暴露服务端 total / 实拉条数 / 请求页数，区分「真没文档」与「接口异常」。 */
const emptyDiagnostic = computed(() =>
  copy.value.emptyDetail(total.value, records.value.length, pages.value),
);
/** /me（配额）失败原因：让空配额不再是空白。 */
const spaceIssue = computed(() => {
  const issue = cloudSyncStore.spaceError;
  return issue ? copy.value.meError(issue.kind, issue.message) : '';
});

const selectedKey = ref('');

function findNode(nodes: CloudDocTreeNode[], key: string): CloudDocTreeNode | null {
  for (const node of nodes) {
    if (node.key === key) {
      return node;
    }
    if (node.kind === 'dir') {
      const hit = findNode(node.children, key);
      if (hit) {
        return hit;
      }
    }
  }
  return null;
}

function firstFileKey(nodes: CloudDocTreeNode[]): string {
  for (const node of nodes) {
    if (node.kind === 'file') {
      return node.key;
    }
    const hit = firstFileKey(node.children);
    if (hit) {
      return hit;
    }
  }
  return '';
}

const selectedNode = computed<CloudDocTreeNode | null>(() =>
  selectedKey.value ? findNode(workspaceTree.value, selectedKey.value) : null,
);
const selectedFile = computed<CloudDocItem | null>(() => selectedNode.value?.file ?? null);

/** 选中项保持有效：数据刷新/筛选后若选中项消失，退回当前作用域里的第一条文件。 */
function syncSelection(): void {
  if (selectedKey.value && findNode(workspaceTree.value, selectedKey.value)) {
    return;
  }
  selectedKey.value = firstFileKey(workspaceTree.value);
}

function onSelect(key: string): void {
  selectedKey.value = key;
}

function clearSelection(): void {
  selectedKey.value = '';
}

watch(workspaceTree, () => syncSelection(), { immediate: true });

/** 面包屑：云端路径形如 `tau/{workspace}/{相对路径}`，前两段默认不展示；
 *  选中工作空间时第一段换成该工作空间，目录层级顺延。 */
const breadcrumb = computed<string[]>(() => {
  const node = selectedNode.value;
  const workspace = activeWorkspace.value;
  if (!node) {
    return workspace ? [workspace] : [];
  }
  const parts = node.path.split('/').filter(Boolean);
  const relative = parts[0] === 'tau' && parts.length > 2 ? parts.slice(2, -1) : parts.slice(0, -1);
  if (workspace) {
    return [workspace, ...relative.slice(-2)];
  }
  return relative.slice(-3);
});

const currentDir = computed(() => {
  if (breadcrumb.value.length === 0) {
    return '/';
  }
  return `/${breadcrumb.value.join('/')}`;
});

// ---------------------------------------------------------------------------
// 检查器
// ---------------------------------------------------------------------------
const historyVisible = ref(false);

const hashLabel = computed(() => {
  const raw = selectedFile.value?.contentHash;
  if (!raw) {
    return '—';
  }
  const hash = raw.replace(/^sha256:/i, '');
  return hash.length > 12 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash;
});

const fileBadge = computed<{ kind: string; label: string }>(() => {
  const name = selectedNode.value?.name ?? '';
  const shell = copy.value.shell;
  const map: Record<FileKind, { kind: string; label: string }> = {
    markdown: { kind: 'md', label: 'MD' },
    word: { kind: 'doc', label: 'DOC' },
    code: { kind: 'code', label: '</>' },
    json: { kind: 'json', label: '{ }' },
    image: { kind: 'img', label: 'IMG' },
    other: { kind: 'md', label: 'FILE' },
  };
  const badge = map[fileKind(name)];
  const labelMap: Record<FileKind, string> = {
    markdown: shell.badgeMarkdown,
    word: shell.badgeWord,
    code: shell.badgeCode,
    json: shell.badgeJson,
    image: shell.badgeImage,
    other: shell.badgeFile,
  };
  return { kind: badge.kind, label: labelMap[fileKind(name)] };
});

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 设计稿时间格式：2026/10/25 21:24:33 */
function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} `
    + `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** 版本时间线只显示时分（设计稿 20:19）。 */
function formatClock(value: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 实时快照摘要：用 contentHash / version / updatedAt 拼，读不到就明确写 —。 */
const snapshotLines = computed<{ text: string; accent: boolean }[]>(() => {
  const file = selectedFile.value;
  const node = selectedNode.value;
  if (!file || !node) {
    return [];
  }
  return [
    { text: `# ${node.name}`, accent: true },
    { text: `v${file.version} · ${formatCloudDocSize(file.size)}`, accent: false },
    { text: `sha256: ${file.contentHash?.replace(/^sha256:/i, '') ?? '—'}`, accent: false },
    { text: copy.value.updatedAt(formatDateTime(file.updatedAt)), accent: false },
  ];
});

function notifyDesktopOnly(): void {
  centerToast.show(copy.value.shell.desktopOnly, 'info');
}

/**
 * 检查器主按钮「在编辑器中打开」：走 CloudDocTree 暴露的 openNode（它已编排 openTarget → 写盘 → open-file）。
 * 跨工作区/路径无法映射时由树弹出三选一（取消 / 另存为… / 在编辑器中打开），
 * 用户在弹窗里选「在编辑器中打开」后树 emit `edit-cloud-doc`，本组件原样透传给宿主，不再自己发 IPC。
 * 若某天树不再暴露入口，退回事件契约（open-file），由上层决定如何打开。
 */
function openSelectedInEditor(): void {
  const node = selectedNode.value;
  if (!node) {
    return;
  }
  const opener = tableTreeRef.value?.openNode ?? sidebarTreeRef.value?.openNode;
  if (opener) {
    void opener(node);
    return;
  }
  emit('open-file', node.path);
}

function openNewCategory(): void {
  sidebarTreeRef.value?.openCreateCategory?.();
}

/** CloudDocTree 未暴露折叠 API：逐个点掉左栏处于展开态的折叠按钮。
 *  只点 <button>（行容器同样带 aria-expanded，连点会「折叠后又展开」）。 */
function collapseAll(): void {
  const root = sidebarTreeRef.value?.$el;
  if (!root) {
    return;
  }
  root.querySelectorAll<HTMLElement>('button[aria-expanded="true"]').forEach((toggle) => toggle.click());
}

// ---------------------------------------------------------------------------
// 同步状态（左栏底栏）
// ---------------------------------------------------------------------------
const quotaLabel = computed(() => cloudSyncStore.quotaLabel);
const quotaPercent = computed(() => Math.round(cloudSyncStore.usedRatio * 100));
/** 完全空配额时仍留 2% 的可见基线，避免进度条看起来像坏了。 */
const quotaBarWidth = computed(() => Math.max(2, quotaPercent.value));

// ---------------------------------------------------------------------------
// 拉取
// ---------------------------------------------------------------------------
async function reload(): Promise<void> {
  activeKeyword.value = keywordInput.value.trim();
  if (previewMode.value) {
    // 预览模式不联网：数据完全由 previewNodes 决定，但仍允许关键字在本地过滤
    loading.value = false;
    error.value = '';
    return;
  }
  loading.value = true;
  error.value = '';
  // 顺带刷新 /me 配额（未登录时 store 内部直接返回）
  void cloudSyncStore.refreshSpace();
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
    if (!visible) {
      records.value = [];
      selectedKey.value = '';
      activeWorkspace.value = '';
      return;
    }
    if (previewMode.value) {
      loading.value = false;
      error.value = '';
      syncSelection();
      void nextTick(() => searchInputRef.value?.focus());
      return;
    }
    void reload();
    void nextTick(() => searchInputRef.value?.focus());
  },
  { immediate: true },
);
</script>

<style scoped>
/* ------------------------------------------------------------------ */
/* 外壳：尺寸/圆角/底色/阴影由 .cd-dialog--window 提供，这里只补设计稿细节 */
/* ------------------------------------------------------------------ */
.cloud-browser-backdrop {
  /* 高于设置面板整页层（2000），低于同步弹窗（12000）与 toast（20000） */
  z-index: 3000;
}

.cloud-browser {
  position: relative;
  /* 设计稿：顶部青色径向微光 + 玻璃底 */
  background-image: radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.08) 0%, transparent 70%);
  backdrop-filter: blur(28px) saturate(190%);
}

/* ---------------------------- 标题栏 ---------------------------- */
/* 高度自适应：窗宽不足时标题栏允许换行（.cd-titlebar 原本写死 height:56px），
   否则搜索框 + 3 个按钮 + 关闭键会把右侧挤出可视区。 */
.cloud-browser__header {
  gap: 12px 16px;
  height: auto;
  min-height: 56px;
  padding-block: 8px;
  flex-wrap: wrap;
}

.cloud-browser__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  min-width: 0;
}

.cloud-browser__title {
  display: flex;
  flex: 1 1 auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.cloud-browser__title-icon {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  color: var(--cd-accent, #38bdf8);
}

.cloud-browser__count {
  flex: 0 0 auto;
  gap: 6px;
  white-space: nowrap;
}

.cloud-browser__pulse {
  width: 6px;
  height: 6px;
  background: var(--cd-success, #10b981);
  border-radius: 50%;
  animation: cloud-browser-pulse 1.8s ease-in-out infinite;
}

@keyframes cloud-browser-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.35;
  }
}

.cloud-browser__capacity {
  flex: 0 1 auto;
  overflow: hidden;
  font-size: 12px;
  color: var(--cd-text-3, #64748b);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-browser__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
}

.cloud-browser__search {
  height: 32px;
  border-radius: var(--cd-r-panel, 8px);
}

.cloud-browser__search-icon {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: var(--cd-text-3, #64748b);
  pointer-events: none;
}

.cloud-browser__search-input {
  width: clamp(180px, 22vw, 280px);
  padding: 0 42px 0 30px;
}

.cloud-browser__search-input:focus ~ .cd-search__kbd {
  color: var(--cd-accent, #38bdf8);
}

.cloud-browser__btn-icon {
  width: 13px;
  height: 13px;
}

.cloud-browser__btn-icon--accent {
  color: var(--cd-accent, #38bdf8);
}

.cloud-browser__close svg {
  width: 16px;
  height: 16px;
}

/* ---------------------------- 三栏骨架 ---------------------------- */
.cloud-browser__sidebar {
  display: flex;
  flex: 0 0 256px;
  flex-direction: column;
  width: 256px;
  min-height: 0;
  background: color-mix(in srgb, var(--cd-bg-sunken, #0d0e16) 60%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--cd-border-strong, #323653) 80%, transparent);
}

.cloud-browser__sidebar-scroll {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  padding: 14px;
}

.cloud-browser__section {
  flex: 0 0 auto;
}

.cloud-browser__section-head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--cd-text-2, #94a3b8);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.cloud-browser__section-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: var(--cd-text-3, #64748b);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.cloud-browser__section-action:hover {
  color: var(--cd-accent, #38bdf8);
  background: var(--cd-hover, rgba(255, 255, 255, 0.08));
}

.cloud-browser__section-action svg {
  width: 14px;
  height: 14px;
}

/* 工作空间分区 */
.cloud-browser__spaces {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cloud-browser__space {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  height: 28px;
  padding: 0 10px;
  font-family: var(--cd-font-ui);
  font-size: 12px;
  font-weight: 500;
  color: var(--cd-text-2, #94a3b8);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.cloud-browser__space:hover {
  color: var(--cd-text, #f8fafc);
  background: color-mix(in srgb, var(--cd-hover, rgba(255, 255, 255, 0.08)) 60%, transparent);
}

.cloud-browser__space--active {
  font-weight: 600;
  color: var(--cd-accent, #38bdf8);
  background: color-mix(in srgb, var(--cd-accent, #38bdf8) 10%, transparent);
  border-color: color-mix(in srgb, var(--cd-accent, #38bdf8) 25%, transparent);
}

.cloud-browser__space-icon {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  opacity: 0.85;
}

/* 工作空间名占满剩余宽度并省略（路径第一段可能很长），计数等宽右对齐 */
.cloud-browser__space-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-browser__space-count {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--cd-text-3, #64748b);
}

.cloud-browser__space--active .cloud-browser__space-count {
  color: var(--cd-accent, #38bdf8);
}

.cloud-browser__spaces-empty {
  margin: 0;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--cd-text-3, #64748b);
}

/* 目录树容器（行渲染归 CloudDocTree，table/tree 布局共用） */
.cloud-browser__tree {
  min-height: 60px;
}

.cloud-browser__tree :deep(.cloud-doc-tree__list) {
  max-height: min(38vh, 340px);
}

/* 左栏是导航树（设计稿一）：256px 里放不下行内「打开」按钮与大小列，只留名称 + 目录计数；
   打开走双击 / 右键菜单，大小/版本/时间在中间表格里看。 */
.cloud-browser__tree :deep(.cloud-doc-tree__open),
.cloud-browser__tree :deep(.cloud-doc-tree__size),
.cloud-browser__tree :deep(.cloud-doc-tree__ver) {
  display: none;
}

/* 标签筛选 */
.cloud-browser__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 8px;
}

.cloud-browser__tag {
  padding: 2px 8px;
  font-size: 11px;
  color: var(--cd-accent, #38bdf8);
  cursor: pointer;
  background: color-mix(in srgb, var(--cd-bg-card, #1e2033) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--cd-accent, #38bdf8) 20%, transparent);
  border-radius: 4px;
}

.cloud-browser__tag:hover {
  background: var(--cd-bg-overlay, #262940);
}

.cloud-browser__tag--active {
  color: #061521;
  background: var(--cd-accent, #38bdf8);
  border-color: var(--cd-accent, #38bdf8);
}

.cloud-browser__tags-empty {
  margin: 0;
  font-size: 11px;
  color: var(--cd-text-3, #64748b);
}

/* 左栏底栏 */
.cloud-browser__sidebar-footer {
  flex: 0 0 auto;
  padding: 12px;
  background: color-mix(in srgb, var(--cd-bg-sunken, #0d0e16) 40%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--cd-border-strong, #323653) 70%, transparent);
}

.cloud-browser__engine {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--cd-text-2, #94a3b8);
}

.cloud-browser__engine-name {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.cloud-browser__engine-dot {
  width: 8px;
  height: 8px;
  background: var(--cd-success, #10b981);
  border-radius: 50%;
  box-shadow: 0 0 8px -1px rgba(16, 185, 129, 0.8);
}

.cloud-browser__engine-quota {
  font-size: 11px;
  color: var(--cd-text-3, #64748b);
}

.cloud-browser__quota {
  height: 6px;
}

.cloud-browser__engine-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 10px;
  color: var(--cd-text-3, #64748b);
}

.cloud-browser__storage {
  white-space: nowrap;
}

/* ---------------------------- 中间栏 ---------------------------- */
.cloud-browser__main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: color-mix(in srgb, var(--cd-bg-sunken, #0d0e16) 40%, transparent);
}

.cloud-browser__subheader {
  display: flex;
  flex: 0 0 auto;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 16px;
  background: color-mix(in srgb, var(--cd-bg-panel, #161826) 40%, transparent);
  border-bottom: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
}

.cloud-browser__crumbs {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  font-size: 12px;
  color: var(--cd-text-2, #94a3b8);
}

.cloud-browser__crumb {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  overflow: hidden;
  color: var(--cd-text-2, #94a3b8);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-browser__crumb--home {
  padding: 0;
  font-family: var(--cd-font-ui);
  font-size: 12px;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.cloud-browser__crumb--home:hover {
  color: var(--cd-text, #f8fafc);
}

.cloud-browser__crumb--home svg {
  width: 13px;
  height: 13px;
  color: var(--cd-text-3, #64748b);
}

.cloud-browser__crumb-sep {
  color: var(--cd-text-3, #475569);
}

.cloud-browser__crumbs > .cloud-browser__crumb:last-child {
  font-weight: 500;
  color: var(--cd-text, #f8fafc);
}

.cloud-browser__viewtools {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
}

.cloud-browser__formats {
  display: flex;
  gap: 2px;
  align-items: center;
  padding: 2px;
  background: color-mix(in srgb, var(--cd-bg-sunken, #0d0e16) 70%, transparent);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: 8px;
}

.cloud-browser__format {
  height: 22px;
  padding: 0 8px;
  font-family: var(--cd-font-mono);
  font-size: 11px;
  color: var(--cd-text-2, #94a3b8);
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.cloud-browser__format:hover {
  color: var(--cd-text, #f8fafc);
}

.cloud-browser__format--active {
  font-weight: 600;
  color: var(--cd-text, #f8fafc);
  background: var(--cd-bg-overlay, #262940);
}

.cloud-browser__views {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: color-mix(in srgb, var(--cd-bg-sunken, #0d0e16) 80%, transparent);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: 8px;
}

.cloud-browser__view {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--cd-text-3, #64748b);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.cloud-browser__view svg {
  width: 14px;
  height: 14px;
}

.cloud-browser__view--active {
  color: var(--cd-accent, #38bdf8);
  background: var(--cd-bg-overlay, #262940);
}

.cloud-browser__view:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.cloud-browser__hint {
  flex: 0 0 auto;
  margin: 0;
  padding: 6px 16px;
  font-size: 11px;
  color: var(--cd-warning, #f59e0b);
  background: rgba(245, 158, 11, 0.08);
  border-bottom: 1px solid color-mix(in srgb, var(--cd-border-soft, rgba(50, 54, 83, 0.6)) 60%, transparent);
}

/* 列表区：表头固定、行区滚动（滚动交给 CloudDocTree 内部 __list） */
.cloud-browser__list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.cloud-browser__list :deep(.cloud-doc-tree) {
  flex: 1 1 auto;
  min-height: 0;
}

/* 三态占满列表区并居中 */
.cloud-browser__list > .cd-state {
  flex: 1 1 auto;
}

.cloud-browser__empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  color: var(--cd-accent, #38bdf8);
  background: color-mix(in srgb, var(--cd-accent, #38bdf8) 12%, transparent);
  border-radius: 50%;
}

.cloud-browser__empty-icon svg {
  width: 24px;
  height: 24px;
}

.cloud-browser__diag-warn {
  color: var(--cd-warning, #f59e0b);
}

/* 底栏 h36 */
.cloud-browser__statusbar {
  display: flex;
  flex: 0 0 auto;
  gap: 12px;
  align-items: center;
  height: 36px;
  padding: 0 16px;
  font-size: 12px;
  color: var(--cd-text-2, #94a3b8);
  background: color-mix(in srgb, var(--cd-bg-sunken, #0d0e16) 70%, transparent);
  border-top: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
}

.cloud-browser__status-dir {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-browser__status-sep {
  color: var(--cd-text-3, #475569);
}

.cloud-browser__synced {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  margin-left: auto;
  font-size: 11px;
  color: var(--cd-success, #10b981);
  white-space: nowrap;
}

.cloud-browser__synced svg {
  width: 13px;
  height: 13px;
}

/* ---------------------------- 右栏检查器 ---------------------------- */
.cloud-browser__inspector {
  display: flex;
  flex: 0 0 320px;
  flex-direction: column;
  width: 320px;
  min-height: 0;
  overflow-y: auto;
  background: color-mix(in srgb, var(--cd-bg-panel, #161826) 50%, transparent);
  border-left: 1px solid color-mix(in srgb, var(--cd-border-strong, #323653) 80%, transparent);
}

.cloud-browser__inspect-block {
  flex: 0 0 auto;
  padding: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--cd-border-strong, #323653) 70%, transparent);
}

.cloud-browser__inspect-block--last {
  flex: 1 1 auto;
  border-bottom: 0;
}

.cloud-browser__inspect-badges {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  justify-content: space-between;
}

.cloud-browser__inspect-name {
  margin: 10px 0 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--cd-text, #f8fafc);
  word-break: break-all;
}

.cloud-browser__inspect-meta {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--cd-text-3, #64748b);
  word-break: break-all;
}

.cloud-browser__open-btn {
  width: 100%;
  height: 34px;
}

.cloud-browser__inspect-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.cloud-browser__inspect-actions .cd-btn {
  height: 30px;
  padding: 0 8px;
  font-size: 12px;
}

.cloud-browser__inspect-title {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--cd-text-2, #94a3b8);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.cloud-browser__inspect-format {
  font-size: 10px;
  text-transform: none;
  color: var(--cd-accent, #38bdf8);
}

.cloud-browser__snapshot {
  padding: 12px;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.7;
  color: var(--cd-text-2, #94a3b8);
  word-break: break-all;
  background: color-mix(in srgb, var(--cd-bg-sunken, #0d0e16) 80%, transparent);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: 8px;
  user-select: text;
}

.cloud-browser__snapshot p {
  margin: 0;
}

.cloud-browser__snapshot-head {
  font-weight: 700;
  color: var(--cd-accent, #38bdf8);
}

.cloud-browser__link {
  padding: 0;
  font-family: var(--cd-font-ui);
  font-size: 11px;
  color: var(--cd-accent, #38bdf8);
  text-transform: none;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.cloud-browser__link:hover {
  color: var(--cd-accent-strong, #7dd3fc);
}

.cloud-browser__timeline {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0 0 0 16px;
  list-style: none;
  border-left: 1px solid color-mix(in srgb, var(--cd-border-strong, #323653) 80%, transparent);
}

.cloud-browser__version {
  position: relative;
}

.cloud-browser__version-dot {
  position: absolute;
  top: 4px;
  left: -21px;
  width: 10px;
  height: 10px;
  background: var(--cd-border-strong, #323653);
  border-radius: 50%;
  box-shadow: 0 0 0 4px var(--cd-bg-panel, #161826);
}

.cloud-browser__version--current .cloud-browser__version-dot {
  background: var(--cd-accent, #38bdf8);
}

.cloud-browser__version-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
}

.cloud-browser__version-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-text, #f8fafc);
}

.cloud-browser__version-time {
  font-size: 10px;
  color: var(--cd-text-3, #64748b);
}

.cloud-browser__version-hint {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--cd-text-2, #94a3b8);
  word-break: break-word;
}

/* ============================== 窗口自适应 ==============================
   目标：窗口从 1400×900 一路缩到 900×560 时，任何一栏的内容都不被裁切/遮挡。
   策略：先让右栏检查器让位（<1280），再收窄左栏（<1100），最后压缩竖向留白（矮窗）；
   三栏内部各自滚动（左栏目录树 / 中间列表 / 检查器），弹窗本身不做整体滚动。 */

/* 中窗：收右栏 + 左栏收窄 + 标题栏容量文案让位 */
@media (max-width: 1279px) {
  .cloud-browser__inspector {
    display: none;
  }

  .cloud-browser__sidebar {
    flex-basis: 232px;
    width: 232px;
  }

  .cloud-browser__capacity {
    display: none;
  }
}

/* 窄窗：左栏再收窄、搜索框缩短、格式筛选可横向滚动 */
@media (max-width: 1100px) {
  .cloud-browser__sidebar {
    flex-basis: 208px;
    width: 208px;
  }

  .cloud-browser__sidebar-scroll {
    gap: 12px;
    padding: 10px;
  }

  .cloud-browser__search-input {
    width: clamp(120px, 16vw, 220px);
  }

  .cloud-browser__formats {
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .cloud-browser__formats::-webkit-scrollbar {
    display: none;
  }

  .cloud-browser__viewtools {
    min-width: 0;
  }
}

/* 更窄（半屏 / 竖屏）：左栏压到 176，标题栏与列表头贴合视口宽度 */
@media (max-width: 860px) {
  .cloud-browser__sidebar {
    flex-basis: 176px;
    width: 176px;
  }

  .cloud-browser__header {
    padding-inline: 12px;
  }

  .cloud-browser__subheader {
    height: auto;
    min-height: 40px;
    padding-block: 6px;
    flex-wrap: wrap;
    row-gap: 6px;
  }

  .cloud-browser__statusbar {
    height: auto;
    min-height: 30px;
    padding-block: 4px;
    flex-wrap: wrap;
    row-gap: 2px;
  }
}

/* 矮窗：压掉标题栏/子头/状态栏的固定高度与竖向留白，把高度还给列表 */
@media (max-height: 720px) {
  .cloud-browser__header {
    min-height: 48px;
    padding-block: 6px;
  }

  .cloud-browser__subheader {
    height: 38px;
  }

  .cloud-browser__statusbar {
    height: 30px;
  }

  .cloud-browser__sidebar-scroll {
    gap: 10px;
    padding: 10px;
  }

  .cloud-browser__sidebar-footer {
    padding: 8px 10px;
  }

  .cloud-browser__section-head {
    padding-bottom: 4px;
    margin-bottom: 4px;
  }
}

/* 极矮窗（<560）：隐藏标签筛选与底栏次要信息，保证列表可见高度 */
@media (max-height: 560px) {
  .cloud-browser__tags {
    display: none;
  }

  .cloud-browser__engine-meta {
    display: none;
  }

  .cloud-browser__list {
    min-height: 96px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cloud-browser__pulse {
    animation: none;
  }
}
</style>
