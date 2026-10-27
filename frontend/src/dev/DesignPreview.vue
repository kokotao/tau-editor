/**
 * @description 云文档设计稿实时预览页（仅开发环境）：把 Stitch 三份设计稿对应的真实组件用 mock 数据渲染出来，
 * 供 `http://127.0.0.1:5173/?design-preview=cloud-doc` 在浏览器（无 Tauri 运行时）里直接验收样式与交互。
 *
 * 页面本身不参与生产构建路径（main.ts 里仅在 import.meta.env.DEV 且带 query 时挂载）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-26 23:58
 */
<template>
  <div class="dp-root cd-nocturne">
    <header class="dp-toolbar">
      <div class="dp-toolbar__brand">
        <strong>云文档设计稿实时预览</strong>
        <span class="cd-pill">DEV ONLY · mock 数据</span>
      </div>
      <nav class="dp-tabs">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          class="cd-btn"
          :class="active === tab.id ? 'cd-btn--primary' : 'cd-btn--secondary'"
          :data-testid="`dp-tab-${tab.id}`"
          @click="active = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>
      <div class="dp-toolbar__meta cd-mono">
        <span>{{ MOCK_FILES.length }} 个文档</span>
        <span>·</span>
        <span>HMR 实时</span>
      </div>
    </header>

    <p class="dp-hint">
      这份页面用 mock 数据渲染<b>真实业务组件</b>，不是设计稿截图。设计稿原文见
      <code>tau-editor/docs/design/stitch/*.html</code>，规格见 <code>SPEC.md</code>。
      浏览器环境没有 Tauri 运行时，因此网络请求一律走兜底分支，属预期行为。
    </p>

    <main class="dp-stage">
      <!-- 设计稿一：云文档浏览弹窗（三栏工作台） -->
      <section v-if="active === 'browser'" class="dp-section">
        <h2 class="dp-section__title">设计稿一 · Tau Editor - 云端文档浏览器（全新重构）</h2>
        <div class="dp-mount dp-mount--window">
          <CloudDocBrowser
            :visible="true"
            :preview-nodes="mockTree"
            :preview-total="MOCK_FILES.length"
            @close="noop"
            @open-file="onOpenFile"
          />
        </div>
      </section>

      <!-- 设计稿二：设置-云同步 -->
      <section v-else-if="active === 'sync'" class="dp-section">
        <h2 class="dp-section__title">设计稿二 · Tau Editor 偏好设置 - 云端同步</h2>
        <div class="dp-state-switch">
          <button
            v-for="state in PREVIEW_STATES"
            :key="state"
            type="button"
            class="cd-chip"
            :class="{ 'cd-chip--active': syncState === state }"
            @click="syncState = state"
          >
            {{ state }}
          </button>
        </div>
        <div class="dp-mount dp-mount--settings">
          <component :is="syncSection" v-if="syncSection" :preview-state="syncState" />
          <div v-else class="cd-state">
            <p class="cd-state__title">CloudSyncSettingsSection 尚未落地</p>
            <p class="cd-state__hint">
              等待 Agent 把 SettingsPanel 的云同步分区抽成 components/editor/settings/CloudSyncSettingsSection.vue，
              本页会用 import.meta.glob 自动发现并挂载，无需改这里。
            </p>
          </div>
        </div>
      </section>

      <!-- 修复验收：只读预览浮层（原缺陷：DOM 无任何 CSS + Teleport 后无定位，点了"没反应"） -->
      <section v-else-if="active === 'fix'" class="dp-section">
        <h2 class="dp-section__title">修复验收 · 只读预览 / 另存为选择浮层</h2>
        <p class="dp-hint dp-hint--inline">
          左侧是「只读预览」卡片（遮罩 + 居中 + 可滚动正文），右侧是跨工作区时的「取消 / 另存为… / 只读预览」选择卡片。
          两者都走同一组件 CloudDocPreviewDialog，Esc 与 × 均可关闭。
        </p>
        <div class="dp-fix-grid">
          <button type="button" class="cd-btn cd-btn--primary" data-testid="dp-open-preview" @click="previewVisible = true">
            打开只读预览
          </button>
          <button type="button" class="cd-btn cd-btn--secondary" data-testid="dp-open-choice" @click="choiceVisible = true">
            打开选择卡片
          </button>
          <span class="cd-mono dp-fix-grid__log">{{ fixLog || '等待交互…' }}</span>
        </div>

        <CloudDocPreviewDialog
          :visible="previewVisible"
          title="只读预览 · 量化学习路线.md"
          :content="SAMPLE_MARKDOWN"
          @close="closePreview"
        />
        <CloudDocPreviewDialog
          :visible="choiceVisible"
          variant="choice"
          title="该云文档不在当前工作区"
          hint="可以只读预览，或另存到本地任意位置。"
          @close="closeChoice"
        >
          <button type="button" class="cd-btn cd-btn--ghost" @click="closeChoice">取消</button>
          <button type="button" class="cd-btn cd-btn--secondary" @click="pickSaveAs">另存为…</button>
          <button type="button" class="cd-btn cd-btn--primary" @click="closeChoice">只读预览</button>
        </CloudDocPreviewDialog>
      </section>

      <!-- 设计稿三：资源管理器 - 云端文档 -->
      <section v-else class="dp-section">
        <h2 class="dp-section__title">设计稿三 · Tao Editor 资源管理器 - 云端文档（含右键菜单）</h2>
        <p class="dp-hint dp-hint--inline">
          在任意文件行上<b>右键</b>可打开完整快捷菜单（打开 / 同步至云端 / 一键分享 / 属性 / 历史版本 / 移动到… / 删除云端文档）。
        </p>
        <div class="dp-stage__split">
          <div class="dp-explorer cd-nocturne">
            <div class="dp-explorer__head">
              <span class="cd-badge cd-badge--md">云</span>
              <strong>云端文档库</strong>
              <span class="cd-pill cd-pill--warning">{{ MOCK_FILES.length }} 项文件</span>
            </div>
            <CloudDocTree :nodes="mockTree" @open-file="onOpenFile" @changed="noop" @written="noop" @doc-action="noop" />
          </div>
          <div class="dp-notes">
            <p class="cd-state__title">验收要点</p>
            <ul>
              <li>行高 / 缩进 / 类型徽标 / 大小·版本·时间三列是否与稿一致</li>
              <li>hover 行、选中行（左 2px 主色条）</li>
              <li>右键菜单项顺序、分隔线、危险项配色、hover 反色</li>
              <li>「移动到…」二级菜单不被一层菜单盖住</li>
            </ul>
          </div>
        </div>
      </section>
    </main>

    <footer class="dp-log cd-mono">
      <span v-if="lastEvent">最近事件：{{ lastEvent }}</span>
      <span v-else>等待交互…</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, markRaw, ref, shallowRef, watchEffect, type Component } from 'vue';
import CloudDocBrowser from '@/components/editor/CloudDocBrowser.vue';
import CloudDocTree from '@/components/editor/CloudDocTree.vue';
import CloudDocPreviewDialog from '@/components/editor/CloudDocPreviewDialog.vue';
import { buildCloudDocTree, type CloudDocTreeNode } from '@/services/cloudBrowserService';
import type { CloudDocItem } from '@/lib/tauri';

const TABS = [
  { id: 'browser', label: '设计稿一 · 云文档浏览弹窗' },
  { id: 'sync', label: '设计稿二 · 设置-云同步' },
  { id: 'explorer', label: '设计稿三 · 资源管理器-云端文档' },
  { id: 'fix', label: '修复验收 · 只读预览浮层' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const active = ref<TabId>('browser');
const lastEvent = ref('');
const noop = () => undefined;

/** 与设计稿示例数据对齐（镜像管理提示词.md / 经济相互依存性… / 量化学习路线.md / qa-docx… / setup.py / soft-registers.json）。 */
function makeItem(name: string, path: string, size: number, version: number): CloudDocItem {
  return {
    fileId: Math.floor(Math.random() * 1e12),
    path,
    title: name,
    contentHash: '8f2a4c1e90b4',
    size,
    version,
    category: '分享',
    categoryId: '1790000000000000001',
    tags: null,
    visibility: 'private',
    publishedArticleId: null,
    updatedAt: '2026-10-25T21:24:33+08:00',
  };
}

