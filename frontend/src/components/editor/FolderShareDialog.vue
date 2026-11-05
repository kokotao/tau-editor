<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="folder-share cd-nocturne"
      data-testid="folder-share-overlay"
      @click.self="requestClose()"
    >
      <section
        class="folder-share__card"
        data-testid="folder-share-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="panel.folderShareTitle"
      >
        <header class="folder-share__header">
          <h3 class="folder-share__title" :title="titleText">{{ titleText }}</h3>
          <button
            ref="closeButtonRef"
            type="button"
            class="folder-share__icon-button"
            data-testid="folder-share-close"
            :aria-label="panel.close"
            :title="panel.close"
            :disabled="busy"
            @click="requestClose()"
          >
            ×
          </button>
        </header>

        <p class="folder-share__hint">{{ panel.folderShareHint }}</p>

        <!-- 加载分享状态 -->
        <div v-if="loading" class="folder-share__state" data-testid="folder-share-loading">
          <span class="cd-spinner" aria-hidden="true" />
          <span>{{ copy.loading }}</span>
        </div>

        <template v-else-if="!shared">
          <!-- 未分享：创建表单（密码 / 有效期 / 含子分类） -->
          <label class="folder-share__field">
            <span class="folder-share__label">{{ panel.folderSharePasswordLabel }}</span>
            <input
              v-model="password"
              class="folder-share__input"
              data-testid="folder-share-password"
              type="password"
              autocomplete="new-password"
              :disabled="busy"
            />
          </label>

          <label class="folder-share__field">
            <span class="folder-share__label">{{ panel.folderShareExpiresLabel }}</span>
            <input
              v-model="expiresInDays"
              class="folder-share__input"
              data-testid="folder-share-expires"
              type="number"
              min="1"
              step="1"
              :disabled="busy"
            />
          </label>

          <label class="folder-share__check">
            <input
              v-model="includeSubCategories"
              data-testid="folder-share-include-sub"
              type="checkbox"
              :disabled="busy"
            />
            <span>{{ panel.folderShareIncludeSub }}</span>
          </label>
        </template>

        <template v-else>
          <!-- 已分享：链接 + 状态 + 重新生成/撤销 -->
          <div class="folder-share__field">
            <span class="folder-share__label">{{ panel.folderShareLinkLabel }}</span>
            <div class="folder-share__link-row">
              <input
                ref="linkInputRef"
                class="folder-share__input folder-share__input--link"
                data-testid="folder-share-link"
                type="text"
                readonly
                :value="shareUrl"
                @focus="selectLink()"
              />
              <button
                type="button"
                class="folder-share__button"
                data-testid="folder-share-copy"
                @click="copyLink()"
              >
                {{ panel.folderShareCopy }}
              </button>
            </div>
          </div>
          <p v-if="copied" class="folder-share__ok" data-testid="folder-share-copied">
            {{ panel.folderShareCopied }}
          </p>

          <ul class="folder-share__meta">
            <li data-testid="folder-share-docs">{{ panel.folderShareDocs(info?.docCount ?? 0) }}</li>
            <li data-testid="folder-share-password-state">
              {{ info?.hasPassword ? panel.folderShareHasPassword : panel.folderShareNoPassword }}
            </li>
            <li v-if="info?.includeSubCategories" data-testid="folder-share-include-sub-state">
              {{ panel.folderShareIncludeSub }}
            </li>
            <li v-if="info?.expiresAt" data-testid="folder-share-expires-at">{{ info.expiresAt }}</li>
          </ul>
        </template>

        <p v-if="revokedNotice" class="folder-share__ok" data-testid="folder-share-revoked">
          {{ revokedNotice }}
        </p>
        <p v-if="errorText" class="folder-share__error" data-testid="folder-share-error">{{ errorText }}</p>

        <div class="folder-share__actions">
          <button
            type="button"
            class="folder-share__button"
            data-testid="folder-share-close-button"
            :disabled="busy"
            @click="requestClose()"
          >
            {{ panel.close }}
          </button>
          <template v-if="!loading">
            <button
              v-if="shared"
              type="button"
              class="folder-share__button"
              data-testid="folder-share-regenerate"
              :disabled="busy"
              @click="regenerate()"
            >
              {{ panel.folderShareRegenerate }}
            </button>
            <button
              v-if="shared"
              type="button"
              class="folder-share__button folder-share__button--danger"
              data-testid="folder-share-revoke"
              :disabled="busy"
              @click="revoke()"
            >
              {{ panel.folderShareRevoke }}
            </button>
            <button
              v-else
              type="button"
              class="folder-share__button folder-share__button--primary"
              data-testid="folder-share-create"
              :disabled="busy || !categoryId"
              @click="create()"
            >
              {{ busy ? panel.folderShareCreating : panel.menuShareFolder }}
            </button>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @description 云端文件夹（分类）一键分享弹窗：打开即查分享状态 → 未分享给创建表单（密码 / 有效期 /
 * 含子分类）→ 已分享给链接、复制、密码状态、文档数、重新生成与撤销。
 *
 * 链接拼装与命令包装在 `cloudCategoryShareService`，本组件只负责状态机与展示；
 * 「重新生成」发空 payload（= 只换 token，不清掉已设置的密码/有效期），撤销后回到未分享态。
 *
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { getCloudDocBrowserI18n, getCloudDocPanelI18n } from '@/i18n/ui';
import {
  buildFolderShareUrl,
  createCategoryShare,
  emptyCategoryShareInfo,
  getCategoryShareStatus,
  resolveFolderShareBaseUrl,
  revokeCategoryShare,
} from '@/services/cloudCategoryShareService';
import { copyTextToClipboard, normalizeExpiresInDays } from '@/services/cloudShareService';
import { useCenterToastStore } from '@/stores/centerToast';
import { useSettingsStore } from '@/stores/settings';
import type { CloudCategoryShareInfo } from '@/lib/tauri';

