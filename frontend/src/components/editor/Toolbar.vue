<template>
  <div class="toolbar" data-testid="toolbar">
    <div class="toolbar-zone toolbar-zone-start">
      <div class="toolbar-identity">
        <svg
          class="toolbar-app-icon"
          viewBox="80 190 710 620"
          role="img"
          :aria-label="appLabel || 'Tau Editor'"
          :title="appLabel || 'Tau Editor'"
          data-testid="toolbar-app-icon"
        >
          <defs>
            <filter id="toolbar-app-icon-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g class="toolbar-app-icon-arrows">
            <path d="M432 468V212m0 0-43 77m43-77 43 77M250 675 100 762m0 0 94 1m-94-1 47-82m469-5 150 87m0 0-47-82m47 82-94 1" />
          </g>
          <path class="toolbar-app-icon-top" d="m247 462 185-107 184 107-184 100-185-100Z" />
          <path class="toolbar-app-icon-left" d="M247 462v214l185 112V562L247 462Z" />
          <path class="toolbar-app-icon-right" d="M432 562v226l184-112V462L432 562Z" />
          <g class="toolbar-app-icon-cube-lines">
            <path d="m247 462 185-107 184 107M247 462l185 100 184-100M432 562v226" />
            <path d="m522 622 94 54" />
          </g>
          <path class="toolbar-app-icon-tau" d="M302 598c4-18 12-20 29-18l48 4c7 1 10-3 12-11l-5 24c-1 5-5 7-11 6l-24-3-9 63c-3 19 5 33 20 36 11 2 17-4 21-15-3 21-13 31-28 27-22-5-33-26-30-51l8-61-19-2c-7 0-11 4-14 12l2-11Z" />
        </svg>
      </div>
    </div>

    <div class="toolbar-zone toolbar-zone-center">
      <div class="toolbar-group toolbar-group-main">
        <button
          class="toolbar-btn"
          data-testid="btn-new-file"
          :aria-label="copy.newFile"
          @click="emit('new-file')"
          :title="copy.newFile"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </button>
        <button
          class="toolbar-btn"
          data-testid="btn-open-file"
          :aria-label="copy.openFile"
          @click="emit('open-file')"
          :title="copy.openFile"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
          </svg>
        </button>
        <button
          class="toolbar-btn"
          data-testid="btn-open-folder"
          :aria-label="copy.openFolder"
          @click="emit('open-folder')"
          :title="copy.openFolder"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" />
            <path d="M3 10h18l-2 8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        </button>
        <button
          class="toolbar-btn"
          data-testid="btn-save"
          @click="emit('save')"
          :disabled="!isDirty"
          :class="{ disabled: !isDirty }"
          :aria-label="copy.save"
          :title="copy.save"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17,21 17,13 7,13 7,21" />
            <polyline points="7,3 7,8 15,8" />
          </svg>
        </button>
        <button
          class="toolbar-btn"
          data-testid="btn-save-as"
          :aria-label="copy.saveAs"
          @click="emit('save-as')"
          :title="copy.saveAs"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17,21 17,13 7,13 7,21" />
            <polyline points="7,3 7,8 15,8" />
            <line x1="12" y1="10" x2="12" y2="16" />
            <line x1="9" y1="13" x2="15" y2="13" />
          </svg>
        </button>
      </div>

      <template v-if="isMarkdown">
        <div class="toolbar-divider markdown-toolbar-divider"></div>
        <div class="toolbar-group toolbar-group-markdown" data-testid="markdown-toolbar">
          <div ref="markdownHeadingRef" class="markdown-heading-menu">
            <button
              type="button"
              class="toolbar-btn markdown-toolbar-btn markdown-heading-trigger"
              data-testid="markdown-action-heading"
              aria-label="标题级别"
              title="标题级别"
              :aria-expanded="markdownHeadingOpen"
              @mousedown.prevent
              @click="toggleMarkdownHeading"
            >
              <MarkdownActionIcon name="heading" />
              <TauIcon name="icon-chevron-down" size="11" class="markdown-heading-caret" />
            </button>
          </div>
          <template v-for="action in markdownActions" :key="action.value">
            <div v-if="action.value === 'code'" ref="markdownCodeRef" class="markdown-code-menu">
              <button
                type="button"
                class="toolbar-btn markdown-toolbar-btn"
                :data-testid="`markdown-action-${action.value}`"
                :aria-label="action.label"
                :title="action.label"
                :aria-expanded="markdownCodeOpen"
                @mousedown.prevent
                @click="toggleMarkdownCode"
              >
                <MarkdownActionIcon :name="action.value" />
              </button>
            </div>
            <button
              v-else
              type="button"
              class="toolbar-btn markdown-toolbar-btn"
              :data-testid="`markdown-action-${action.value}`"
              :aria-label="action.label"
              :title="action.label"
              @mousedown.prevent
              @click="action.value === 'image' ? emit('markdown-image') : emit('markdown-action', action.value)"
            >
              <MarkdownActionIcon :name="action.value" />
            </button>
          </template>
        </div>
      </template>

      <Teleport to="body">
        <div
          v-if="markdownHeadingOpen"
          ref="markdownHeadingPanelRef"
          class="markdown-heading-panel"
          data-testid="markdown-heading-panel"
          :style="markdownHeadingPanelStyle"
          @mousedown.stop
        >
          <button
            v-for="level in headingLevels"
            :key="level"
            type="button"
            class="markdown-heading-option"
            :data-testid="`markdown-heading-${level}`"
            @mousedown.prevent.stop
            @click="selectMarkdownHeading(level)"
          >
            <span class="markdown-heading-mark">{{ '#'.repeat(level) }}</span>
            <span>标题 {{ level }}</span>
          </button>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="markdownCodeOpen"
          ref="markdownCodePanelRef"
          class="markdown-code-panel"
          data-testid="markdown-code-panel"
          :style="markdownCodePanelStyle"
          @mousedown.stop
        >
          <div class="markdown-code-panel-title">代码格式</div>
          <button
            type="button"
            class="markdown-code-option"
            data-testid="markdown-code-inline"
            @mousedown.prevent.stop
            @click="selectMarkdownCode('__inline__')"
          >
            <span>行内代码</span><code>`code`</code>
          </button>
          <button
            v-for="language in codeLanguages"
            :key="language"
            type="button"
            class="markdown-code-option"
            :data-testid="`markdown-code-${language}`"
            @mousedown.prevent.stop
            @click="selectMarkdownCode(language)"
          >
            <span>{{ language }}</span><code>```{{ language }}</code>
          </button>
          <label class="markdown-code-custom">
            <span>自定义语言</span>
            <input
              v-model="customCodeLanguage"
              data-testid="markdown-code-custom-input"
              placeholder="例如：cpp"
              @keydown.enter.prevent="selectMarkdownCode(customCodeLanguage)"
            />
          </label>
        </div>
      </Teleport>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group toolbar-group-history">
        <button
          class="toolbar-btn"
          data-testid="btn-undo"
          @click="emit('undo')"
          :disabled="!canUndo"
          :class="{ disabled: !canUndo }"
          :aria-label="copy.undo"
          :title="copy.undo"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1,4 1,10 7,10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>
        <button
          class="toolbar-btn"
          data-testid="btn-redo"
          @click="emit('redo')"
          :disabled="!canRedo"
          :class="{ disabled: !canRedo }"
          :aria-label="copy.redo"
          :title="copy.redo"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23,4 23,10 17,10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group toolbar-group-views">
        <button
          class="toolbar-btn"
          data-testid="btn-toggle-file-tree"
          @click="emit('toggle-file-tree')"
          :aria-label="sidebarVisible ? copy.collapseExplorer : copy.expandExplorer"
          :title="sidebarVisible ? copy.collapseExplorer : copy.expandExplorer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
          </svg>
        </button>
        <button
          class="toolbar-btn"
          data-testid="btn-locate-current-file"
          :disabled="!canRevealCurrentFile || locatingCurrentFile"
          :class="{ disabled: !canRevealCurrentFile || locatingCurrentFile }"
          :aria-label="copy.locateCurrentFile"
          :title="copy.locateCurrentFile"
          @click="emit('locate-current-file')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
        <button
          v-if="isMarkdown || (isDocumentPreview && !isFullDocumentPreview)"
          class="toolbar-btn"
          data-testid="btn-markdown-preview-mode"
          @click="emit('cycle-markdown-preview')"
          :aria-label="`${copy.markdownViewPrefix}: ${previewModeLabel}`"
          :title="`${copy.markdownViewPrefix}: ${previewModeLabel}`"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="8" y1="4" x2="8" y2="20" />
            <line x1="16" y1="4" x2="16" y2="20" />
          </svg>
        </button>
        <button
          class="toolbar-btn"
          data-testid="btn-toggle-context-rail"
          @click="emit('toggle-context-rail')"
          :aria-label="contextRailVisible ? copy.collapseContext : copy.expandContext"
          :title="contextRailVisible ? copy.collapseContext : copy.expandContext"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="15" y1="4" x2="15" y2="20" />
          </svg>
        </button>
      </div>
    </div>

    <div class="toolbar-zone toolbar-zone-end">
      <!-- 思维导图工具组（UX-3C）：由 MindmapStage 外移，右侧 zone 内排布，testid 保持 mm-* 不变 -->
      <template v-if="isMindmap && mindmapTools">
        <div class="toolbar-group toolbar-group-mindmap" data-testid="mindmap-toolbar">
          <button type="button" class="mm-btn" data-testid="mm-add-child" :disabled="!mindmapTools.selectedTopicId" @click="emit('mm-add-child')">
            子主题
          </button>
          <button type="button" class="mm-btn" data-testid="mm-add-sibling" :disabled="!mindmapTools.selectedTopicId" @click="emit('mm-add-sibling')">
            同级
          </button>
          <button type="button" class="mm-btn" data-testid="mm-rename" :disabled="!mindmapTools.selectedTopicId" @click="emit('mm-rename')">
            改名
          </button>
          <button type="button" class="mm-btn" data-testid="mm-duplicate" :disabled="!mindmapTools.selectedTopicId" @click="emit('mm-duplicate')">
            复制
          </button>
          <button type="button" class="mm-btn danger" data-testid="mm-delete" :disabled="!mindmapTools.selectedTopicId" @click="emit('mm-delete')">
            删除
          </button>
          <span class="mm-divider" aria-hidden="true"></span>
          <button type="button" class="mm-btn" data-testid="mm-move-up" :disabled="!mindmapTools.selectedTopicId" title="上移（Alt+↑）" @click="emit('mm-move-up')">
            ↑
          </button>
          <button type="button" class="mm-btn" data-testid="mm-move-down" :disabled="!mindmapTools.selectedTopicId" title="下移（Alt+↓）" @click="emit('mm-move-down')">
            ↓
          </button>
          <span class="mm-divider" aria-hidden="true"></span>
          <button type="button" class="mm-btn" data-testid="mm-undo" :disabled="!mindmapTools.canUndo" title="撤销（Ctrl+Z）" @click="emit('mm-undo')">
            撤销
          </button>
          <button type="button" class="mm-btn" data-testid="mm-redo" :disabled="!mindmapTools.canRedo" title="重做（Ctrl+Shift+Z）" @click="emit('mm-redo')">
            重做
          </button>
          <span class="mm-divider" aria-hidden="true"></span>
          <button type="button" class="mm-btn" data-testid="mm-fit" title="适配内容" @click="emit('mm-fit')">
            适配
          </button>
          <button type="button" class="mm-btn" data-testid="mm-zoom-in" title="放大" @click="emit('mm-zoom-in')">+</button>
          <button type="button" class="mm-btn" data-testid="mm-zoom-out" title="缩小" @click="emit('mm-zoom-out')">−</button>
          <button type="button" class="mm-btn" data-testid="mm-reset-view" title="重置视口" @click="emit('mm-reset-view')">
            重置视口
          </button>
          <span class="mm-divider" aria-hidden="true"></span>
          <!-- 结构布局切换（阶段 4A）：当前模式高亮，点击记录为可撤销命令 -->
          <span class="mm-layout-group" role="group" aria-label="布局模式">
            <button
              v-for="option in mindmapLayoutOptions"
              :key="option.id"
              type="button"
              class="mm-btn"
              :class="{ 'is-active': mindmapTools.layoutMode === option.id }"
              :data-testid="`mm-layout-${option.id}`"
              :aria-pressed="mindmapTools.layoutMode === option.id"
              :title="option.title"
              @click="emit('mm-layout', option.id)"
            >{{ option.label }}</button>
          </span>
          <span class="mm-divider" aria-hidden="true"></span>
          <!-- 主题模板（阶段 4C）：原生 select，切换即写入 document.themeId，可撤销 -->
          <label class="mm-theme-field" title="主题模板">
            <span class="mm-theme-label">主题</span>
            <select
              class="mm-theme-select"
              data-testid="mm-theme-select"
              :value="mindmapTools.themeId"
              :aria-label="`主题模板：${mindmapTools.themeId}`"
              @change="onMindmapThemeChange"
            >
              <option v-for="option in mindmapTools.themeOptions" :key="option.id" :value="option.id">
                {{ option.name }}
              </option>
            </select>
          </label>
          <span class="mm-divider" aria-hidden="true"></span>
          <button type="button" class="mm-btn" data-testid="mm-reset" @click="emit('mm-reset')">重置</button>
          <span class="mm-divider" aria-hidden="true"></span>
          <button type="button" class="mm-btn" data-testid="mm-import" @click="emit('mm-import')">
            导入
          </button>
          <button type="button" class="mm-btn" data-testid="mm-export" @click="emit('mm-export')">
            导出
          </button>
          <button type="button" class="mm-btn" data-testid="mm-print" @click="emit('mm-print')">
            打印
          </button>
          <button
            type="button"
            class="mm-btn"
            data-testid="mm-toggle-outline"
            :aria-pressed="Boolean(mindmapTools.outlineActive)"
            title="切换大纲面板（Ctrl+Alt+O）"
            @click="emit('mm-toggle-outline')"
          >
            大纲{{ mindmapTools.outlineActive ? '开' : '关' }}
          </button>
          <button
            type="button"
            class="mm-btn"
            data-testid="mm-properties-toggle"
            :aria-pressed="Boolean(mindmapTools.propertiesActive)"
            title="切换属性面板（Ctrl+Alt+P）"
            @click="emit('mm-toggle-properties')"
          >
            属性{{ mindmapTools.propertiesActive ? '开' : '关' }}
          </button>
        </div>
        <div class="toolbar-divider"></div>
      </template>

      <div class="toolbar-group toolbar-status-group">
        <span
          v-if="hasActiveTab || isDirty"
          class="toolbar-info toolbar-save-state"
          :class="{ 'is-saved': !isDirty }"
          data-testid="dirty-indicator"
          role="status"
          :aria-label="isDirty ? copy.dirtyTip : copy.savedTip"
          :title="isDirty ? copy.dirtyTip : copy.savedTip"
        >
          <span class="dirty-indicator" aria-hidden="true">●</span>
          <span class="toolbar-save-state-label">{{ isDirty ? copy.dirtyShort : copy.savedShort }}</span>
        </span>
        <button
          class="toolbar-btn"
          data-testid="btn-settings"
          :aria-label="copy.settings"
          @click="emit('toggle-settings')"
          :title="copy.settings"
        >
          <TauIcon name="icon-settings" size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { getToolbarI18n } from '@/i18n/ui';
import TauIcon from '@/components/icons/TauIcon.vue';

/**
 * 思维导图工具组状态（UX-3C：工具栏从 MindmapStage 外移到全局 Toolbar）。
 *
 * Toolbar 保持「哑」展示：只按传入状态渲染禁用/高亮，点击一律 emit 给 App，
 * 由 App 通过 MindmapStage 的 ref 调用真实命令——改文档的只有 Stage。
 */
interface MindmapToolbarState {
  /** 思维导图历史栈是否可撤销 / 可重做（与编辑器撤销是两套）。 */
  canUndo: boolean;
  canRedo: boolean;
  /** 当前选中节点；null 时编辑类按钮禁用。 */
  selectedTopicId: string | null;
  /** 当前结构布局模式。 */
  layoutMode: 'mindmap' | 'logic' | 'tree' | 'org';
  /** 当前主题模板 id 与候选列表（原生 select 渲染）。 */
  themeId: string;
  themeOptions: Array<{ id: string; name: string }>;
  /** 右侧面板两个 tab 的激活态（用于 aria-pressed）。 */
  outlineActive?: boolean;
  propertiesActive?: boolean;
}

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  hasActiveTab?: boolean;
  isMarkdown?: boolean;
  /** 当前标签是思维导图：在 center 区渲染导图专属按钮组。 */
  isMindmap?: boolean;
  /** 导图工具组状态；isMindmap 为真时必须提供。 */
  mindmapTools?: MindmapToolbarState | null;
  isDocumentPreview?: boolean;
  isFullDocumentPreview?: boolean;
  markdownPreviewMode?: 'edit' | 'split' | 'preview';
  sidebarVisible?: boolean;
  contextRailVisible?: boolean;
  canRevealCurrentFile?: boolean;
  locatingCurrentFile?: boolean;
  appLabel?: string;
}

type MarkdownAction = 'bold' | 'italic' | 'strike' | 'quote' | 'bullet-list' | 'ordered-list' | 'task-list' | 'code' | 'link' | 'timestamp' | 'table' | 'horizontal-rule' | 'details' | 'mermaid' | 'toc' | 'image';

type MarkdownIconNode = {
  tag: string;
  attrs: Record<string, string | number>;
};

const markdownIconNodes: Record<string, MarkdownIconNode[]> = {
  heading: [
    { tag: 'path', attrs: { d: 'M5 4v16M19 4v16M5 12h14' } },
  ],
  bold: [
    { tag: 'path', attrs: { d: 'M6 5h6.5a3.5 3.5 0 0 1 0 7H6V5Zm0 7h7.5a3.5 3.5 0 0 1 0 7H6v-7Z' } },
  ],
  italic: [
    { tag: 'path', attrs: { d: 'M14 5h5M5 19h5M15 5 9 19' } },
  ],
  strike: [
    { tag: 'path', attrs: { d: 'M18 7.5c-1.1-1.7-3-2.5-5.5-2.5-2.6 0-4.5 1.2-4.5 3 0 4.5 10 2.5 10 7 0 2-1.8 3.5-4.8 3.5-2.5 0-4.4-.8-5.7-2.5' } },
    { tag: 'path', attrs: { d: 'M4 12h16' } },
  ],
  quote: [
    { tag: 'path', attrs: { d: 'M9 18H4l3-6V6h5v6H9v6Zm8 0h-5l3-6V6h5v6h-3v6Z' } },
  ],
  'bullet-list': [
    { tag: 'circle', attrs: { cx: 5, cy: 6, r: 1.2, fill: 'currentColor', stroke: 'none' } },
    { tag: 'circle', attrs: { cx: 5, cy: 12, r: 1.2, fill: 'currentColor', stroke: 'none' } },
    { tag: 'circle', attrs: { cx: 5, cy: 18, r: 1.2, fill: 'currentColor', stroke: 'none' } },
    { tag: 'path', attrs: { d: 'M10 6h9M10 12h9M10 18h9' } },
  ],
  'ordered-list': [
    { tag: 'path', attrs: { d: 'M4 7h2M4 6v2M4 13h2M4 12v2l2-2M4 18h2M4 17v2h2' } },
    { tag: 'path', attrs: { d: 'M10 6h9M10 12h9M10 18h9' } },
  ],
  'task-list': [
    { tag: 'rect', attrs: { x: 4, y: 4, width: 6, height: 6, rx: 1 } },
    { tag: 'path', attrs: { d: 'm5.5 7 1.4 1.4L9 6.2M13 7h6M4 16h6M13 16h6' } },
  ],
  code: [
    { tag: 'path', attrs: { d: 'm8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18' } },
  ],
  link: [
    { tag: 'path', attrs: { d: 'm9.5 14.5 5-5' } },
    { tag: 'path', attrs: { d: 'm7 17-1.5 1.5a3.5 3.5 0 0 1-5-5L4 10a3.5 3.5 0 0 1 5-0.1M17 7l1.5-1.5a3.5 3.5 0 0 1 5 5L20 14a3.5 3.5 0 0 1-5 .1' } },
  ],
  image: [
    { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 16, rx: 2 } },
    { tag: 'circle', attrs: { cx: 8, cy: 9, r: 1.5 } },
    { tag: 'path', attrs: { d: 'm4 17 5-5 3 3 2-2 6 6' } },
  ],
  table: [
    { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 16, rx: 1 } },
    { tag: 'path', attrs: { d: 'M3 10h18M3 15h18M9 4v16M15 4v16' } },
  ],
  'horizontal-rule': [
    { tag: 'path', attrs: { d: 'M4 12h16' } },
  ],
  details: [
    { tag: 'path', attrs: { d: 'm6 9 4 4 4-4' } },
    { tag: 'path', attrs: { d: 'M17 7h4M17 12h4M17 17h4' } },
  ],
  mermaid: [
    { tag: 'path', attrs: { d: 'M8 6h8M6 18h12M6 8v8M18 8v8M8 6l-2 2M16 6l2 2M8 18l-2-2M16 18l2-2' } },
    { tag: 'circle', attrs: { cx: 8, cy: 6, r: 2 } },
    { tag: 'circle', attrs: { cx: 16, cy: 6, r: 2 } },
    { tag: 'circle', attrs: { cx: 6, cy: 18, r: 2 } },
    { tag: 'circle', attrs: { cx: 18, cy: 18, r: 2 } },
  ],
  toc: [
    { tag: 'circle', attrs: { cx: 5, cy: 6, r: 1, fill: 'currentColor', stroke: 'none' } },
    { tag: 'circle', attrs: { cx: 5, cy: 12, r: 1, fill: 'currentColor', stroke: 'none' } },
    { tag: 'circle', attrs: { cx: 5, cy: 18, r: 1, fill: 'currentColor', stroke: 'none' } },
    { tag: 'path', attrs: { d: 'M9 6h10M9 12h10M9 18h10' } },
  ],
  timestamp: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 8.5 } },
    { tag: 'path', attrs: { d: 'M12 7v5l3 2' } },
  ],
};

const tauMarkdownIconNames: Record<string, string> = {
  bold: 'icon-bold',
  italic: 'icon-italic',
  code: 'icon-code',
  'bullet-list': 'icon-list',
  'ordered-list': 'icon-list',
  'task-list': 'icon-list',
  toc: 'icon-list',
  'horizontal-rule': 'icon-minus',
};

const MarkdownActionIcon = defineComponent({
  name: 'MarkdownActionIcon',
  props: {
    name: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const tauIconName = tauMarkdownIconNames[props.name];
      if (tauIconName) {
        return h(TauIcon, { name: tauIconName, size: 18, class: 'markdown-action-icon' });
      }
      return h(
        'svg',
        {
          class: 'markdown-action-icon',
          width: 18,
          height: 18,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.8,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': 'true',
        },
        (markdownIconNodes[props.name] ?? markdownIconNodes.heading ?? []).map((node, index) =>
          h(node.tag, { ...node.attrs, key: `${props.name}-${index}` }),
        ),
      );
    };
  },
});

const props = withDefaults(defineProps<ToolbarProps>(), {
  isMarkdown: false,
  isMindmap: false,
  isDocumentPreview: false,
  isFullDocumentPreview: false,
  hasActiveTab: false,
  markdownPreviewMode: 'split',
  sidebarVisible: true,
  contextRailVisible: true,
});

const settingsStore = useSettingsStore();
const copy = computed(() => getToolbarI18n(settingsStore.uiLanguage));
const headingLevels = [1, 2, 3, 4, 5, 6];
const markdownHeadingRef = ref<HTMLElement | null>(null);
const markdownHeadingPanelRef = ref<HTMLElement | null>(null);
const markdownHeadingOpen = ref(false);
const markdownHeadingPanelStyle = ref<Record<string, string>>({});
const markdownCodeRef = ref<HTMLElement | HTMLElement[] | null>(null);
const markdownCodePanelRef = ref<HTMLElement | null>(null);
const markdownCodeOpen = ref(false);
const markdownCodePanelStyle = ref<Record<string, string>>({});
const customCodeLanguage = ref('');
const codeLanguages = ['plaintext', 'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c', 'cpp', 'csharp', 'json', 'html', 'css', 'sql', 'bash', 'yaml', 'xml'];
const markdownActions: Array<{ value: MarkdownAction; label: string; glyph: string }> = [
  { value: 'bold', label: '粗体', glyph: 'B' },
  { value: 'italic', label: '斜体', glyph: 'I' },
  { value: 'strike', label: '删除线', glyph: 'S' },
  { value: 'quote', label: '引用', glyph: '❝' },
  { value: 'bullet-list', label: '无序列表', glyph: '•' },
  { value: 'ordered-list', label: '有序列表', glyph: '1.' },
  { value: 'task-list', label: '任务列表', glyph: '☑' },
  { value: 'code', label: '代码', glyph: '</>' },
  { value: 'link', label: '链接', glyph: '↗' },
  { value: 'image', label: '图片', glyph: '▧' },
  { value: 'table', label: '表格', glyph: '▦' },
  { value: 'horizontal-rule', label: '分割线', glyph: '—' },
  { value: 'details', label: '折叠块', glyph: '◇' },
  { value: 'mermaid', label: 'Mermaid 图', glyph: 'M' },
  { value: 'toc', label: '目录', glyph: 'TOC' },
  { value: 'timestamp', label: '时间戳', glyph: 'T' },
];
const previewModeLabel = computed(() => copy.value.previewModeLabels[props.markdownPreviewMode]);

const emit = defineEmits<{
  'new-file': [];
  'open-file': [];
  'open-folder': [];
  'save': [];
  'save-as': [];
  'undo': [];
  'redo': [];
  'toggle-file-tree': [];
  'locate-current-file': [];
  'toggle-context-rail': [];
  'toggle-settings': [];
  'cycle-markdown-preview': [];
  'markdown-action': [action: MarkdownAction];
  'markdown-heading': [level: number];
  'markdown-code': [language: string];
  'markdown-image': [];
  // 思维导图工具组（UX-3C）：统一由 App 转发到 MindmapStage 暴露的方法
  'mm-add-child': [];
  'mm-add-sibling': [];
  'mm-rename': [];
  'mm-duplicate': [];
  'mm-delete': [];
  'mm-move-up': [];
  'mm-move-down': [];
  'mm-undo': [];
  'mm-redo': [];
  'mm-fit': [];
  'mm-zoom-in': [];
  'mm-zoom-out': [];
  'mm-reset-view': [];
  'mm-layout': [mode: MindmapToolbarState['layoutMode']];
  'mm-theme': [themeId: string];
  'mm-reset': [];
  'mm-import': [];
  'mm-export': [];
  'mm-print': [];
  'mm-toggle-outline': [];
  'mm-toggle-properties': [];
}>();

/** 导图结构布局候选（与 MindmapStage 内的布局定义保持一致）。 */
const mindmapLayoutOptions: Array<{
  id: MindmapToolbarState['layoutMode'];
  label: string;
  title: string;
}> = [
  { id: 'mindmap', label: '导图', title: '中心双侧导图（mindmap）' },
  { id: 'logic', label: '逻辑图', title: '单侧向右的逻辑图（logic）' },
  { id: 'tree', label: '树形', title: '右侧树形，正交连线（tree）' },
  { id: 'org', label: '组织图', title: '自上而下的组织图（org）' },
];

/** 主题下拉：保持原生 select（E2E-MM-013 依赖 selectOption）。 */
const onMindmapThemeChange = (event: Event) => {
  const nextThemeId = (event.target as HTMLSelectElement | null)?.value ?? '';
  if (nextThemeId) emit('mm-theme', nextThemeId);
};

const handleDocumentPointerDown = (event: MouseEvent) => {
  const target = event.target as Node | null;
  const codeMenuElement = Array.isArray(markdownCodeRef.value) ? markdownCodeRef.value[0] : markdownCodeRef.value;
  if (
    markdownHeadingOpen.value
    && (!target || (!markdownHeadingRef.value?.contains(target) && !markdownHeadingPanelRef.value?.contains(target)))
  ) {
    markdownHeadingOpen.value = false;
  }
  if (
    markdownCodeOpen.value
    && (!target || (!codeMenuElement?.contains(target) && !markdownCodePanelRef.value?.contains(target)))
  ) {
    markdownCodeOpen.value = false;
  }
};

const toggleMarkdownHeading = async () => {
  markdownHeadingOpen.value = !markdownHeadingOpen.value;
  if (!markdownHeadingOpen.value) {
    return;
  }
  await nextTick();
  const trigger = markdownHeadingRef.value?.querySelector<HTMLElement>('.markdown-heading-trigger');
  if (!trigger) {
    return;
  }
  const rect = trigger.getBoundingClientRect();
  markdownHeadingPanelStyle.value = {
    position: 'fixed',
    top: `${Math.round(rect.bottom + 7)}px`,
    left: `${Math.round(rect.left)}px`,
  };
};

const toggleMarkdownCode = async () => {
  markdownCodeOpen.value = !markdownCodeOpen.value;
  if (!markdownCodeOpen.value) return;
  await nextTick();
  const codeMenuElement = Array.isArray(markdownCodeRef.value) ? markdownCodeRef.value[0] : markdownCodeRef.value;
  const trigger = codeMenuElement?.querySelector<HTMLElement>('.markdown-toolbar-btn');
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  markdownCodePanelStyle.value = {
    position: 'fixed',
    top: `${Math.round(rect.bottom + 7)}px`,
    left: `${Math.round(rect.left)}px`,
  };
};

const selectMarkdownCode = (language: string) => {
  const value = language.trim();
  if (!value) return;
  markdownCodeOpen.value = false;
  customCodeLanguage.value = value === '__inline__' ? '' : value;
  emit('markdown-code', value);
};

const selectMarkdownHeading = (level: number) => {
  markdownHeadingOpen.value = false;
  emit('markdown-heading', level);
};

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown);
});
</script>

<style scoped>
.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  height: var(--toolbar-height, 52px);
  padding: 0 10px;
  background: var(--panel-elevated, #151d2d);
  border-bottom: 1px solid var(--border-strong, rgba(148, 163, 184, 0.3));
  user-select: none;
  transition: background-color .22s ease, color .22s ease, border-color .22s ease, box-shadow .22s ease;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-zone {
  display: flex;
  align-items: center;
  min-height: 100%;
  min-width: 0;
}

.toolbar-zone-center {
  gap: 8px;
  justify-content: center;
  justify-self: center;
}

.toolbar-zone-start,
.toolbar-zone-end {
  width: 100%;
}

/* 右侧 zone：导图工具组在右侧靠拢，dirty 指示 / 设置固定在末尾 */
.toolbar-zone-end {
  gap: 8px;
  justify-content: flex-end;
}

.toolbar-group-main .toolbar-btn {
  border-radius: var(--radius-sm);
}

.toolbar-group-history,
.toolbar-group-views,
.toolbar-group-markdown {
  gap: 4px;
}

.toolbar-group-markdown { max-width: min(42vw, 470px); overflow-x: auto; scrollbar-width: none; }
.toolbar-group-markdown::-webkit-scrollbar { display: none; }

/* ------------------------- 思维导图工具组（UX-3C） -------------------------
 * 位于 toolbar-zone-end（右侧），Tau 原始工具留在 center/左侧。
 * 视觉与 MindmapStage 内的 mm-btn 完全一致（同一套主题变量），
 * 因此 E2E-MM-020 的对比度断言在外移后仍然成立。
 */
.toolbar-group-mindmap {
  gap: 6px;
  /* 可收缩 + 横向滚动兜底：窄窗口时不挤压 Tau 原始按钮与右侧状态区 */
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(52vw, 720px);
  overflow-x: auto;
  scrollbar-width: none;
  padding: 0 2px;
}
.toolbar-group-mindmap::-webkit-scrollbar { display: none; }
.mm-btn {
  padding: 5px 10px;
  border-radius: var(--radius-control, 6px);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.3));
  background: var(--panel-elevated, #151d2d);
  color: var(--text-primary, #e2e8f0);
  font-size: 12px;
  font-family: var(--font-ui, inherit);
  cursor: pointer;
  flex: 0 0 auto;
  white-space: nowrap;
}
.mm-btn:hover:not(:disabled) { background: var(--surface-hover, rgba(148, 163, 184, 0.16)); }
.mm-btn:disabled { opacity: 0.45; cursor: default; }
.mm-btn.danger {
  border-color: var(--state-danger, #e06c75);
  color: var(--state-danger, #e06c75);
}
.mm-btn.danger:hover:not(:disabled) { background: var(--surface-hover, rgba(148, 163, 184, 0.16)); }
.mm-btn.is-active {
  border-color: var(--accent-brand, #4a90e2);
  background: var(--surface-active, rgba(74, 144, 226, 0.18));
  color: var(--accent-brand-strong, #7fb3f0);
  font-weight: 600;
}
.mm-divider { width: 1px; height: 18px; background: var(--border-soft, rgba(148, 163, 184, 0.3)); flex: 0 0 auto; }
.mm-layout-group { display: flex; gap: 4px; flex: 0 0 auto; }
.mm-theme-field { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.mm-theme-label { font-size: 11px; color: var(--text-secondary, #94a3b8); }
.mm-theme-select {
  padding: 4px 6px;
  font-size: 12px;
  font-family: var(--font-ui, inherit);
  border-radius: var(--radius-control, 6px);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.3));
  background: var(--panel-elevated, #151d2d);
  color: var(--text-primary, #e2e8f0);
  cursor: pointer;
}
.markdown-toolbar-btn { width: 30px; height: 30px; flex: 0 0 auto; }
.markdown-heading-menu { position: relative; flex: 0 0 auto; }
.markdown-heading-trigger { width: 42px; gap: 2px; }
.markdown-heading-caret { flex: 0 0 auto; fill: none; stroke: var(--text-muted, #94a3b8); stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
.markdown-heading-panel {
  position: absolute;
  top: calc(100% + 7px);
  left: 0;
  z-index: 60;
  min-width: 142px;
  padding: 6px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, .24));
  border-radius: var(--radius-sm, 6px);
  background: var(--surface-raised, #1b2436);
  box-shadow: 0 16px 34px rgba(0, 0, 0, .32);
  animation: markdown-heading-in .14s ease-out;
}
.markdown-heading-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 30px;
  padding: 5px 8px;
  border: 0;
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.markdown-heading-option:hover { background: var(--surface-hover, rgba(255,255,255,.08)); color: var(--text-primary, #f8fafc); }
.markdown-heading-mark { min-width: 42px; color: var(--accent-blue-strong, #4dabff); font: 700 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
@keyframes markdown-heading-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.markdown-code-panel {
  position: fixed;
  z-index: 61;
  width: 248px;
  max-height: min(520px, calc(100vh - 24px));
  overflow: auto;
  padding: 7px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, .24));
  border-radius: var(--radius-sm, 6px);
  background: var(--surface-raised, #1b2436);
  box-shadow: 0 16px 34px rgba(0, 0, 0, .32);
  animation: markdown-heading-in .14s ease-out;
}
.markdown-code-panel-title {
  padding: 4px 8px 7px;
  color: var(--text-muted, #94a3b8);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .04em;
}
.markdown-code-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 30px;
  padding: 5px 8px;
  border: 0;
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.markdown-code-option:hover { background: var(--surface-hover, rgba(255,255,255,.08)); color: var(--text-primary, #f8fafc); }
.markdown-code-option code { color: var(--accent-cyan, #22d3ee); font-size: 10px; }
.markdown-code-custom {
  display: grid;
  gap: 5px;
  margin-top: 7px;
  padding: 8px;
  border-top: 1px solid var(--border-soft, rgba(148, 163, 184, .16));
  color: var(--text-muted, #94a3b8);
  font-size: 11px;
}
.markdown-code-custom input {
  width: 100%;
  height: 29px;
  padding: 0 8px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, .22));
  border-radius: var(--radius-xs, 4px);
  outline: none;
  background: var(--surface-muted, rgba(255, 255, 255, .04));
  color: var(--text-primary, #f8fafc);
  font: 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.markdown-code-custom input:focus { border-color: var(--accent-blue-strong, #4dabff); }
.markdown-action-icon { display: block; flex: 0 0 auto; color: var(--text-secondary, #cbd5e1); transition: color .15s ease, transform .15s ease; }
.markdown-toolbar-btn:hover .markdown-action-icon,
.markdown-heading-trigger:hover .markdown-action-icon { color: var(--text-primary, #f8fafc); transform: scale(1.08); }
.markdown-toolbar-btn:focus-visible .markdown-action-icon,
.markdown-heading-trigger:focus-visible .markdown-action-icon { color: var(--text-primary, #f8fafc); }
.markdown-action-glyph { display: inline-flex; min-width: 18px; align-items: center; justify-content: center; color: var(--text-secondary, #cbd5e1); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; font-weight: 700; line-height: 1; }
.markdown-action-heading { font-size: 15px; }
.markdown-action-bold { font-family: Georgia, serif; font-size: 16px; }
.markdown-action-italic { font-family: Georgia, serif; font-size: 16px; font-style: italic; }
.markdown-action-strike { text-decoration: line-through; }
.markdown-action-quote { font-size: 18px; }
.markdown-action-code { font-size: 10px; letter-spacing: -1px; }
.markdown-action-table { font-size: 16px; }
.markdown-action-horizontal-rule { font-size: 18px; }
.markdown-action-mermaid { color: var(--accent-cyan, #22d3ee); }
.markdown-action-toc { min-width: 26px; font-size: 9px; letter-spacing: -0.5px; }

.toolbar-status-group {
  flex: 0 0 auto;
  gap: 8px;
  justify-self: end;
}

.toolbar-identity {
  display: flex;
  align-items: center;
  min-width: 0;
  width: 100%;
}

.toolbar-app-icon {
  display: block;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  overflow: visible;
  transition: filter 180ms ease;
}

.toolbar-app-icon-arrows,
.toolbar-app-icon-cube-lines {
  fill: none;
  stroke: var(--toolbar-logo-stroke);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.8;
}

.toolbar-app-icon-top,
.toolbar-app-icon-right {
  fill: var(--toolbar-logo-face-light);
}

.toolbar-app-icon-left {
  fill: var(--toolbar-logo-face-dark);
}

.toolbar-app-icon-tau {
  fill: var(--toolbar-logo-glyph);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px;
  font-style: italic;
  font-weight: 700;
}

.toolbar-app-icon {
  --toolbar-logo-stroke: #64e9ff;
  --toolbar-logo-face-light: #24384b;
  --toolbar-logo-face-dark: #102034;
  --toolbar-logo-glyph: #f4fbff;
  filter: drop-shadow(0 0 3px rgba(59, 218, 255, 0.65));
}

.toolbar-app-icon .toolbar-app-icon-arrows,
.toolbar-app-icon .toolbar-app-icon-cube-lines {
  filter: url(#toolbar-app-icon-glow);
}

:global(:root.theme-light) .toolbar-app-icon {
  --toolbar-logo-stroke: #102c43;
  --toolbar-logo-face-light: #f8fbff;
  --toolbar-logo-face-dark: #0b2c49;
  --toolbar-logo-glyph: #ffffff;
  filter: none;
}

:global(:root.theme-light) .toolbar-app-icon .toolbar-app-icon-arrows,
:global(:root.theme-light) .toolbar-app-icon .toolbar-app-icon-cube-lines {
  filter: none;
}

.toolbar-divider {
  width: 1px;
  height: 28px;
  margin: 0 4px;
  background: var(--border-soft, rgba(148, 163, 184, 0.18));
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.toolbar-btn:hover:not(.disabled) {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--border-soft, rgba(148, 163, 184, 0.18));
  color: var(--text-primary, #f8fafc);
}

.toolbar-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-save-state {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent-amber, #ffd166);
  font-size: var(--font-size-ui-xs, 11px);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.toolbar-save-state-label {
  color: var(--text-secondary, #cbd5e1);
  font-size: inherit;
}

.dirty-indicator {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--accent-amber, #ffd166);
  color: transparent;
  font-size: 0;
  line-height: 0;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-amber, #ffd166) 16%, transparent);
}

.toolbar-save-state.is-saved .dirty-indicator {
  background: var(--accent-success, #4ade80);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-success, #4ade80) 16%, transparent);
}

.toolbar-btn:focus-visible,
.toolbar-system-trigger:focus-visible,
.toolbar-system-item:focus-visible {
  outline: 1px solid var(--accent-blue-strong, #4dabff);
  outline-offset: -2px;
}

@media (max-width: 960px) {
  .toolbar {
    grid-template-columns: minmax(0, 1fr) max-content max-content;
    gap: 6px;
  }

  .toolbar-zone-start {
    display: none;
  }

  .toolbar-divider {
    display: none;
  }
}
</style>