const MOCK_FILES: CloudDocItem[] = [
  makeItem('镜像管理提示词.md', 'tau/tau-core-engine/分享/分享子项/镜像管理提示词.md', 0, 3),
  makeItem('经济相互依存性和贸易.md', 'tau/tau-core-engine/分享/分享子项/经济相互依存性和贸易.md', 3072, 4),
  makeItem('量化学习路线.md', 'tau/tau-core-engine/分享/分享子项/量化学习路线.md', 12698, 2),
  makeItem('qa-docx-190038.docx', 'tau/tau-core-engine/分享/分享子项/qa-docx-190038.docx', 37478, 1),
  makeItem('setup.py', 'tau/tau-core-engine/分享/分享子项/setup.py', 4403, 1),
  makeItem('soft-registers.json', 'tau/tau-core-engine/分享/分享子项/soft-registers.json', 0, 2),
];

const mockTree = markRaw(buildCloudDocTree(MOCK_FILES, { stripPrefix: 'tau/tau-core-engine' })) as CloudDocTreeNode[];

/** 设计稿二的四种状态（组件落地后生效）。 */
const PREVIEW_STATES = ['signed-out', 'signed-in', 'syncing', 'error'] as const;
const syncState = ref<(typeof PREVIEW_STATES)[number]>('signed-in');