const props = withDefaults(defineProps<{
  visible?: boolean;
  /** 目标分类 id（雪花 id 字符串；`custom:*` / 未分类没有真实分类 id，宿主应传空串） */
  categoryId?: string;
  /** 目标分类名（标题展示用） */
  categoryName?: string;
}>(), { visible: false, categoryId: '', categoryName: '' });

const emit = defineEmits<{
  close: [];
  /** 分享状态发生变化（创建/重新生成/撤销），宿主可据此做提示或埋点 */
  shared: [];
}>();

const settingsStore = useSettingsStore();
const centerToast = useCenterToastStore();
const panel = computed(() => getCloudDocPanelI18n(settingsStore.uiLanguage));
const copy = computed(() => getCloudDocBrowserI18n(settingsStore.uiLanguage));

const closeButtonRef = ref<HTMLButtonElement | null>(null);
const linkInputRef = ref<HTMLInputElement | null>(null);
const loading = ref(false);
const busy = ref(false);
const info = ref<CloudCategoryShareInfo | null>(null);
const baseUrl = ref('');
const errorText = ref('');
const copied = ref(false);
const revokedNotice = ref('');

/** 创建表单（仅未分享态可见）；有效期用 string | number：`<input type="number">` 的 v-model 会转成数字 */
const password = ref('');
const expiresInDays = ref<string | number>('');
const includeSubCategories = ref(true);

const titleText = computed(() => (
  props.categoryName
    ? `${panel.value.folderShareTitle} · ${props.categoryName}`
    : panel.value.folderShareTitle
));
const shared = computed(() => info.value?.shared === true);
const shareUrl = computed(() => buildFolderShareUrl(baseUrl.value, info.value));

/** 打开（或换分类）即重新拉一次状态：分享可能已在别的窗口被创建/撤销 */
async function bootstrap(): Promise<void> {
  info.value = null;
  errorText.value = '';
  copied.value = false;
  revokedNotice.value = '';
  password.value = '';
  expiresInDays.value = '';
  includeSubCategories.value = true;

  const id = (props.categoryId ?? '').trim();
  if (!id) {
    errorText.value = panel.value.folderShareFailed(panel.value.folderShareUnsupported);
    return;
  }

  loading.value = true;
  try {
    // 域名与状态并行拉取：域名失败不影响状态展示（链接会退化成相对短链）
    const [resolvedBase, status] = await Promise.all([
      resolveFolderShareBaseUrl().catch(() => ''),
      getCategoryShareStatus(id),
    ]);
    baseUrl.value = resolvedBase;
    if (!status.ok) {
      errorText.value = panel.value.folderShareFailed(status.message);
      return;
    }
    info.value = status.data;
    includeSubCategories.value = status.data.includeSubCategories;
  } catch (error) {
    errorText.value = panel.value.folderShareFailed(error instanceof Error ? error.message : String(error));
  } finally {
    loading.value = false;
  }
}

