<template>
  <div
    class="cloud-doc-tree cd-nocturne"
    :class="[`cloud-doc-tree--${layout}`, { 'cloud-doc-tree--compact': compact }]"
  >
    <p v-if="notice" class="cloud-doc-tree__notice" data-testid="cloud-browser-notice">{{ notice }}</p>

    <!-- table 模式（设计稿一）：12 栅格表头 5:2:1:3:1，复用共享视觉层 .cd-thead -->
    <div v-if="layout === 'table'" class="cd-thead" data-testid="cloud-browser-thead" role="row">
      <span role="columnheader">{{ panel.colName }}</span>
      <span role="columnheader" class="cd-col-right">{{ panel.colSize }}</span>
      <span role="columnheader" class="cd-col-center">{{ panel.colVersion }}</span>
      <span role="columnheader" class="cd-col-right">{{ panel.colUpdatedAt }}</span>
      <span role="columnheader" class="cd-col-right">{{ panel.colActions }}</span>
    </div>

    <div
      class="cloud-doc-tree__list cd-scroll"
      data-testid="cloud-browser-tree"
      :role="layout === 'tree' ? 'tree' : 'list'"
    >
      <div
        v-for="row in renderedRows"
        :key="row.node.key"
        class="cloud-doc-tree__row"
        :class="rowClassFor(row)"
        :style="rowStyleFor(row)"
        :data-testid="row.node.kind === 'dir' ? 'cloud-browser-dir' : 'cloud-browser-file'"
        :data-cloud-path="row.node.path"
        :role="layout === 'tree' ? 'treeitem' : 'listitem'"
        :aria-selected="isSelected(row.node) ? 'true' : 'false'"
        :aria-expanded="row.node.kind === 'dir' ? !collapsedKeys.has(row.node.key) : undefined"
        :aria-level="layout === 'tree' ? row.depth + 1 : undefined"
        tabindex="0"
        :draggable="row.node.kind === 'file'"
        @click="selectRow(row)"
        @dblclick="activateRow(row)"
        @keydown="handleRowKeydown(row, $event)"
        @contextmenu.prevent="openRowMenu(row, $event)"
        @dragstart="handleDragStart(row, $event)"
        @dragover="handleDragOver(row, $event)"
        @dragleave="handleDragLeave(row)"
        @drop="handleDrop(row, $event)"
      >
        <!-- ---------- tree 模式（设计稿三）：箭头 + 类型徽标 + 文件名 + 右对齐大小 ---------- -->
        <template v-if="layout === 'tree'">
          <button
            v-if="row.node.kind === 'dir'"
            type="button"
            class="cloud-doc-tree__toggle"
            data-testid="cloud-browser-toggle"
            :aria-expanded="!collapsedKeys.has(row.node.key)"
            @click.stop="toggleDir(row.node.key)"
          >
            <span class="cloud-doc-tree__chevron" :class="{ 'is-collapsed': collapsedKeys.has(row.node.key) }">▾</span>
          </button>
          <span v-else class="cloud-doc-tree__toggle cloud-doc-tree__toggle--leaf" aria-hidden="true" />

          <span v-if="row.node.kind === 'dir'" class="cloud-doc-tree__folder" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3.4c.4 0 .8.16 1.06.44L9.4 5.9H16.5A1.5 1.5 0 0 1 18 7.4v7.1a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 14.5z" />
            </svg>
          </span>
          <span v-else class="cd-badge cloud-doc-tree__type" :class="badgeClassFor(row.node.name)">{{ iconForFile(row.node.name) }}</span>

          <span class="cloud-doc-tree__name" :title="row.node.path">{{ row.node.name }}</span>

          <span v-if="row.node.kind === 'dir'" class="cloud-doc-tree__count" data-testid="cloud-browser-dir-count">{{ countFiles(row.node) }}</span>
          <template v-else>
            <!-- 设计稿三：文件行右侧恒有大小（10px 等宽）；版本号属次要信息，紧凑侧栏里省掉 -->
            <span class="cloud-doc-tree__size cd-mono">{{ formatSize(row.node.file?.size ?? 0) }}</span>
            <span v-if="!compact" class="cloud-doc-tree__ver cd-mono">{{ copy.version(row.node.file?.version ?? 0) }}</span>
            <button
              type="button"
              class="cloud-doc-tree__open"
              data-testid="cloud-browser-open"
              :disabled="busy"
              @click.stop="openDoc(row.node)"
            >
              {{ copy.open }}
            </button>
          </template>
        </template>

        <!-- ---------- table 模式（设计稿一）：.cd-row 五列 ---------- -->
        <template v-else>
          <span class="cd-row__name cloud-doc-tree__name-cell">
            <button
              v-if="row.node.kind === 'dir'"
              type="button"
              class="cloud-doc-tree__toggle"
              data-testid="cloud-browser-toggle"
              :aria-expanded="!collapsedKeys.has(row.node.key)"
              @click.stop="toggleDir(row.node.key)"
            >
              <span class="cloud-doc-tree__chevron" :class="{ 'is-collapsed': collapsedKeys.has(row.node.key) }">▾</span>
            </button>
            <span v-else class="cloud-doc-tree__toggle cloud-doc-tree__toggle--leaf" aria-hidden="true" />

            <span v-if="row.node.kind === 'dir'" class="cloud-doc-tree__folder" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3.4c.4 0 .8.16 1.06.44L9.4 5.9H16.5A1.5 1.5 0 0 1 18 7.4v7.1a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 14.5z" />
              </svg>
            </span>
            <span v-else class="cd-badge cloud-doc-tree__type" :class="badgeClassFor(row.node.name)">{{ iconForFile(row.node.name) }}</span>

            <span class="cloud-doc-tree__name" :title="row.node.path">{{ row.node.name }}</span>
          </span>

          <span class="cd-col-right cd-mono cloud-doc-tree__size">
            {{ row.node.kind === 'file' ? formatSize(row.node.file?.size ?? 0) : '—' }}
          </span>
          <span class="cd-col-center cd-mono cloud-doc-tree__ver">
            {{ row.node.kind === 'file' ? copy.version(row.node.file?.version ?? 0) : '—' }}
          </span>
          <span class="cd-col-right cd-mono cloud-doc-tree__time">
            {{ row.node.kind === 'file' ? (formatTime(row.node.file?.updatedAt ?? '') || '—') : '—' }}
          </span>
          <span class="cd-col-right cd-row__actions cloud-doc-tree__actions">
            <button
              v-if="row.node.kind === 'file'"
              type="button"
              class="cloud-doc-tree__load"
              data-testid="cloud-browser-open"
              :title="panel.loadInEditor"
              :aria-label="panel.loadInEditor"
              :disabled="busy"
              @click.stop="openDoc(row.node)"
            >
              <svg class="cloud-doc-tree__load-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M14.5 4.5H19.5V9.5" />
                <path d="M19.5 4.5 11.5 12.5" />
                <path d="M18.5 13.5v4.2a1.8 1.8 0 0 1-1.8 1.8H6.3a1.8 1.8 0 0 1-1.8-1.8V7.3a1.8 1.8 0 0 1 1.8-1.8h4.2" />
              </svg>
            </button>
          </span>
        </template>
      </div>
    </div>

    <div v-if="pendingTarget" class="cloud-doc-tree__confirm" data-testid="cloud-browser-confirm">
      <p class="cloud-doc-tree__confirm-title">{{ copy.confirmTitle }}</p>
      <p class="cloud-doc-tree__confirm-hint">{{ copy.confirmHint(pendingTarget.cloudPath) }}</p>
      <div class="cloud-doc-tree__confirm-actions">
        <button
          type="button"
          class="cloud-doc-tree__button"
          data-testid="cloud-browser-confirm-overwrite"
          :disabled="busy"
          @click="confirmOverwrite()"
        >
          {{ copy.overwrite }}
        </button>
        <button
          type="button"
          class="cloud-doc-tree__button"
          data-testid="cloud-browser-confirm-saveas"
          :disabled="busy"
          @click="confirmSaveAs()"
        >
          {{ copy.saveAs }}
        </button>
        <button
          type="button"
          class="cloud-doc-tree__button"
          data-testid="cloud-browser-confirm-cancel"
          :disabled="busy"
          @click="cancelOpen()"
        >
          {{ copy.cancel }}
        </button>
      </div>
    </div>

    <!-- 右键菜单：Teleport 到 body，避免被侧栏/面板 overflow 裁剪导致点击热区错位。
         视觉走共享层 .cd-menu（w224 / r8 / 主色实底反色 hover），浮层自带 cd-nocturne 以取到 --cd-* token。 -->
    <Teleport to="body">
      <div
        v-if="rowMenu.visible && rowMenu.node"
        ref="rowMenuRef"
        class="cloud-doc-tree__menu cd-menu cd-nocturne"
        :style="{ left: `${rowMenu.x}px`, top: `${rowMenu.y}px` }"
        :data-flip-x="rowMenu.flipX ? 'left' : 'right'"
        :data-flip-y="rowMenu.flipY ? 'up' : 'down'"
        data-testid="cloud-doc-tree-menu"
        role="menu"
        :aria-label="panel.menuHeader"
        @mousedown.stop
        @click.stop
        @keydown="handleMenuKeydown"
      >
        <!-- 菜单头：设计稿「云端文档快捷操作 + 类型徽标」 -->
        <div v-if="rowMenu.node.kind === 'file'" class="cd-menu__header cloud-doc-tree__menu-head">
          <span class="cloud-doc-tree__menu-head-title">{{ panel.menuHeader }}</span>
          <span class="cd-badge cloud-doc-tree__type" :class="badgeClassFor(rowMenu.node.name)">{{ iconForFile(rowMenu.node.name) }}</span>
        </div>

        <template v-if="rowMenu.node.kind === 'file'">
          <button type="button" class="cd-menu__item" data-testid="cloud-doc-menu-open" role="menuitem" @click.stop="menuOpenDoc()">
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M1.5 12S5.6 5.5 12 5.5 22.5 12 22.5 12 18.4 18.5 12 18.5 1.5 12 1.5 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>{{ panel.menuOpen }}</span>
          </button>
          <button
            type="button"
            class="cd-menu__item cloud-doc-tree__menu-item--sync"
            data-testid="cloud-doc-menu-sync"
            role="menuitem"
            @click.stop="menuDocAction('sync')"
          >
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M7 17.5a5 5 0 0 1 .8-9.94A6 6 0 0 1 19.5 9a4.25 4.25 0 0 1 .3 8.5H17" />
              <path d="M12 21.5v-8" />
              <path d="m9 16.5 3-3 3 3" />
            </svg>
            <span>{{ panel.menuSync }}</span>
          </button>
          <button
            type="button"
            class="cd-menu__item cloud-doc-tree__menu-item--share"
            data-testid="cloud-doc-menu-share"
            role="menuitem"
            @click.stop="menuDocAction('share')"
          >
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="18" cy="5" r="2.6" />
              <circle cx="6" cy="12" r="2.6" />
              <circle cx="18" cy="19" r="2.6" />
              <path d="m8.4 10.8 7.2-4.2M15.6 17.4 8.4 13.2" />
            </svg>
            <span>{{ panel.menuShare }}</span>
          </button>
          <button type="button" class="cd-menu__item" data-testid="cloud-doc-menu-properties" role="menuitem" @click.stop="menuOpenProperties()">
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5.5M12 7.6h.01" />
            </svg>
            <span>{{ panel.menuProperties }}</span>
          </button>
          <button type="button" class="cd-menu__item" data-testid="cloud-doc-menu-history" role="menuitem" @click.stop="menuOpenHistory()">
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5.2l3.2 2" />
            </svg>
            <span>{{ panel.menuHistory }}</span>
          </button>
          <button type="button" class="cd-menu__item" data-testid="cloud-doc-menu-move" role="menuitem" @click.stop="menuOpenMove()">
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M3 6.6A1.6 1.6 0 0 1 4.6 5h3.7l1.7 1.8h8.4A1.6 1.6 0 0 1 20 8.4v9A1.6 1.6 0 0 1 18.4 19H4.6A1.6 1.6 0 0 1 3 17.4z" />
              <path d="M9.8 13h6.4M13.6 10.4 16.2 13l-2.6 2.6" />
            </svg>
            <span>{{ panel.menuMoveTo }}</span>
          </button>
          <div class="cd-menu__divider" role="separator"></div>
          <button
            type="button"
            class="cd-menu__item cd-menu__item--danger"
            data-testid="cloud-doc-menu-delete"
            role="menuitem"
            @click.stop="menuDeleteDoc()"
          >
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M4 7h16M9.5 7V4.8h5V7M6.4 7l.9 12.2h9.4L17.6 7" />
              <path d="M10.5 10.6v6M13.5 10.6v6" />
            </svg>
            <span>{{ panel.menuDelete }}</span>
          </button>
        </template>
        <template v-else>
          <!-- R1：分类右键新建云端空文档（custom:* 聚合分组没有真实分类 id，禁用并给提示） -->
          <button
            type="button"
            class="cd-menu__item"
            data-testid="cloud-category-menu-new-file"
            role="menuitem"
            :disabled="!canCreateFile(rowMenu.node)"
            :title="canCreateFile(rowMenu.node) ? panel.newFileHint : panel.newFileUnsupported"
            @click.stop="menuCreateFile()"
          >
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M13.5 3.5H7.2A1.7 1.7 0 0 0 5.5 5.2v13.6a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7V8.5z" />
              <path d="M13.5 3.5v5h5" />
              <path d="M12 12.6v4.4M9.8 14.8h4.4" />
            </svg>
            <span>{{ panel.menuNewFile }}</span>
          </button>
          <!-- R2：分类右键批量上传本地文件（多选 → 逐条进度弹窗） -->
          <button
            type="button"
            class="cd-menu__item"
            data-testid="cloud-category-menu-upload"
            role="menuitem"
            @click.stop="menuUploadFiles()"
          >
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 16.5V4.5" />
              <path d="m7.8 8.7 4.2-4.2 4.2 4.2" />
              <path d="M4.5 15.5v3a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-3" />
            </svg>
            <span>{{ panel.menuUploadFiles }}</span>
          </button>
          <!-- 文件夹（分类）一键分享：只有真实分类 cat:<id> 能分享 -->
          <button
            type="button"
            class="cd-menu__item"
            data-testid="cloud-category-menu-share-folder"
            role="menuitem"
            :disabled="!canShareFolder(rowMenu.node)"
            :title="canShareFolder(rowMenu.node) ? panel.folderShareHint : panel.folderShareUnsupported"
            @click.stop="menuShareFolder()"
          >
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="18" cy="5" r="2.6" />
              <circle cx="6" cy="12" r="2.6" />
              <circle cx="18" cy="19" r="2.6" />
              <path d="m8.4 10.8 7.2-4.2M15.6 17.4 8.4 13.2" />
            </svg>
            <span>{{ panel.menuShareFolder }}</span>
          </button>
          <button
            type="button"
            class="cd-menu__item"
            data-testid="cloud-category-menu-new"
            role="menuitem"
            :disabled="!canAddChild(rowMenu.node)"
            :title="canAddChild(rowMenu.node) ? '' : panel.maxDepthReached"
            @click.stop="menuNewSubCategory()"
          >
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M3 6.6A1.6 1.6 0 0 1 4.6 5h3.7l1.7 1.8h8.4A1.6 1.6 0 0 1 20 8.4v9A1.6 1.6 0 0 1 18.4 19H4.6A1.6 1.6 0 0 1 3 17.4z" />
              <path d="M12 10.8v5M9.5 13.3h5" />
            </svg>
            <span>{{ panel.newSubCategory }}</span>
          </button>
          <button type="button" class="cd-menu__item" data-testid="cloud-category-menu-rename" role="menuitem" @click.stop="menuRenameCategory()">
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" />
              <path d="m14.5 7.5 3 3" />
            </svg>
            <span>{{ panel.renameCategory }}</span>
          </button>
          <div class="cd-menu__divider" role="separator"></div>
          <button
            type="button"
            class="cd-menu__item cd-menu__item--danger"
            data-testid="cloud-category-menu-delete"
            role="menuitem"
            :disabled="!categoryIdOf(rowMenu.node)"
            @click.stop="menuDeleteCategory()"
          >
            <svg class="cloud-doc-tree__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M4 7h16M9.5 7V4.8h5V7M6.4 7l.9 12.2h9.4L17.6 7" />
            </svg>
            <span>{{ panel.deleteCategory }}</span>
          </button>
        </template>
      </div>
    </Teleport>

    <!-- 移动到分类：与一层菜单同坐标，但一层菜单已先收起（见 menuOpenMove 注释），不会被盖住 -->
    <div
      v-if="moveMenuVisible && moveTarget"
      ref="moveMenuRef"
      class="cloud-doc-tree__menu cloud-doc-tree__menu--scroll cd-menu cd-nocturne"
      :style="{ left: `${rowMenu.x}px`, top: `${rowMenu.y}px` }"
      data-testid="cloud-doc-move-menu"
      role="menu"
      :aria-label="panel.menuMoveTo"
      @click.stop
      @mousedown.stop
      @keydown="handleMenuKeydown"
    >
      <div class="cd-menu__header cloud-doc-tree__menu-head">
        <span class="cloud-doc-tree__menu-head-title">{{ panel.menuMoveTo }}</span>
      </div>
      <button type="button" class="cd-menu__item" data-testid="cloud-doc-move-root" role="menuitem" @click="moveTo('')">{{ panel.moveRoot }}</button>
      <button
        v-for="option in categoryRows"
        :key="option.id"
        type="button"
        class="cd-menu__item"
        role="menuitem"
        :data-testid="`cloud-doc-move-${option.id}`"
        :style="{ paddingLeft: `${8 + (option.depth - 1) * 12}px` }"
        @click="moveTo(option.id)"
      >
        {{ option.name }}
      </button>
    </div>

    <Teleport to="body">
      <!-- 分类新建/重命名：内联卡片面板 -->
      <div
        v-if="prompt.visible"
        class="cloud-doc-tree__prompt cd-nocturne"
        data-testid="cloud-category-prompt"
        @keydown.esc.prevent="closePrompt()"
      >
        <p class="cloud-doc-tree__prompt-title" data-testid="cloud-category-prompt-title">{{ promptTitle }}</p>
        <p
          v-if="prompt.mode === 'create-file'"
          class="cloud-doc-tree__prompt-hint"
          data-testid="cloud-new-file-hint"
        >
          {{ panel.newFileHint }}
        </p>
        <input
          ref="promptInputRef"
          v-model="prompt.name"
          class="cloud-doc-tree__prompt-input"
          data-testid="cloud-category-name-input"
          type="text"
          :placeholder="promptPlaceholder"
          @keydown.enter.prevent="submitPrompt()"
        />
        <p v-if="prompt.error" class="cloud-doc-tree__prompt-error" data-testid="cloud-category-prompt-error">{{ prompt.error }}</p>
        <div class="cloud-doc-tree__prompt-actions">
          <button type="button" class="cloud-doc-tree__button" data-testid="cloud-category-prompt-cancel" @click="closePrompt()">{{ panel.cancel }}</button>
          <button type="button" class="cloud-doc-tree__button" data-testid="cloud-category-prompt-confirm" :disabled="prompt.busy" @click="submitPrompt()">{{ panel.confirm }}</button>
        </div>
      </div>

      <!-- 分类删除确认 -->
      <div v-if="categoryDeleteTarget" class="cloud-doc-tree__prompt cd-nocturne" data-testid="cloud-category-delete-confirm">
        <p class="cloud-doc-tree__prompt-title">{{ panel.deleteCategory }}</p>
        <p class="cloud-doc-tree__prompt-error">{{ panel.deleteCategoryConfirm }}</p>
        <div class="cloud-doc-tree__prompt-actions">
          <button type="button" class="cloud-doc-tree__button" data-testid="cloud-category-delete-cancel" @click="categoryDeleteTarget = null">{{ panel.cancel }}</button>
          <button type="button" class="cloud-doc-tree__button" data-testid="cloud-category-delete-confirm-btn" :disabled="busy" @click="confirmDeleteCategory()">{{ panel.confirm }}</button>
        </div>
      </div>

      <!-- 删除确认 -->
      <div v-if="deleteTarget" class="cloud-doc-tree__prompt cd-nocturne" data-testid="cloud-doc-delete-confirm">
        <p class="cloud-doc-tree__prompt-title">{{ panel.menuDelete }}</p>
        <p class="cloud-doc-tree__prompt-error">{{ panel.deleteConfirm }}</p>
        <div class="cloud-doc-tree__prompt-actions">
          <button type="button" class="cloud-doc-tree__button" data-testid="cloud-doc-delete-cancel" @click="deleteTarget = null">{{ panel.cancel }}</button>
          <button type="button" class="cloud-doc-tree__button" data-testid="cloud-doc-delete-confirm-btn" :disabled="busy" @click="confirmDeleteDoc()">{{ panel.confirm }}</button>
        </div>
      </div>
    </Teleport>

    <!-- 跨工作区/无法映射：遮罩 + 居中卡片（此前复用无遮罩的 .__prompt，与底部按钮条视觉重叠）。
         主按钮是「在编辑器中打开」：只读预览已被取代——落位到临时工作区、由宿主打开并绑定云文档，
         之后的编辑/保存/同步走既有自动保存流水线；树内不发 IPC。 -->
    <CloudDocPreviewDialog
      :visible="openChoice.visible"
      variant="choice"
      :title="panel.choiceTitle"
      :hint="panel.choiceHint"
      :close-label="panel.close"
      @close="cancelChoice()"
    >
      <button type="button" class="cloud-doc-tree__button" data-testid="cloud-doc-choice-cancel" @click="cancelChoice()">{{ panel.cancel }}</button>
      <button type="button" class="cloud-doc-tree__button" data-testid="cloud-doc-choice-save-as" @click="chooseSaveAs()">{{ panel.choiceSaveAs }}</button>
      <button type="button" class="cloud-doc-tree__button cloud-doc-tree__button--primary" data-testid="cloud-doc-choice-edit" @click="chooseEditInEditor()">{{ panel.editInEditor }}</button>
    </CloudDocPreviewDialog>

    <VersionHistoryDialog
      :visible="historyVisible"
      :file-id="historyTarget?.file?.fileId ?? null"
      :file-name="historyTarget?.name ?? ''"
      :current-version="historyTarget?.file?.version ?? null"
      @close="historyVisible = false"
      @restored="emit('changed')"
    />

    <DocPropertiesDialog
      :visible="propsVisible"
      :doc="propsTarget?.file ?? null"
      @close="propsVisible = false"
      @saved="emit('changed')"
    />

    <!-- R2 批量上传：计划与串行队列在本组件，弹窗只管画逐条状态与进度 -->
    <CloudDocUploadDialog
      :visible="uploadDialog.visible"
      :rows="uploadDialog.rows"
      :target-name="uploadDialog.targetName"
      :done="uploadDialog.done"
      :total="uploadDialog.total"
      :busy="uploadDialog.busy"
      :summary="uploadDialog.summary"
      :aborted="uploadDialog.aborted"
      :cancelled="uploadDialog.cancelled"
      @cancel="cancelUpload()"
      @close="closeUploadDialog()"
    />

    <!-- 文件夹（分类）一键分享：分类 id 取自右键节点，弹窗内部自己查状态 -->
    <FolderShareDialog
      :visible="folderShareVisible"
      :category-id="folderShareCategoryId"
      :category-name="folderShareTarget?.name ?? ''"
      @close="closeFolderShare()"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @description 云端文档树（面板、左侧资源管理器、云文档浏览弹窗共用）：
 * - `layout="tree"`（默认，设计稿三·资源管理器）：箭头 + 类型徽标 + 文件名 + 右对齐大小，目录可折叠、层级缩进带竖线、选中态左侧 4px 主色条；侧栏用 `compact` 进一步收窄。
 * - `layout="table"`（设计稿一·浏览弹窗中间列表）：`.cd-thead` 5:2:1:3:1 五列表格，行 `.cd-row`，行尾 hover 显现「在编辑器中载入」。
 * 两种模式共用同一套展开/打开/分类/右键菜单逻辑与事件，只是渲染不同。
 * 路径映射与可打开性判定在 Rust（cloud_doc_open_target），这里只编排。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 15:20
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { cloudCommands, fileCommands, type CloudCategoryNode, type CloudDocOpenTarget } from '@/lib/tauri';
import { formatCloudDocSize, type CloudDocTreeNode } from '@/services/cloudBrowserService';
import { deleteCloudDoc, getCloudDoc, normalizeCloudError } from '@/services/cloudDocService';
import { useCenterToastStore } from '@/stores/centerToast';
import {
  canAddChildCategory,
  createCategory,
  deleteCategory,
  fetchManagedCategories,
  flattenCategoryTree,
  moveDocumentToCategory,
  renameCategory,
  type FlatCategory,
} from '@/services/cloudCategoryService';
import { getCloudDocPanelI18n } from '@/i18n/ui';
import { isCategoryPath } from '@/lib/categoryPath';
import { ensureCategoryPath } from '@/services/cloudCategoryPathService';
import VersionHistoryDialog from './VersionHistoryDialog.vue';
import DocPropertiesDialog from './DocPropertiesDialog.vue';
import CloudDocPreviewDialog from './CloudDocPreviewDialog.vue';
import CloudDocUploadDialog from './CloudDocUploadDialog.vue';
import FolderShareDialog from './FolderShareDialog.vue';
import {
  createCloudDocFile,
  sanitizeNewDocName,
  type CloudDocCreateResult,
} from '@/services/cloudDocCreateService';
import {
  BATCH_UPLOAD_MAX_FILES,
  collectBatchUploadPlan,
  runBatchUpload,
  type BatchUploadRow,
  type BatchUploadSummary,
  type BatchUploadTarget,
  type UploadPlanItem,
} from '@/services/cloudDocBatchUploadService';
import { getCloudDocBrowserI18n } from '@/i18n/ui';
import { useSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/workspace';
import {
  cloudWorkspaceNameFromPath,
  normalizeCloudPath,
  resolveCloudDocLanding,
  type LandingContext,
} from '@/services/cloudDocLanding';

const props = withDefaults(defineProps<{
  nodes: CloudDocTreeNode[];
  /** 侧栏紧凑模式：收一档字号，并隐藏版本号等次要列（保留右对齐大小） */
  compact?: boolean;
  /**
   * 布局模式（与云文档浏览弹窗/资源管理器共用的接口契约）：
   * - `tree`：资源管理器 / 侧栏（设计稿三），行内徽标 + 文件名 + 右对齐大小，目录可折叠；
   * - `table`：云文档浏览弹窗中间列表（设计稿一），五列表格 + 行尾「在编辑器中载入」。
   */
  layout?: 'tree' | 'table';
  /** 受控选中行（节点 key），由宿主维护以便与侧栏/检查器联动 */
  selectedKey?: string;
}>(), { compact: false, layout: 'tree', selectedKey: '' });

const emit = defineEmits<{
  'open-file': [path: string];
  written: [];
  /** 云端数据发生变化（删除/移动/属性/历史恢复），宿主应刷新树 */
  changed: [];
  /** 文档级动作交给宿主处理（同步/分享） */
  'doc-action': [action: 'sync' | 'share', node: CloudDocTreeNode];
  /**
   * 「在编辑器中打开」云文档：落位到该云工作区的本地临时工作区、打开标签并绑定云端身份，
   * 之后的编辑/保存/同步由宿主（App.vue）接既有自动保存流水线，树内不发 IPC。
   */
  'edit-cloud-doc': [node: CloudDocTreeNode];
  /** 行被选中（两种模式都发），参数为节点 key（`cat:<id>` / 完整云端路径） */
  select: [key: string];
}>();

const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const copy = computed(() => getCloudDocBrowserI18n(settingsStore.uiLanguage));

const collapsedKeys = ref(new Set<string>());
const busy = ref(false);
const notice = ref('');
const pendingTarget = ref<CloudDocOpenTarget | null>(null);
const pendingNode = ref<CloudDocTreeNode | null>(null);

/** 当前选中行：本地即时反馈 + 宿主的 selectedKey 受控覆盖 */
const activeKey = ref(props.selectedKey);
watch(() => props.selectedKey, (key) => {
  activeKey.value = key ?? '';
});

interface VisibleRow {
  node: CloudDocTreeNode;
  depth: number;
}

/** 展开后可见行（tree/table 共用同一份展开逻辑与顺序） */
const visibleRows = computed<VisibleRow[]>(() => {
  const rows: VisibleRow[] = [];
  const walk = (nodes: CloudDocTreeNode[], depth: number) => {
    for (const node of nodes) {
      rows.push({ node, depth });
      if (node.kind === 'dir' && !collapsedKeys.value.has(node.key)) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(props.nodes, 0);
  return rows;
});

/**
 * 实际渲染的行：tree 模式保留目录行（资源管理器要能折叠）；
 * table 模式只列文件——设计稿一里目录归左侧导航，中间数据表是扁平文件列表。
 */
const renderedRows = computed<VisibleRow[]>(() => {
  if (props.layout !== 'table') {
    return visibleRows.value;
  }
  return visibleRows.value.filter((row) => row.node.kind === 'file');
});

function toggleDir(key: string): void {
  const next = new Set(collapsedKeys.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  collapsedKeys.value = next;
}

/** 行是否选中：key 为空串时视为未选中（避免空 key 误命中）。 */
function isSelected(node: CloudDocTreeNode): boolean {
  return activeKey.value !== '' && activeKey.value === node.key;
}

/** 行样式类：tree 用自身选中态（左 4px 主色条），table 复用共享 .cd-row--selected（左 2px 主色条）。 */
function rowClassFor(row: VisibleRow): Record<string, boolean> {
  const selected = isSelected(row.node);
  return {
    'cd-row': props.layout === 'table',
    'cd-row--selected': props.layout === 'table' && selected,
    [`cloud-doc-tree__row--${row.node.kind}`]: true,
    'cloud-doc-tree__row--selected': selected,
    'is-drop-target': dropTargetKey.value === row.node.key,
  };
}

/**
 * 行缩进：设计稿三 `ml12 + pl8`（每层 12px，起点 8px），竖线由 ::before 按深度画 N 条；
 * table 模式起点跟随 .cd-row 的 16px 内边距。
 */
function rowStyleFor(row: VisibleRow): Record<string, string> {
  const base = props.layout === 'table' ? 16 : 8;
  return {
    paddingLeft: `${row.depth * 12 + base}px`,
    '--cd-depth': String(row.depth),
  };
}

/** 点行：选中；tree 模式下点目录行顺带展开/收起（资源管理器习惯）。 */
function selectRow(row: VisibleRow): void {
  if (props.layout === 'tree' && row.node.kind === 'dir') {
    toggleDir(row.node.key);
  }
  activeKey.value = row.node.key;
  emit('select', row.node.key);
}

/** 双击 / Enter：目录折叠切换（table 模式双击才算，tree 单击已切换），文件走打开流程。 */
function activateRow(row: VisibleRow): void {
  if (row.node.kind === 'dir') {
    if (props.layout === 'table') {
      toggleDir(row.node.key);
    }
    return;
  }
  void openDoc(row.node);
}

/** 行键盘：Enter 打开、空格选中/折叠、左右键展开收起（方向键为可选增强）。 */
function handleRowKeydown(row: VisibleRow, event: KeyboardEvent): void {
  // 行内按钮（展开箭头/打开）自己处理按键，避免双触发
  if (event.target !== event.currentTarget) {
    return;
  }
  const dir = row.node.kind === 'dir';
  const collapsed = collapsedKeys.value.has(row.node.key);
  switch (event.key) {
    case 'Enter':
      event.preventDefault();
      activateRow(row);
      break;
    case ' ':
      event.preventDefault();
      if (dir) {
        toggleDir(row.node.key);
      }
      selectRow(row);
      break;
    case 'ArrowRight':
      if (dir && collapsed) {
        event.preventDefault();
        toggleDir(row.node.key);
      }
      break;
    case 'ArrowLeft':
      if (dir && !collapsed) {
        event.preventDefault();
        toggleDir(row.node.key);
      }
      break;
    case 'Escape':
      // 焦点还在行上时也要能收起右键菜单
      if (handleRowKeydownEscape()) {
        event.preventDefault();
      }
      break;
    default:
      break;
  }
}

function formatSize(bytes: number): string {
  return formatCloudDocSize(bytes);
}

function formatTime(value: string | null): string {
  if (!value) {
    return '';
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Date(timestamp).toLocaleString(settingsStore.uiLanguage);
}

async function openDoc(node: CloudDocTreeNode): Promise<void> {
  const file = node.file;
  if (!file || busy.value) {
    return;
  }

  busy.value = true;
  notice.value = '';
  try {
    const workspaceRoot = await ensureWorkspaceForCloudPath(node.path);
    if (!workspaceRoot) {
      return;
    }
    const target = await cloudCommands.openTarget({
      workspaceRoot,
      workspaceName: workspaceStore.currentWorkspaceName ?? '',
      cloudPath: node.path,
      remoteHash: file.contentHash ?? null,
    });

    if (target.action === 'rejected') {
      // 不在当前工作区 / 路径无法映射：不再直接报错，改为「在编辑器中打开 / 另存为 / 取消」
      if (target.reasonCode === 'CLOUD_PATH_NOT_IN_WORKSPACE') {
        openChoice.value = { visible: true, node };
        return;
      }
      notice.value = target.reason || copy.value.openFailed(target.reasonCode ?? 'unsupported');
      return;
    }
    if (target.action === 'openExisting') {
      emit('open-file', target.absolutePath);
      return;
    }
    if (target.action === 'confirmOverwrite') {
      pendingTarget.value = target;
      pendingNode.value = node;
      return;
    }
    await downloadAndOpen(node, target.absolutePath);
  } catch (openError) {
    notice.value = copy.value.openFailed(normalizeCloudError(openError).message);
  } finally {
    busy.value = false;
  }
}

/**
 * 打开云端文档前的落位：没有工作区时不打断用户，按解析链静默打开原工作区或建临时工作区。
 *
 * 已经有工作区时保持原行为（同名原地、不同名走「在编辑器中打开 / 另存为」），不劫持上下文。
 *
 * @returns 可用于落盘的绝对目录；无法解析时返回 null 并给出提示
 */
async function ensureWorkspaceForCloudPath(cloudPath: string): Promise<string | null> {
  const current = workspaceStore.currentWorkspacePath;
  if (current) {
    return current;
  }

  const context = await buildLandingContext(cloudPath);
  const landing = context ? resolveCloudDocLanding(cloudPath, context) : null;
  if (!landing) {
    notice.value = copy.value.workspaceRequired;
    return null;
  }

  if (landing.kind === 'scratch') {
    const scratchRoot = await cloudCommands.scratchWorkspace(landing.workspaceName);
    workspaceStore.openWorkspace(scratchRoot, 'scratch');
    workspaceStore.rememberCloudWorkspace(landing.workspaceName, scratchRoot, 'scratch');
    notice.value = landing.staleBinding
      ? copy.value.landingStaleBinding(landing.stalePath ?? '')
      : copy.value.landingScratch;
    return scratchRoot;
  }

  const workspacePath = landing.workspacePath as string;
  const origin = landing.source === 'current' ? 'user' : 'silent';
  workspaceStore.openWorkspace(workspacePath, origin);
  workspaceStore.rememberCloudWorkspace(landing.workspaceName, workspacePath, origin);
  notice.value = copy.value.landingSilentOpen(landing.workspaceName);
  return workspacePath;
}

/** 收集落位上下文：绑定与同名最近项目，一次性探测哪些目录还在 */
async function buildLandingContext(cloudPath: string): Promise<LandingContext | null> {
  const workspaceName = cloudWorkspaceNameFromPath(cloudPath);
  if (!workspaceName) {
    return null;
  }
  const bindings = workspaceStore.cloudWorkspaceBindings;
  const binding = bindings[workspaceName];
  const candidates = [
    binding?.path,
    ...workspaceStore.recentProjects.filter((project) => project.name === workspaceName).map((project) => project.path),
  ].filter((path): path is string => Boolean(path));

  const existingPaths = new Set<string>();
  if (candidates.length > 0) {
    const flags = await cloudCommands.dirExists(candidates);
    candidates.forEach((path, index) => {
      if (flags[index]) {
        existingPaths.add(normalizeCloudPath(path));
      }
    });
  }

  return {
    currentWorkspacePath: workspaceStore.currentWorkspacePath,
    currentWorkspaceName: workspaceStore.currentWorkspaceName,
    bindings,
    recentProjects: workspaceStore.recentProjects,
    existingPaths,
  };
}

async function downloadAndOpen(node: CloudDocTreeNode, absolutePath: string): Promise<void> {
  const fileId = node.file?.fileId;
  if (typeof fileId !== 'number') {
    notice.value = copy.value.openFailed(copy.value.noContent);
    return;
  }
  const detail = await cloudCommands.get(fileId);
  if (detail.content === null || detail.content === undefined) {
    notice.value = copy.value.noContent;
    return;
  }
  await fileCommands.writeFile(absolutePath, detail.content);
  // 文件是新写到磁盘上的：通知上层刷新工作区文件树，别让用户手动刷新才看得到
  emit('written');
  emit('open-file', absolutePath);
}

async function confirmOverwrite(): Promise<void> {
  const target = pendingTarget.value;
  const node = pendingNode.value;
  if (!target || !node || busy.value) {
    return;
  }
  busy.value = true;
  try {
    await downloadAndOpen(node, target.absolutePath);
    pendingTarget.value = null;
    pendingNode.value = null;
  } catch (openError) {
    notice.value = copy.value.openFailed(normalizeCloudError(openError).message);
  } finally {
    busy.value = false;
  }
}

async function confirmSaveAs(): Promise<void> {
  const target = pendingTarget.value;
  const node = pendingNode.value;
  if (!target || !node || busy.value) {
    return;
  }
  busy.value = true;
  try {
    const chosen = await saveFileDialog({ defaultPath: target.absolutePath });
    if (!chosen) {
      return;
    }
    const path = Array.isArray(chosen) ? chosen[0] : chosen;
    if (!path) {
      return;
    }
    await downloadAndOpen(node, path);
    pendingTarget.value = null;
    pendingNode.value = null;
    notice.value = copy.value.saveAsDone(path);
  } catch (openError) {
    notice.value = copy.value.openFailed(normalizeCloudError(openError).message);
  } finally {
    busy.value = false;
  }
}

function cancelOpen(): void {
  pendingTarget.value = null;
  pendingNode.value = null;
  notice.value = copy.value.cancelled;
}

// ------------------------------------------------------------------
// 右键菜单 / 拖拽移动 / 分类管理
// ------------------------------------------------------------------
const panel = computed(() => getCloudDocPanelI18n(settingsStore.uiLanguage));

const rowMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  node: CloudDocTreeNode | null;
  flipX: boolean;
  flipY: boolean;
}>({
  visible: false,
  x: 0,
  y: 0,
  node: null,
  flipX: false,
  flipY: false,
});
const moveMenuVisible = ref(false);
/** 两个菜单浮层的根元素（Esc/上下键/初始焦点都限定在各自容器内） */
const rowMenuRef = ref<HTMLElement | null>(null);
const moveMenuRef = ref<HTMLElement | null>(null);
const moveTarget = ref<CloudDocTreeNode | null>(null);
const deleteTarget = ref<CloudDocTreeNode | null>(null);
const categoryDeleteTarget = ref<CloudDocTreeNode | null>(null);
const centerToast = useCenterToastStore();
/** 跨工作区/路径无法映射时的选择弹层：主按钮改为「在编辑器中打开」 */
const openChoice = ref<{ visible: boolean; node: CloudDocTreeNode | null }>({ visible: false, node: null });
const historyVisible = ref(false);
const historyTarget = ref<CloudDocTreeNode | null>(null);
const propsVisible = ref(false);
const propsTarget = ref<CloudDocTreeNode | null>(null);
const dropTargetKey = ref('');
const dragSource = ref<CloudDocTreeNode | null>(null);
const categoryRows = ref<FlatCategory[]>([]);
const categoryTree = ref<CloudCategoryNode[]>([]);
const promptInputRef = ref<HTMLInputElement | null>(null);

/** 内联卡片状态：分类新建/重命名（原有）+ 云端新建文件（R1，mode=create-file） */
interface PromptState {
  visible: boolean;
  mode: 'create' | 'rename' | 'create-file';
  name: string;
  parentId: string | null;
  parentName: string;
  id: string | null;
  /** 聚合分组节点（key=custom:*，来自文档分类文本，没有真实分类 id） */
  customNode?: CloudDocTreeNode | null;
  /** mode=create-file：目标分类 id（`group:uncategorized` 为 null） */
  fileCategoryId?: string | null;
  /** mode=create-file：目标分类自由文本（未分类为空串，保存时归一成 null） */
  fileCategoryName?: string;
  busy: boolean;
  error: string;
}

const prompt = ref<PromptState>({ visible: false, mode: 'create', name: '', parentId: null, parentName: '', id: null, busy: false, error: '' });

/** R2 批量上传弹窗状态：队列在 startUpload 里串行推进，弹窗只读它 */
const uploadDialog = ref<{
  visible: boolean;
  rows: BatchUploadRow[];
  target: BatchUploadTarget | null;
  targetName: string;
  done: number;
  total: number;
  busy: boolean;
  summary: BatchUploadSummary | null;
  aborted: boolean;
  /** 用户点了「中止上传」：runBatchUpload 每项开始前检查 */
  cancelled: boolean;
}>({
  visible: false,
  rows: [],
  target: null,
  targetName: '',
  done: 0,
  total: 0,
  busy: false,
  summary: null,
  aborted: false,
  cancelled: false,
});

/** 文件夹（分类）一键分享弹窗：目标节点 + 可见性（分类 id 从 `cat:<id>` 里取） */
const folderShareVisible = ref(false);
const folderShareTarget = ref<CloudDocTreeNode | null>(null);
const folderShareCategoryId = computed(() => categoryIdOf(folderShareTarget.value) ?? '');

/** 内联卡片标题：分类新建/重命名沿用原逻辑，新建文件用 R1 的标题 + 目标分类名 */
const promptTitle = computed(() => {
  const current = prompt.value;
  if (current.mode === 'create-file') {
    return current.fileCategoryName
      ? `${panel.value.menuNewFile} · ${current.fileCategoryName}`
      : panel.value.menuNewFile;
  }
  if (current.mode === 'create') {
    return current.parentName
      ? `${panel.value.newSubCategory} · ${current.parentName}`
      : panel.value.newCategory;
  }
  return panel.value.renameCategory;
});

const promptPlaceholder = computed(() => (
  prompt.value.mode === 'create-file'
    ? panel.value.newFilePlaceholder
    : panel.value.categoryNamePlaceholder
));

/** 文件类型徽标（md / 代码 / 图片 / Office / 其他）。 */
function iconForFile(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (['md', 'markdown', 'mdx'].includes(ext)) return 'MD';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'vue', 'json', 'yaml', 'yml', 'toml', 'sh'].includes(ext)) return '</>';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'IMG';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'DOC';
  return '·';
}

/** 类型徽标配色：与 iconForFile 判定保持一致，复用共享层 .cd-badge--md/doc/code/img 修饰符。 */
function badgeClassFor(name: string): Record<string, boolean> {
  const icon = iconForFile(name);
  return {
    'cd-badge--md': icon === 'MD',
    'cd-badge--doc': icon === 'DOC',
    'cd-badge--img': icon === 'IMG',
    'cd-badge--code': icon === '</>',
  };
}

/** 目录下文件数量（含后代）。 */
function countFiles(node: CloudDocTreeNode): number {
  if (node.kind === 'file') {
    return 1;
  }
  return node.children.reduce((total, child) => total + countFiles(child), 0);
}

function categoryIdOf(node: CloudDocTreeNode | null): string | null {
  if (!node || node.kind !== 'dir') {
    return null;
  }
  return node.key.startsWith('cat:') ? node.key.slice(4) : null;
}

async function refreshCategoryTree(): Promise<void> {
  const outcome = await fetchManagedCategories();
  categoryTree.value = outcome.ok ? outcome.data : [];
  categoryRows.value = flattenCategoryTree(categoryTree.value);
}

function canAddChild(node: CloudDocTreeNode | null): boolean {
  return canAddChildCategory(categoryTree.value, categoryIdOf(node));
}

/**
 * 是否能在该目录节点下新建云端文件（D3）：
 * `cat:<id>`（真实分类）与 `group:uncategorized` 可以；`custom:<名称>` 聚合分组
 * 来自文档的分类自由文本、没有分类主键，无法写入 categoryId，因此禁用并给提示。
 */
function canCreateFile(node: CloudDocTreeNode | null): boolean {
  if (!node || node.kind !== 'dir') {
    return false;
  }
  return !node.key.startsWith('custom:');
}

/**
 * 是否可分享该目录节点（文件夹分享按分类主键走）：
 * 只有 `cat:<id>`（真实分类）能分享；`custom:<名称>`（无分类主键）与
 * `group:uncategorized`（未分类不是分类）都禁用并给提示。
 */
function canShareFolder(node: CloudDocTreeNode | null): boolean {
  return (categoryIdOf(node) ?? '').trim().length > 0;
}

function closeMenus(): void {
  rowMenu.value.visible = false;
  moveMenuVisible.value = false;
}

// 设计稿三菜单宽度 224px；项高 30px + 头部 26px + 上下内边距 12px + 分隔线 9px
const MENU_WIDTH = 224;
const MENU_ITEM_HEIGHT = 30;
const MENU_CHROME_HEIGHT = 47;

function openRowMenu(row: { node: CloudDocTreeNode }, event: MouseEvent): void {
  const viewportWidth = window.innerWidth || 1024;
  const viewportHeight = window.innerHeight || 768;
  // 文件菜单 7 项；目录菜单 6 项（新建文件 / 上传文件… / 一键分享文件夹 / 新建子分类 / 重命名分类 / 删除分类）
  const itemCount = row.node.kind === 'file' ? 7 : 6;
  const menuHeight = itemCount * MENU_ITEM_HEIGHT + MENU_CHROME_HEIGHT;
  // 右侧/底部空间不足时翻转，保证浮层不出视口（点击热区跟随视觉位置）
  const flipX = event.clientX + MENU_WIDTH + 8 > viewportWidth;
  const flipY = event.clientY + menuHeight + 8 > viewportHeight;
  const x = flipX ? Math.max(8, event.clientX - MENU_WIDTH) : Math.max(8, event.clientX);
  const y = flipY ? Math.max(8, event.clientY - menuHeight) : Math.max(8, event.clientY);
  rowMenu.value = { visible: true, x, y, node: row.node, flipX, flipY };
  moveMenuVisible.value = false;
  if (row.node.kind === 'dir') {
    void refreshCategoryTree();
  }
  // 打开即把焦点交给第一项：键盘用户可直接上下选择、Esc 退出
  void nextTick(() => {
    rowMenuRef.value?.querySelector<HTMLElement>('.cd-menu__item:not(:disabled)')?.focus();
  });
}

/** 菜单内键盘：上下键切换焦点、Esc 收起（Enter/Space 交给原生按钮）。 */
function handleMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenus();
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    return;
  }
  const container = rowMenuRef.value ?? moveMenuRef.value;
  const items = Array.from(container?.querySelectorAll<HTMLElement>('.cd-menu__item:not(:disabled)') ?? []);
  if (items.length === 0) {
    return;
  }
  event.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLElement);
  const step = event.key === 'ArrowDown' ? 1 : -1;
  const next = (current + step + items.length) % items.length;
  items[next]?.focus();
}