/**
 * 用 glob 探测云同步分区组件是否已落地：未落地时返回 undefined，页面显示占位说明，
 * 避免"文件还没建就被 import"导致整个预览页编译失败。
 */
const syncModules = import.meta.glob<{ default: Component }>('../components/editor/settings/CloudSyncSettingsSection.vue');
const syncSection = shallowRef<Component | null>(null);
watchEffect(() => {
  const loader = syncModules['../components/editor/settings/CloudSyncSettingsSection.vue'];
  if (!loader) {
    return;
  }
  void loader().then((mod) => {
    syncSection.value = defineAsyncComponent(async () => mod);
  });
});

function onOpenFile(path: string): void {
  lastEvent.value = `open-file → ${path}`;
}

// ------------------------------------------------------------------
// 修复验收：只读预览 / 选择浮层
// ------------------------------------------------------------------
const previewVisible = ref(false);
const choiceVisible = ref(false);
const fixLog = ref('');

const SAMPLE_MARKDOWN = `# 量化学习路线

## 阶段一 · 基础
- 概率论与数理统计：期望、方差、条件概率
- 时间序列：平稳性、ADF 检验、ARIMA

## 阶段二 · 策略
1. 因子挖掘：动量、价值、波动率
2. 回测框架：滑点、手续费、幸存者偏差

## 阶段三 · 工程化
\`\`\`python
import pandas as pd

def sharpe(returns, rf=0.02):
    excess = returns - rf / 252
    return excess.mean() / excess.std() * (252 ** 0.5)
\`\`\`

> 只读预览不写盘；需要本地化请使用「另存为…」。`;

function closePreview(): void {
  previewVisible.value = false;
  fixLog.value = '预览卡片已关闭（Esc 或 × 均走同一 close 事件）';
}

function closeChoice(): void {
  choiceVisible.value = false;
  fixLog.value = '选择卡片已关闭';
}

function pickSaveAs(): void {
  choiceVisible.value = false;
  fixLog.value = '选择了「另存为…」→ 真实环境会打开系统保存对话框，写盘成功后 emit open-file 自动在编辑器打开';
}
</script>

<style scoped>
.dp-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100vh;
  padding: 12px 16px 0;
  overflow: hidden;
  background: var(--cd-bg-app, #0e0f17);
}

.dp-toolbar {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--cd-bg-panel, #161826);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: var(--cd-r-dialog, 12px);
}

.dp-toolbar__brand {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--cd-text, #f8fafc);
}

.dp-tabs {
  display: flex;
  gap: 6px;
}

.dp-toolbar__meta {
  display: flex;
  gap: 6px;
  font-size: 11px;
  color: var(--cd-text-3, #64748b);
}

.dp-hint {
  flex: 0 0 auto;
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--cd-text-2, #94a3b8);
}

.dp-hint code {
  padding: 1px 4px;
  font-family: var(--cd-font-mono, monospace);
  font-size: 11px;
  color: var(--cd-accent, #38bdf8);
  background: rgba(56, 189, 248, 0.1);
  border-radius: 4px;
}

.dp-hint--inline {
  margin-bottom: 8px;
}

.dp-stage {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.dp-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.dp-section__title {
  flex: 0 0 auto;
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-text-2, #94a3b8);
}

.dp-mount {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

/* CloudDocBrowser 自带 fixed 遮罩：在预览页里还原成"画布内"渲染，避免压住工具栏 */
.dp-mount--window :deep(.cloud-browser-backdrop) {
  position: static;
  padding: 0;
  background: transparent;
  backdrop-filter: none;
}

.dp-mount--window :deep(.cloud-browser) {
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
}

.dp-mount--settings {
  padding: 16px;
  overflow: auto;
  background: var(--cd-bg-app, #0e0f17);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: var(--cd-r-dialog, 12px);
}

.dp-state-switch {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.dp-stage__split {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: 360px 1fr;
  gap: 12px;
  min-height: 0;
}

.dp-explorer {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--cd-bg-panel, #161826);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: var(--cd-r-dialog, 12px);
}

.dp-explorer__head {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--cd-text, #f8fafc);
  border-bottom: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
}

.dp-explorer :deep(.cloud-doc-tree) {
  flex: 1 1 auto;
  min-height: 0;
}

.dp-notes {
  padding: 12px 16px;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--cd-text-2, #94a3b8);
  background: var(--cd-bg-panel, #161826);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: var(--cd-r-dialog, 12px);
}

.dp-notes ul {
  margin: 6px 0 0;
  padding-left: 18px;
}

.dp-log {
  flex: 0 0 auto;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--cd-text-3, #64748b);
  background: var(--cd-bg-panel, #161826);
  border-top: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
}

.dp-fix-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.dp-fix-grid__log {
  font-size: 11px;
  color: var(--cd-text-3, #64748b);
}
</style>