/** 有效期输入：空/非法/非正数都归一成 null（永久），其余夹取到服务端上限内。 */
function resolveExpiresInDays(): number | null {
  // `<input type="number">` 的 v-model 会把值转成 number，这里统一按字符串处理
  const raw = String(expiresInDays.value ?? '').trim();
  if (!raw) {
    return null;
  }
  return normalizeExpiresInDays(Number(raw));
}

async function create(): Promise<void> {
  const id = (props.categoryId ?? '').trim();
  if (!id || busy.value || loading.value) {
    return;
  }
  busy.value = true;
  errorText.value = '';
  revokedNotice.value = '';
  try {
    const outcome = await createCategoryShare(id, {
      password: password.value.trim() || null,
      expiresInDays: resolveExpiresInDays(),
      includeSubCategories: includeSubCategories.value,
    });
    if (!outcome.ok) {
      errorText.value = panel.value.folderShareFailed(outcome.message);
      return;
    }
    info.value = outcome.data;
    copied.value = false;
    password.value = '';
    centerToast.show(panel.value.folderShareDone, 'success', 3000);
    emit('shared');
  } catch (error) {
    errorText.value = panel.value.folderShareFailed(error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
  }
}

/** 重新生成：空 payload = 只换 token（后端未传的字段保持不变），旧链接立即失效。 */
async function regenerate(): Promise<void> {
  const id = (props.categoryId ?? '').trim();
  if (!id || busy.value) {
    return;
  }
  busy.value = true;
  errorText.value = '';
  revokedNotice.value = '';
  try {
    const outcome = await createCategoryShare(id, {});
    if (!outcome.ok) {
      errorText.value = panel.value.folderShareFailed(outcome.message);
      return;
    }
    info.value = outcome.data;
    copied.value = false;
    centerToast.show(panel.value.folderShareDone, 'success', 3000);
    emit('shared');
  } catch (error) {
    errorText.value = panel.value.folderShareFailed(error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
  }
}

async function revoke(): Promise<void> {
  const id = (props.categoryId ?? '').trim();
  if (!id || busy.value) {
    return;
  }
  busy.value = true;
  errorText.value = '';
  try {
    const outcome = await revokeCategoryShare(id);
    if (!outcome.ok) {
      errorText.value = panel.value.folderShareFailed(outcome.message);
      return;
    }
    info.value = emptyCategoryShareInfo();
    copied.value = false;
    revokedNotice.value = panel.value.folderShareRevoked;
    emit('shared');
  } catch (error) {
    errorText.value = panel.value.folderShareFailed(error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
  }
}

async function copyLink(): Promise<void> {
  const ok = await copyTextToClipboard(shareUrl.value);
  copied.value = ok;
  if (ok) {
    centerToast.show(panel.value.folderShareCopied, 'success', 2500);
  }
}

/** 聚焦链接输入框时全选：方便用户手动 Ctrl+C（剪贴板 API 被拒时的兜底路径）。 */
function selectLink(): void {
  void nextTick(() => linkInputRef.value?.select());
}

/** 关闭：上传/请求进行中不允许关，避免状态写到一半。 */
function requestClose(): void {
  if (busy.value) {
    return;
  }
  emit('close');
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.visible || event.key !== 'Escape' || busy.value) {
    return;
  }
  event.preventDefault();
  requestClose();
}

watch(
  () => [props.visible, props.categoryId] as const,
  ([visible]) => {
    if (visible) {
      // Esc 关闭：卡片 Teleport 到 body，焦点可能还在树行上，因此监听 window
      window.addEventListener('keydown', handleKeydown);
      void nextTick(() => closeButtonRef.value?.focus());
      void bootstrap();
      return;
    }
    window.removeEventListener('keydown', handleKeydown);
  },
  { immediate: true },
);

onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

defineExpose({ bootstrap, create, regenerate, revoke, copyLink });
</script>

<style scoped>
/* ---------- 遮罩：与云文档预览/上传弹窗同一套视觉 ---------- */
.folder-share {
  position: fixed;
  inset: 0;
  z-index: 14000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(5, 6, 10, 0.74);
  backdrop-filter: blur(6px);
}

.folder-share__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(480px, calc(100vw - 48px));
  max-height: min(620px, 84vh);
  min-height: 0;
  padding: 14px 16px;
  overflow: auto;
  font-family: var(--cd-font-ui, sans-serif);
  color: var(--cd-text, #f8fafc);
  background: var(--cd-bg-card, #1e2033);
  border: 1px solid var(--cd-border-strong, #323653);
  border-radius: var(--cd-r-dialog, 12px);
  box-shadow: var(--cd-shadow-dialog, 0 25px 60px -15px rgba(0, 0, 0, 0.75));
}

.folder-share__header {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
}

.folder-share__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: var(--cd-fs-body, 14px);
  font-weight: 600;
  white-space: nowrap;
  word-break: keep-all;
  text-overflow: ellipsis;
}

.folder-share__icon-button {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  color: var(--cd-text-2, #94a3b8);
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--cd-r-panel, 8px);
}

.folder-share__icon-button:hover:not(:disabled) {
  color: #fff;
  background: color-mix(in srgb, var(--cd-danger, #ef4444) 24%, transparent);
  border-color: color-mix(in srgb, var(--cd-danger, #ef4444) 40%, transparent);
}

.folder-share__icon-button:focus-visible {
  outline: 2px solid var(--cd-accent, #38bdf8);
  outline-offset: 2px;
}

.folder-share__icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.folder-share__hint {
  flex: 0 0 auto;
  margin: 0;
  font-size: var(--cd-fs-label, 11px);
  line-height: 1.5;
  color: var(--cd-text-3, #64748b);
}

.folder-share__state {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 0;
  font-size: var(--cd-fs-meta, 12px);
  color: var(--cd-text-2, #94a3b8);
}

.folder-share__field {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 4px;
}

.folder-share__label {
  font-size: var(--cd-fs-label, 11px);
  color: var(--cd-text-2, #94a3b8);
}

.folder-share__input {
  width: 100%;
  padding: 6px 10px;
  font-size: var(--cd-fs-meta, 12px);
  color: var(--cd-text, #f8fafc);
  background: var(--cd-bg-sunken, #0d0e16);
  border: 1px solid var(--cd-border-strong, #323653);
  border-radius: var(--cd-r-ctl, 6px);
}

.folder-share__input:focus {
  border-color: var(--cd-accent, #38bdf8);
  outline: none;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.16);
}

.folder-share__input--link {
  font-family: var(--cd-font-mono, monospace);
}

.folder-share__link-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.folder-share__check {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  align-items: center;
  font-size: var(--cd-fs-meta, 12px);
  color: var(--cd-text-2, #94a3b8);
}

.folder-share__meta {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.folder-share__meta li {
  padding: 1px 8px;
  font-size: var(--cd-fs-label, 11px);
  color: var(--cd-text-2, #94a3b8);
  background: var(--cd-bg-sunken, #0d0e16);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: 9999px;
}

.folder-share__ok {
  flex: 0 0 auto;
  margin: 0;
  font-size: var(--cd-fs-label, 11px);
  color: var(--cd-success, #10b981);
}

.folder-share__error {
  flex: 0 0 auto;
  margin: 0;
  font-size: var(--cd-fs-label, 11px);
  color: var(--cd-danger, #ef4444);
  word-break: break-word;
}

.folder-share__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}

.folder-share__button {
  padding: 3px 10px;
  font-family: var(--cd-font-ui, sans-serif);
  font-size: 11.5px;
  color: var(--cd-text, #f8fafc);
  cursor: pointer;
  background: var(--cd-bg-sunken, #0d0e16);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: var(--cd-r-ctl, 6px);
}

.folder-share__button:hover:not(:disabled) {
  color: var(--cd-accent, #38bdf8);
  border-color: var(--cd-accent, #38bdf8);
}

.folder-share__button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.folder-share__button--primary {
  color: var(--cd-accent, #38bdf8);
  border-color: var(--cd-accent, #38bdf8);
}

.folder-share__button--danger {
  color: var(--cd-danger, #ef4444);
}

.folder-share__button--danger:hover:not(:disabled) {
  color: #fff;
  background: color-mix(in srgb, var(--cd-danger, #ef4444) 22%, transparent);
  border-color: var(--cd-danger, #ef4444);
}
</style>