function menuOpenDoc(): void {
  const node = rowMenu.value.node;
  closeMenus();
  if (node) {
    void openDoc(node);
  }
}

function menuDocAction(action: 'sync' | 'share'): void {
  const node = rowMenu.value.node;
  closeMenus();
  if (node?.kind === 'file') {
    emit('doc-action', action, node);
  }
}

function menuOpenProperties(): void {
  propsTarget.value = rowMenu.value.node;
  propsVisible.value = true;
  closeMenus();
}

function menuOpenHistory(): void {
  historyTarget.value = rowMenu.value.node;
  historyVisible.value = true;
  closeMenus();
}

async function menuOpenMove(): Promise<void> {
  // 只保留坐标、先收起右键菜单：两层浮层同坐标叠着时，Teleport 到 body 的右键菜单
  // 会盖住「移动到分类」列表（点击热区也归它），表现为点了没反应。
  const node = rowMenu.value.node;
  rowMenu.value.visible = false;
  moveTarget.value = node;
  moveMenuVisible.value = true;
  await refreshCategoryTree();
}

/** 移动文档到目标分类（null = 取消分类）；失败提示并保持原状（刷新即回滚）。 */
async function moveDocToCategory(node: CloudDocTreeNode, categoryId: string | null): Promise<void> {
  const fileId = node.file?.fileId;
  if (fileId === undefined) {
    return;
  }
  busy.value = true;
  try {
    const outcome = await moveDocumentToCategory(fileId, categoryId);
    if (!outcome.ok) {
      console.warn('[cloud-doc] 移动分类失败', { kind: outcome.kind, message: outcome.message });
      notice.value = panel.value.moveFailed(outcome.message);
      return;
    }
    notice.value = panel.value.moveDone;
    emit('changed');
  } catch (error) {
    console.warn('[cloud-doc] 移动分类异常', error);
    notice.value = panel.value.moveFailed(error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
  }
}

async function moveTo(categoryId: string): Promise<void> {
  const node = moveTarget.value ?? rowMenu.value.node;
  closeMenus();
  if (!node?.file) {
    return;
  }
  // 雪花 id 直接按字符串下发，避免 number 精度丢失
  await moveDocToCategory(node, categoryId || null);
}

function menuDeleteDoc(): void {
  deleteTarget.value = rowMenu.value.node;
  closeMenus();
}

async function confirmDeleteDoc(): Promise<void> {
  const node = deleteTarget.value;
  deleteTarget.value = null;
  const fileId = node?.file?.fileId;
  if (fileId === undefined) {
    return;
  }
  busy.value = true;
  try {
    const outcome = await deleteCloudDoc(fileId);
    if (!outcome.ok) {
      console.warn('[cloud-doc] 删除失败', { kind: outcome.kind, message: outcome.message });
      notice.value = panel.value.deleteFailed(outcome.message);
      return;
    }
    notice.value = panel.value.deleteDone;
    emit('changed');
  } catch (error) {
    console.warn('[cloud-doc] 删除异常', error);
    notice.value = panel.value.deleteFailed(error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
  }
}

function menuDeleteCategory(): void {
  categoryDeleteTarget.value = rowMenu.value.node;
  closeMenus();
}

async function confirmDeleteCategory(): Promise<void> {
  const node = categoryDeleteTarget.value;
  categoryDeleteTarget.value = null;
  const id = categoryIdOf(node);
  if (!id) {
    return;
  }
  busy.value = true;
  try {
    const outcome = await deleteCategory(id);
    if (!outcome.ok) {
      console.warn('[cloud-category] 删除分类失败', { kind: outcome.kind, message: outcome.message });
      notice.value = outcome.message;
      return;
    }
    await refreshCategoryTree();
    emit('changed');
    centerToast.show(panel.value.deleteCategoryDone, 'success', 3000);
  } catch (error) {
    console.warn('[cloud-category] 删除分类异常', error);
    notice.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

/** 可编辑打开只支持文本类（markdown/代码/纯文本）：另存为仍用它判断类型。 */
function isPreviewableText(name: string): boolean {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return [
    'md', 'markdown', 'mdx', 'txt', 'log', 'csv', 'json', 'yaml', 'yml', 'toml', 'ini', 'conf',
    'ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'sh',
    'ps1', 'bat', 'sql', 'html', 'css', 'scss', 'xml',
  ].includes(ext);
}

function cancelChoice(): void {
  openChoice.value = { visible: false, node: null };
}

/**
 * 在编辑器中打开（替代原「只读预览」）：关掉选择题，把节点交给宿主。
 *
 * 树内刻意不发 IPC：落位（cloudDocEditOpen.materializeCloudDocForEdit）、打开标签、
 * 绑定 cloudFileId/cloudVersion/cloudContentHash 全由 App.vue 完成，
 * 这样侧栏、浏览弹窗两个宿主可以各自接自己的打开逻辑，树保持纯编排。
 */
function chooseEditInEditor(): void {
  const node = openChoice.value.node;
  openChoice.value = { visible: false, node: null };
  if (!node?.file) {
    return;
  }
  emit('edit-cloud-doc', node);
}

/** 另存为：系统保存对话框选位置后写盘，写盘成功即交由宿主打开；取消则不写盘、不打开。 */
async function chooseSaveAs(): Promise<void> {
  const node = openChoice.value.node;
  openChoice.value = { visible: false, node: null };
  const fileId = node?.file?.fileId;
  if (!node || fileId === undefined) {
    return;
  }
  const outcome = await getCloudDoc(fileId);
  if (!outcome.ok) {
    notice.value = panel.value.saveAsFailed(outcome.message);
    return;
  }
  const content = outcome.data.content ?? '';
  if (!isPreviewableText(node.name) || !content) {
    notice.value = panel.value.saveAsFailed(panel.value.previewUnsupported);
    return;
  }
  const target = await saveFileDialog({ defaultPath: node.name });
  if (typeof target !== 'string' || !target) {
    return; // 取消：不写盘
  }
  try {
    await fileCommands.writeFile(target, content);
    centerToast.show(panel.value.saveAsDone(target), 'success', 3000);
    // 写盘成功就自动打开：宿主（App.vue）经 CloudDocBrowser 透传的 open-file 打开标签并收起弹窗，
    // 否则用户点「另存为…」后只看到一条 toast，还得自己去资源管理器找文件。
    emit('open-file', target);
  } catch (error) {
    notice.value = panel.value.saveAsFailed(error instanceof Error ? error.message : String(error));
  }
}

function openCreateCategory(): void {
  prompt.value = {
    visible: true,
    mode: 'create',
    name: '',
    parentId: null,
    parentName: '',
    id: null,
    busy: false,
    error: '',
  };
  focusPrompt();
  void refreshCategoryTree();
}

function menuNewSubCategory(): void {
  const parentId = categoryIdOf(rowMenu.value.node);
  if (!canAddChildCategory(categoryTree.value, parentId)) {
    notice.value = panel.value.maxDepthReached;
    closeMenus();
    return;
  }
  prompt.value = {
    visible: true,
    mode: 'create',
    name: '',
    parentId,
    parentName: rowMenu.value.node?.name ?? '',
    id: null,
    busy: false,
    error: '',
  };
  focusPrompt();
  closeMenus();
}

/**
 * R1：分类右键「新建文件」——复用内联卡片（mode=create-file）。
 * custom:* 聚合分组没有真实分类 id，只提示、不打开卡片（D3）。
 */
function menuCreateFile(): void {
  const node = rowMenu.value.node;
  closeMenus();
  if (!node || node.kind !== 'dir') {
    return;
  }
  if (!canCreateFile(node)) {
    notice.value = panel.value.newFileUnsupported;
    return;
  }
  prompt.value = {
    visible: true,
    mode: 'create-file',
    name: '',
    parentId: null,
    parentName: node.name,
    id: null,
    fileCategoryId: categoryIdOf(node),
    // 「未分类」组没有分类文本：留空，保存时归一成 null，避免云端造出假的「未分类」分组
    fileCategoryName: node.key === 'group:uncategorized' ? '' : node.name,
    busy: false,
    error: '',
  };
  focusPrompt();
}

/**
 * R2：分类右键「上传文件…」——系统多选 → 生成上传计划 → 弹窗里串行上传。
 *
 * 目标分类取自右键节点：`cat:<id>` 同时带 categoryId + category；
 * 「未分类」只把 categoryId/category 都置 null；`custom:<名称>` 只有 category 自由文本
 * （二进制通道本来也只有 category）。
 */
async function menuUploadFiles(): Promise<void> {
  const node = rowMenu.value.node;
  closeMenus();
  if (!node || node.kind !== 'dir') {
    return;
  }
  const target: BatchUploadTarget = {
    categoryId: categoryIdOf(node),
    categoryName: node.key === 'group:uncategorized' ? null : node.name,
    workspaceName: workspaceStore.currentWorkspaceName ?? '',
    workspacePath: workspaceStore.currentWorkspacePath ?? null,
  };

  let selected: string | string[] | null = null;
  try {
    selected = await openFileDialog({
      multiple: true,
      directory: false,
      // 不加扩展名过滤：不支持的类型会在弹窗里逐条给出跳过原因（D4），
      // 而不是让系统对话框把它们藏起来、用户以为没选上。
      title: panel.value.uploadDialogTitle,
    });
  } catch (error) {
    console.warn('[cloud-upload] 选择文件失败', error);
    notice.value = error instanceof Error ? error.message : String(error);
    return;
  }

  const paths = (Array.isArray(selected) ? selected : selected ? [selected] : [])
    .filter((path): path is string => typeof path === 'string' && path.trim().length > 0);
  if (paths.length === 0) {
    return;
  }
  if (paths.length > BATCH_UPLOAD_MAX_FILES) {
    centerToast.show(panel.value.uploadTooMany(BATCH_UPLOAD_MAX_FILES), 'info', 4500);
  }

  busy.value = true;
  let plan: UploadPlanItem[] = [];
  try {
    plan = await collectBatchUploadPlan(paths.slice(0, BATCH_UPLOAD_MAX_FILES));
  } catch (error) {
    console.warn('[cloud-upload] 生成上传计划失败', error);
    notice.value = error instanceof Error ? error.message : String(error);
    return;
  } finally {
    busy.value = false;
  }

  uploadDialog.value = {
    visible: true,
    rows: plan.map((item) => ({ ...item, status: item.kind === 'skipped' ? 'skipped' : 'pending' })),
    target,
    targetName: node.name,
    done: 0,
    total: plan.length,
    busy: false,
    summary: null,
    aborted: false,
    cancelled: false,
  };
  await startUpload();
}

/** 串行执行上传队列：逐条推进状态，结束后汇总 toast 并通知宿主刷新树。 */
async function startUpload(): Promise<void> {
  const state = uploadDialog.value;
  const target = state.target;
  if (!target || state.rows.length === 0) {
    return;
  }
  state.busy = true;
  state.summary = null;
  state.aborted = false;
  state.done = 0;
  try {
    const summary = await runBatchUpload(state.rows, target, {
      isCancelled: () => uploadDialog.value.cancelled,
      onItemStart: (index) => {
        const row = uploadDialog.value.rows[index];
        if (row) {
          row.status = 'uploading';
        }
      },
      onItem: (index, result) => {
        const row = uploadDialog.value.rows[index];
        if (row) {
          row.status = result.status;
          // conflict 表达「云端已有，默认不覆盖」，用专门文案而不是后端原话
          row.message = result.status === 'skipped' && result.kind === 'conflict'
            ? panel.value.uploadAlreadyExists
            : (result.message ?? '');
        }
        uploadDialog.value.done = index + 1;
      },
    });
    state.summary = summary;
    state.aborted = summary.aborted;
    if (summary.ok > 0) {
      emit('changed');
    }
    const text = panel.value.uploadSummary(summary.ok, summary.skipped, summary.failed);
    if (summary.aborted) {
      // 用户主动中止 ≠ 配额/登录失效：两者文案分开，避免把「我点了取消」说成「账号有问题」
      const abortLabel = state.cancelled ? panel.value.uploadCancelled : panel.value.uploadAborted;
      centerToast.show(`${abortLabel} · ${text}`, 'info', 5000);
    } else if (summary.failed > 0) {
      centerToast.show(text, 'info', 4500);
    } else {
      centerToast.show(text, 'success', 3500);
    }
  } catch (error) {
    console.warn('[cloud-upload] 批量上传异常', error);
    notice.value = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
  }
}

/** 中止上传：每项开始前生效，当前这一项仍会传完（避免留下半截请求）。 */
function cancelUpload(): void {
  if (!uploadDialog.value.busy) {
    return;
  }
  uploadDialog.value.cancelled = true;
}

/** 关闭弹窗：上传中不允许关（否则队列还在跑但没人看得到进度）。 */
function closeUploadDialog(): void {
  if (uploadDialog.value.busy) {
    return;
  }
  uploadDialog.value = {
    visible: false,
    rows: [],
    target: null,
    targetName: '',
    done: 0,
    total: 0,
    busy: false,
    summary: null,
    aborted: false,
    cancelled: false,
  };
}

/** 文件夹（分类）一键分享：只有 cat:<id> 能打开弹窗，其余给一句提示。 */
function menuShareFolder(): void {
  const node = rowMenu.value.node;
  closeMenus();
  if (!node || node.kind !== 'dir') {
    return;
  }
  if (!canShareFolder(node)) {
    notice.value = panel.value.folderShareUnsupported;
    return;
  }
  folderShareTarget.value = node;
  folderShareVisible.value = true;
}

/** 分享弹窗关闭：状态由弹窗自己维护，这里只收起并清掉目标节点。 */
function closeFolderShare(): void {
  folderShareVisible.value = false;
  folderShareTarget.value = null;
}

function menuRenameCategory(): void {
  const node = rowMenu.value.node;
  prompt.value = {
    visible: true,
    mode: 'rename',
    name: node?.name ?? '',
    parentId: null,
    parentName: '',
    id: categoryIdOf(node),
    customNode: node && node.key.startsWith('custom:') ? node : null,
    busy: false,
    error: '',
  };
  focusPrompt();
  closeMenus();
}

/** 打开面板后自动聚焦输入框（下一帧，等 v-if 渲染完）。 */
function focusPrompt(): void {
  void nextTick(() => {
    promptInputRef.value?.focus();
    promptInputRef.value?.select();
  });
}

function closePrompt(): void {
  prompt.value.visible = false;
  prompt.value.error = '';
}

/**
 * 聚合分组重命名：这类分组来自文档的自由文本分类（category），没有真实 category 行。
 * 做法：先建一个同名正式分类，再把组内文档逐个迁移过去；全部失败则回滚（删除刚建的分类）。
 * 返回 null 表示成功，否则返回给用户看的错误文案。
 */
async function renameCustomGroup(node: CloudDocTreeNode, name: string): Promise<string | null> {
  const created = await createCategory(name.trim(), null);
  if (!created.ok) {
    return created.message;
  }
  const newId = created.data?.id ? String(created.data.id) : '';
  if (!newId) {
    return panel.value.renameUnsupported;
  }
  const files: CloudDocTreeNode[] = [];
  const collect = (current: CloudDocTreeNode): void => {
    if (current.kind === 'file') {
      files.push(current);
      return;
    }
    current.children.forEach(collect);
  };
  collect(node);
  let failed = 0;
  for (const file of files) {
    const fileId = file.file?.fileId;
    if (fileId === undefined) {
      failed += 1;
      continue;
    }
    const outcome = await moveDocumentToCategory(fileId, newId);
    if (!outcome.ok) {
      console.warn('[cloud-category] 聚合分组迁移失败', { fileId, message: outcome.message });
      failed += 1;
    }
  }
  await refreshCategoryTree();
  emit('changed');
  if (failed > 0 && failed === files.length) {
    // 一篇都没迁成功：把刚建的分类删掉，避免留下空分类
    await deleteCategory(newId);
    await refreshCategoryTree();
    return panel.value.renamePartial(failed);
  }
  return failed > 0 ? panel.value.renamePartial(failed) : null;
}

/**
 * R1 新建文件提交：净化文件名 → 云端保存空正文 → 通知宿主刷新 + 交给宿主落位打开。
 * 刻意不写本地文件：`materializeCloudDocForEdit` 会按云端内容落位，否则会出现两份不同步的副本。
 */
async function submitCreateFile(current: PromptState): Promise<void> {
  const sanitized = sanitizeNewDocName(current.name);
  if (!sanitized.ok) {
    // 空名 / 含 `/ \ : * ? " < > |` / 含 `..` / 超长：前端直接拦住，不发请求
    current.error = panel.value.newFileInvalid;
    return;
  }
  current.busy = true;
  current.error = '';
  try {
    const categoryId = current.fileCategoryId ?? null;
    const categoryName = current.fileCategoryName ?? '';
    const outcome = await createCloudDocFile({
      fileName: sanitized.name,
      workspaceName: workspaceStore.currentWorkspaceName ?? '',
      categoryId,
      categoryName,
    });
    if (!outcome.ok) {
      console.warn('[cloud-doc] 新建文件失败', { kind: outcome.kind, message: outcome.message });
      current.error = outcome.kind === 'conflict'
        ? panel.value.newFileDuplicate
        : panel.value.newFileFailed(outcome.message);
      return;
    }
    prompt.value.visible = false;
    emit('changed');
    emit('edit-cloud-doc', buildCreatedFileNode(outcome.data, sanitized.name, categoryId, categoryName));
    centerToast.show(panel.value.newFileDone(sanitized.name), 'success', 3000);
  } catch (error) {
    console.warn('[cloud-doc] 新建文件异常', error);
    current.error = panel.value.newFileFailed(error instanceof Error ? error.message : String(error));
  } finally {
    current.busy = false;
  }
}

/**
 * 合成「刚创建成功的文件」树节点：宿主（App.vue#handleCloudDocEditOpen）按 fileId + path + name
 * 落位并打开；其余字段一并填上，避免树内即时展示拿到空值（随后 emit('changed') 会用服务端数据覆盖）。
 */
function buildCreatedFileNode(
  result: CloudDocCreateResult,
  fileName: string,
  categoryId: string | null,
  categoryName: string,
): CloudDocTreeNode {
  return {
    key: result.cloudPath,
    name: fileName,
    path: result.cloudPath,
    kind: 'file',
    children: [],
    file: {
      fileId: result.fileId,
      path: result.cloudPath,
      title: fileName,
      contentHash: result.contentHash,
      size: result.size,
      version: result.version,
      category: categoryName || null,
      categoryId,
      tags: null,
      visibility: null,
      publishedArticleId: null,
      updatedAt: result.updatedAt ?? new Date().toISOString(),
    },
  };
}

async function submitPrompt(): Promise<void> {
  const current = prompt.value;
  if (current.busy) {
    return;
  }
  if (current.mode === 'create-file') {
    await submitCreateFile(current);
    return;
  }
  if (!current.name.trim()) {
    current.error = panel.value.categoryNamePlaceholder;
    return;
  }
  current.busy = true;
  current.error = '';
  try {
    if (current.mode === 'rename' && !current.id) {
      // 没有真实分类 id：聚合分组（custom:*）走「建正式分类 + 迁移文档」，其它情况直接报错。
      // 修复前这里会静默降级成 createCategory，于是提示「已重命名分类」但树没变。
      if (current.customNode) {
        const message = await renameCustomGroup(current.customNode, current.name);
        if (message) {
          current.error = message;
          return;
        }
        prompt.value.visible = false;
        centerToast.show(panel.value.renameDone, 'success', 3000);
        return;
      }
      current.error = panel.value.renameUnsupported;
      return;
    }
    // 新建：支持「后端/Java/Spring」一次建多级（父级已存在则复用）
    if (current.mode === 'create' && isCategoryPath(current.name)) {
      const ensured = await ensureCategoryPath({ path: current.name });
      if (!ensured.ok) {
        console.warn('[cloud-category] 多级分类创建失败', { kind: ensured.kind, message: ensured.message });
        current.error = ensured.message;
        return;
      }
      prompt.value.visible = false;
      // 展开整条链，方便看到刚建好的层级
      ensured.data.chain.forEach((id) => collapsedKeys.value.delete(`cat:${id}`));
      await refreshCategoryTree();
      emit('changed');
      centerToast.show(
        ensured.data.created.length > 1
          ? `${panel.value.createDone}：${ensured.data.created.join(' / ')}`
          : panel.value.createDone,
        'success',
        3000,
      );
      return;
    }
    const outcome = current.mode === 'rename' && current.id
      ? await renameCategory(current.id, current.name)
      : await createCategory(current.name, current.parentId);
    if (!outcome.ok) {
      // 业务错误（HTTP 200 + body.code）已在 Rust 侧映射；这里展示后端 message 原文
      console.warn('[cloud-category] 保存分类失败', { kind: outcome.kind, message: outcome.message });
      current.error = outcome.message;
      return;
    }
    prompt.value.visible = false;
    // 展开到父分类，便于看到刚建好的子分类
    if (current.mode === 'create' && current.parentId) {
      collapsedKeys.value.delete(`cat:${current.parentId}`);
    }
    await refreshCategoryTree();
    emit('changed');
    centerToast.show(
      current.mode === 'create' ? panel.value.createDone : panel.value.renameDone,
      'success',
      3000,
    );
  } catch (error) {
    // 兜底：IPC/参数异常此前会被静默吞掉（表现为「点确定没反应」）
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[cloud-category] 保存分类异常', error);
    current.error = message;
  } finally {
    prompt.value.busy = false;
  }
}

// ---- 拖拽移动：文档拖到分类节点 ----
function handleDragStart(row: { node: CloudDocTreeNode }, event: DragEvent): void {
  if (row.node.kind !== 'file') {
    return;
  }
  dragSource.value = row.node;
  event.dataTransfer?.setData('text/plain', row.node.path);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function handleDragOver(row: { node: CloudDocTreeNode }, event: DragEvent): void {
  if (row.node.kind !== 'dir' || !dragSource.value) {
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dropTargetKey.value = row.node.key;
}

function handleDragLeave(row: { node: CloudDocTreeNode }): void {
  if (dropTargetKey.value === row.node.key) {
    dropTargetKey.value = '';
  }
}

async function handleDrop(row: { node: CloudDocTreeNode }, event: DragEvent): Promise<void> {
  event.preventDefault();
  const target = row.node;
  const source = dragSource.value;
  dragSource.value = null;
  dropTargetKey.value = '';
  if (!source?.file || target.kind !== 'dir') {
    return;
  }
  const categoryId = categoryIdOf(target);
  if (target.key.startsWith('group:') || target.key.startsWith('custom:')) {
    // 「未分类」组可以放回，其余聚合分组不允许直接移动
    if (target.key === 'group:uncategorized') {
      await moveDocToCategory(source, null);
      return;
    }
    notice.value = panel.value.moveToCustomUnsupported;
    return;
  }
  await moveDocToCategory(source, categoryId || null);
}

/** 外部点击关闭：菜单本身用 mousedown.stop 防误关，这里再按 closest 兜底（菜单已 Teleport 到 body）。 */
function handleDocumentClick(event?: MouseEvent): void {
  const target = event?.target;
  if (target instanceof Element && target.closest('.cloud-doc-tree__menu')) {
    return;
  }
  if (rowMenu.value.visible || moveMenuVisible.value) {
    closeMenus();
  }
}

/** 菜单 Esc 关闭：焦点在行或菜单项上都能收起浮层（打开菜单时焦点已交给第一项）。 */
function handleRowKeydownEscape(): boolean {
  if (!rowMenu.value.visible && !moveMenuVisible.value) {
    return false;
  }
  closeMenus();
  return true;
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick as EventListener);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentClick as EventListener);
});
/** 按键查节点（供宿主通过 key 直接打开，如浏览器弹窗右栏检查器的主按钮）。 */
function findNodeByKey(nodes: CloudDocTreeNode[], key: string): CloudDocTreeNode | null {
  for (const node of nodes) {
    if (node.key === key) {
      return node;
    }
    if (node.kind === 'dir') {
      const hit = findNodeByKey(node.children, key);
      if (hit) {
        return hit;
      }
    }
  }
  return null;
}

/** 宿主可直接调用：按节点/按 key 触发打开流程（与双击、右键「打开」完全同一条链路）。 */
async function openNode(node: CloudDocTreeNode): Promise<void> {
  if (node.kind === 'dir') {
    toggleDir(node.key);
    return;
  }
  await openDoc(node);
}

async function openByKey(key: string): Promise<void> {
  const node = findNodeByKey(props.nodes, key);
  if (node) {
    await openNode(node);
  }
}

/** 宿主可直接调用：按 key 选中一行（不触发打开）。 */
function selectByKey(key: string): void {
  activeKey.value = key ?? '';
  emit('select', activeKey.value);
}

defineExpose({ cancelOpen, openCreateCategory, openNode, openByKey, selectByKey });
</script>

<style scoped>
.cloud-doc-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  color: var(--cd-text, #f8fafc);
}

.cloud-doc-tree__notice {
  margin: 0;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--cd-text-2, #94a3b8);
  background: var(--cd-bg-card, rgba(255, 255, 255, 0.04));
  border-radius: var(--cd-r-ctl, 6px);
}

.cloud-doc-tree__list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.cloud-doc-tree--table .cloud-doc-tree__list {
  display: block;
}

/* ================= tree 模式（设计稿三） ================= */
.cloud-doc-tree--tree .cloud-doc-tree__row {
  position: relative;
  display: flex;
  gap: 6px;
  align-items: center;
  min-height: 26px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--cd-text-2, #94a3b8);
  cursor: pointer;
  /* 边框常驻（透明）以免选中时行高跳动 */
  border: 1px solid transparent;
  border-radius: var(--cd-r-ctl, 6px);
  user-select: none;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.cloud-doc-tree--tree .cloud-doc-tree__row:hover {
  color: var(--cd-text, #f8fafc);
  background: var(--cd-hover, rgba(255, 255, 255, 0.08));
}

.cloud-doc-tree--tree .cloud-doc-tree__row:focus-visible {
  outline: 1px solid var(--cd-accent, #38bdf8);
  outline-offset: -1px;
}

/* 层级竖线：每层 12px，按 --cd-depth 画 N 条 1px 竖线（设计稿 ml12 + pl8 + border-l 1px） */
.cloud-doc-tree--tree .cloud-doc-tree__row::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 8px;
  width: calc(var(--cd-depth, 0) * 12px);
  pointer-events: none;
  content: '';
  background-image: repeating-linear-gradient(
    to right,
    var(--cd-border-soft, rgba(50, 54, 83, 0.6)) 0 1px,
    transparent 1px 12px
  );
  opacity: 0.7;
}

/* 选中态：主色 10% 底 + 左 4px 主色条 + glow + 1px 主色 40% 边 */
.cloud-doc-tree--tree .cloud-doc-tree__row--selected {
  color: var(--cd-text, #f8fafc);
  background: var(--cd-active, rgba(56, 189, 248, 0.1));
  border-color: rgba(56, 189, 248, 0.4);
  box-shadow: inset 4px 0 0 var(--cd-accent, #38bdf8), 0 0 15px -3px rgba(56, 189, 248, 0.18);
}

.cloud-doc-tree--tree .cloud-doc-tree__row--selected:hover {
  background: var(--cd-active-strong, rgba(56, 189, 248, 0.16));
}

.cloud-doc-tree--tree .cloud-doc-tree__row.is-drop-target {
  background: var(--cd-active, rgba(56, 189, 248, 0.1));
  border-color: var(--cd-accent, #38bdf8);
}

/* ================= 行内公共元素 ================= */
.cloud-doc-tree__toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 14px;
  padding: 0;
  font-size: 10px;
  color: inherit;
  text-align: center;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.cloud-doc-tree__chevron {
  display: inline-block;
  line-height: 1;
  transition: transform 0.12s ease;
}

.cloud-doc-tree__chevron.is-collapsed {
  transform: rotate(-90deg);
}

.cloud-doc-tree__toggle--leaf {
  opacity: 0.45;
  cursor: default;
}

.cloud-doc-tree__folder {
  display: inline-flex;
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: var(--cd-warning, #f59e0b);
}

.cloud-doc-tree__folder svg {
  width: 14px;
  height: 14px;
}

.cloud-doc-tree__type {
  flex: 0 0 auto;
  justify-content: center;
  min-width: 22px;
  font-size: 9px;
  line-height: 12px;
}

.cloud-doc-tree__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-family: var(--cd-font-mono, monospace);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-doc-tree--tree .cloud-doc-tree__row--dir .cloud-doc-tree__name {
  font-family: var(--cd-font-ui, sans-serif);
  font-weight: 500;
  color: var(--cd-text, #f8fafc);
}

.cloud-doc-tree--tree .cloud-doc-tree__row--selected .cloud-doc-tree__name {
  color: var(--cd-text, #f8fafc);
}

.cloud-doc-tree__count {
  flex: 0 0 auto;
  padding: 0 6px;
  font-family: var(--cd-font-mono, monospace);
  font-size: 10px;
  line-height: 16px;
  color: var(--cd-text-3, #64748b);
  background: var(--cd-bg-sunken, #0d0e16);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: 9999px;
}

.cloud-doc-tree__size,
.cloud-doc-tree__ver,
.cloud-doc-tree__time {
  flex: 0 0 auto;
  font-size: 10.5px;
  color: var(--cd-text-3, #64748b);
  white-space: nowrap;
}

.cloud-doc-tree--tree .cloud-doc-tree__size {
  margin-left: auto;
}

/* 行尾「打开」：hover / 聚焦 / 选中才显现（设计稿行操作区默认低调） */
.cloud-doc-tree__open {
  flex: 0 0 auto;
  padding: 1px 8px;
  font-size: 11px;
  color: var(--cd-text-2, #94a3b8);
  white-space: nowrap;
  cursor: pointer;
  background: var(--cd-bg-card, #1e2033);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.cloud-doc-tree--tree .cloud-doc-tree__row:hover .cloud-doc-tree__open,
.cloud-doc-tree--tree .cloud-doc-tree__row:focus-within .cloud-doc-tree__open,
.cloud-doc-tree--tree .cloud-doc-tree__row--selected .cloud-doc-tree__open {
  opacity: 1;
}

.cloud-doc-tree__open:hover:not(:disabled) {
  color: var(--cd-accent, #38bdf8);
  border-color: var(--cd-accent, #38bdf8);
}

.cloud-doc-tree__open:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

/* ================= table 模式（设计稿一） ================= */
.cloud-doc-tree--table .cloud-doc-tree__row {
  user-select: none;
  outline: none;
}

.cloud-doc-tree--table .cloud-doc-tree__row:focus-visible {
  box-shadow: inset 0 0 0 1px var(--cd-accent, #38bdf8);
}

.cloud-doc-tree--table .cloud-doc-tree__row--dir .cloud-doc-tree__name {
  font-weight: 500;
  color: var(--cd-text, #f8fafc);
}

.cloud-doc-tree__name-cell {
  gap: 8px;
  min-width: 0;
}

.cloud-doc-tree__actions {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}

/* 行尾「在编辑器中载入」：设计稿一是 24×24 图标按钮（title/aria-label 兜底文案），
   默认隐藏，hover / 选中 / 键盘聚焦才显现 */
.cloud-doc-tree__load {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--cd-text-2, #94a3b8);
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--cd-r-ctl, 6px);
  opacity: 0;
  transition: opacity 0.12s ease, color 0.12s ease, background-color 0.12s ease;
}

.cloud-doc-tree__load-icon {
  width: 14px;
  height: 14px;
}

.cloud-doc-tree--table .cloud-doc-tree__row:hover .cloud-doc-tree__load,
.cloud-doc-tree--table .cloud-doc-tree__row:focus-within .cloud-doc-tree__load,
.cloud-doc-tree--table .cloud-doc-tree__row--selected .cloud-doc-tree__load {
  opacity: 1;
}

.cloud-doc-tree__load:hover:not(:disabled) {
  color: var(--cd-accent, #38bdf8);
  background: var(--cd-hover, rgba(255, 255, 255, 0.08));
}

.cloud-doc-tree__load:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

/* ================= 右键菜单浮层（共享 .cd-menu + 定位） ================= */
.cloud-doc-tree__menu {
  position: fixed;
  /* 防止文字逐字竖排：容器给足宽度并禁止换行，不受父级 writing-mode/word-break 影响 */
  width: max-content;
  white-space: nowrap;
  word-break: keep-all;
  writing-mode: horizontal-tb;
  animation: cloud-doc-menu-in 0.1s ease-out;
}

.cloud-doc-tree__menu--scroll {
  max-height: 320px;
  overflow: auto;
}

.cloud-doc-tree__menu-head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.cloud-doc-tree__menu-head-title {
  overflow: hidden;
  text-overflow: ellipsis;
}

.cloud-doc-tree__menu-icon {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
}

/* 设计稿：同步=绿、分享=琥珀（hover 时统一被 .cd-menu__item 的实底反色盖住） */
.cloud-doc-tree__menu-item--sync {
  color: var(--cd-success, #10b981);
}

.cloud-doc-tree__menu-item--share {
  color: var(--cd-warning, #f59e0b);
}

@keyframes cloud-doc-menu-in {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ================= 新建/重命名分类、删除确认：居中卡片 ================= */
.cloud-doc-tree__prompt {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 13500;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(360px, calc(100vw - 32px));
  padding: 14px;
  font-family: var(--cd-font-ui, sans-serif);
  color: var(--cd-text, #f8fafc);
  background: var(--cd-bg-card, #1e2033);
  border: 1px solid var(--cd-border-strong, #323653);
  border-radius: var(--cd-r-dialog, 12px);
  box-shadow: var(--cd-shadow-overlay, 0 12px 32px rgba(0, 0, 0, 0.5));
  transform: translate(-50%, -50%);
}

.cloud-doc-tree__prompt-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

/* 新建文件卡片：一句说明（新建后直接在编辑器打开） */
.cloud-doc-tree__prompt-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--cd-text-3, #64748b);
}

.cloud-doc-tree__prompt-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--cd-text, #f8fafc);
  background: var(--cd-bg-sunken, #0d0e16);
  border: 1px solid var(--cd-border-strong, #323653);
  border-radius: var(--cd-r-ctl, 6px);
}

.cloud-doc-tree__prompt-input:focus {
  border-color: var(--cd-accent, #38bdf8);
  outline: none;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.16);
}

.cloud-doc-tree__prompt-error {
  margin: 0;
  font-size: 11px;
  color: var(--cd-danger, #ef4444);
}

.cloud-doc-tree__prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.cloud-doc-tree__prompt-actions .cloud-doc-tree__button:last-child {
  color: var(--cd-accent, #38bdf8);
  border-color: var(--cd-accent, #38bdf8);
}

.cloud-doc-tree__confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--cd-bg-card, #1e2033);
  border: 1px solid var(--cd-warning, #f59e0b);
  border-radius: var(--cd-r-panel, 8px);
}

.cloud-doc-tree__confirm-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--cd-text, #f8fafc);
}

.cloud-doc-tree__confirm-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--cd-text-2, #94a3b8);
  word-break: break-all;
}

.cloud-doc-tree__confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cloud-doc-tree__button {
  padding: 3px 10px;
  font-family: var(--cd-font-ui, sans-serif);
  font-size: 11.5px;
  color: var(--cd-text, #f8fafc);
  cursor: pointer;
  background: var(--cd-bg-sunken, #0d0e16);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: var(--cd-r-ctl, 6px);
}

.cloud-doc-tree__button:hover:not(:disabled) {
  color: var(--cd-accent, #38bdf8);
  border-color: var(--cd-accent, #38bdf8);
}

/* 选择题主按钮（在编辑器中打开）：按钮作为插槽内容仍带本组件作用域，可直接在这里上强调色 */
.cloud-doc-tree__button--primary {
  color: var(--cd-accent, #38bdf8);
  border-color: var(--cd-accent, #38bdf8);
}

/* 侧栏紧凑模式：整体收一档字号 */
.cloud-doc-tree--compact {
  font-size: 11.5px;
}

.cloud-doc-tree--compact.cloud-doc-tree--tree .cloud-doc-tree__row {
  min-height: 24px;
  padding-block: 2px;
  font-size: 11.5px;
}

.cloud-doc-tree--compact .cloud-doc-tree__name {
  font-size: 11.5px;
}

@media (prefers-reduced-motion: reduce) {
  .cloud-doc-tree__menu {
    animation: none;
  }
}
</style>
