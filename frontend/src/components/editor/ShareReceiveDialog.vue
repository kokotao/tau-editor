<template>
  <Teleport to="body">
    <div v-if="visible" class="share-receive-backdrop" data-testid="share-receive-dialog" @click.self="requestClose">
      <section class="share-receive" role="dialog" aria-modal="true" aria-labelledby="share-receive-title" @keydown.esc.prevent="requestClose">
        <header class="share-receive__header">
          <div>
            <p class="share-receive__eyebrow">TAU SHARE</p>
            <h3 id="share-receive-title">接收分享</h3>
          </div>
          <button type="button" class="share-receive__close" data-testid="share-receive-close" aria-label="关闭" @click="requestClose">×</button>
        </header>

        <div class="share-receive__body">
          <p class="share-receive__intro">粘贴 Tau 分享链接，预览后添加到自己的云端。</p>
          <div class="share-receive__link-row">
            <input
              v-model="linkInput"
              class="share-receive__input"
              data-testid="share-receive-link"
              type="url"
              placeholder="https://note.lizipro.cn/s/..."
              :disabled="busy"
              @keydown.enter.prevent="loadLink"
            />
            <button type="button" class="share-receive__button" data-testid="share-receive-paste" :disabled="busy" @click="pasteClipboard">粘贴</button>
            <button type="button" class="share-receive__button share-receive__button--primary" data-testid="share-receive-load" :disabled="busy || !linkInput.trim()" @click="loadLink">预览</button>
          </div>

          <p v-if="loading" class="share-receive__hint" data-testid="share-receive-loading">正在读取分享内容…</p>
          <div v-if="error" class="share-receive__notice share-receive__notice--error" data-testid="share-receive-error" role="alert">
            {{ error }}
          </div>
          <div v-if="notice" class="share-receive__notice share-receive__notice--success" data-testid="share-receive-notice" role="status">
            {{ notice }}
          </div>

          <div v-if="info" class="share-receive__preview" data-testid="share-receive-preview">
            <header class="share-receive__preview-header">
              <div class="share-receive__title">
                <span class="share-receive__type">{{ fileKindLabel }}</span>
                <h4 :title="fileTitle">{{ fileTitle }}</h4>
              </div>
              <div class="share-receive__meta">
                <span v-if="info.authorName">来自 {{ info.authorName }}</span>
                <span v-if="info.updatedAt">{{ formatTime(info.updatedAt) }}</span>
                <span v-if="info.fileSize !== null">{{ formatSize(info.fileSize) }}</span>
              </div>
            </header>

            <form v-if="info.passwordRequired" class="share-receive__password" data-testid="share-receive-password-form" @submit.prevent="verifyPassword">
              <label for="share-receive-password">此分享需要访问密码</label>
              <div class="share-receive__link-row">
                <input
                  id="share-receive-password"
                  v-model="passwordInput"
                  class="share-receive__input"
                  data-testid="share-receive-password"
                  type="password"
                  autocomplete="off"
                  :disabled="busy"
                />
                <button type="submit" class="share-receive__button share-receive__button--primary" data-testid="share-receive-verify" :disabled="busy || !passwordInput">
                  {{ busy ? '校验中' : '解锁预览' }}
                </button>
              </div>
            </form>

            <template v-else>
              <div v-if="mindmapPreview || previewKind === 'markdown' || previewKind === 'text'" class="share-receive__preview-toolbar">
                <span class="share-receive__format">{{ mindmapPreview?.formatName || previewKindLabel }}</span>
                <span v-if="mindmapPreview" class="share-receive__toolbar-actions">
                  <button v-if="!mindmapSourceVisible" type="button" data-testid="share-receive-mindmap-fit" @click="mindmapFitMode = mindmapFitMode === 'fit' ? 'actual' : 'fit'">{{ mindmapFitMode === 'fit' ? '原始尺寸' : '适应面板' }}</button>
                  <button type="button" data-testid="share-receive-mindmap-source" @click="mindmapSourceVisible = !mindmapSourceVisible">{{ mindmapSourceVisible ? '查看导图' : '查看源码' }}</button>
                </span>
              </div>

              <div
                v-if="mindmapPreview && !mindmapSourceVisible"
                class="share-receive__canvas share-receive__canvas--mindmap"
                :class="{ 'is-actual-size': mindmapFitMode === 'actual' }"
                data-testid="share-receive-mindmap"
                v-html="mindmapPreview.svg"
              ></div>
              <div
                v-else-if="previewKind === 'markdown'"
                class="share-receive__canvas share-receive__canvas--markdown"
                data-testid="share-receive-markdown"
                @click="handlePreviewClick"
                v-html="markdownHtml"
              ></div>
              <pre v-else-if="previewKind === 'text' || mindmapSourceVisible" class="share-receive__canvas" data-testid="share-receive-text">{{ shareContent }}</pre>
              <div v-else class="share-receive__unsupported" data-testid="share-receive-unsupported">
                <strong>{{ previewKind === 'unsupported' ? '此格式暂不支持在 Tau 内预览' : '此文档没有可预览正文' }}</strong>
                <span>{{ info.previewUrl ? '可通过公开预览查看，或复制链接到浏览器。' : '二进制分享暂不支持一键添加到云端。' }}</span>
              </div>
            </template>
          </div>
        </div>

        <footer class="share-receive__footer">
          <span class="share-receive__footer-hint">{{ info && !info.passwordRequired ? '只会复制为新文档，不覆盖已有内容。' : '' }}</span>
          <div class="share-receive__footer-actions">
            <button type="button" class="share-receive__button" data-testid="share-receive-close-footer" @click="requestClose">关闭</button>
            <button
              v-if="info && !info.passwordRequired && canImport"
              type="button"
              class="share-receive__button share-receive__button--primary"
              data-testid="share-receive-add"
              :disabled="busy || adding"
              @click="addToCloud"
            >
              {{ adding ? '添加中…' : '添加到我的云端' }}
            </button>
            <span v-else-if="info && !info.passwordRequired && importBlockReason" class="share-receive__footer-hint" data-testid="share-receive-import-block">
              {{ importBlockReason }}
            </span>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @description 接收 Tau 分享弹窗：粘贴/读取剪贴板分享链接、免登录只读预览、密码解锁和复制到当前云空间。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-11-06 10:40
 */
import { computed, ref, watch } from 'vue';
import { appCommands } from '@/lib/tauri';
import type { CloudSharePublicInfo } from '@/lib/tauri';
import {
  parseTauShareLink,
  readPublicShare,
  readShareLinkFromClipboard,
  receiveShareToCloud,
  resolveShareContent,
  resolveSharePreviewKind,
  rewriteSharedImageUrl,
  verifyPublicShare,
} from '@/services/cloudShareReceiveService';
import { isMindMapPath } from '@/services/documentTypeService';
import { previewMindmapImport } from '@/services/mindmap/importExportService';
import { canImportSharedDocument, describeImportBlock } from '@/services/shareImportService';

const props = withDefaults(defineProps<{
  visible?: boolean;
  /** 从「一键分享」或剪贴板入口带入的链接；打开时自动预览。 */
  initialUrl?: string | null;
  /** 已登录时才直接转存；未登录时由宿主引导登录并保留当前分享地址。 */
  signedIn?: boolean;
}>(), { visible: false, initialUrl: null, signedIn: true });
const emit = defineEmits<{
  close: [];
  imported: [payload: { fileId: number; cloudPath: string }];
  'login-request': [payload: { url: string }];
}>();

const linkInput = ref('');
const passwordInput = ref('');
const verifiedPassword = ref('');
const token = ref('');
const info = ref<CloudSharePublicInfo | null>(null);
const loading = ref(false);
const busy = ref(false);
const adding = ref(false);
const error = ref('');
const notice = ref('');
const markdownHtml = ref('');
const mindmapPreview = ref<{ formatName: string; svg: string; source: string } | null>(null);
const mindmapSourceVisible = ref(false);
const mindmapFitMode = ref<'fit' | 'actual'>('fit');
let loadGeneration = 0;

const shareOrigin = computed(() => parseTauShareLink(linkInput.value)?.origin ?? null);
const shareContent = computed(() => (
  info.value
    ? resolveShareContent(info.value, { origin: shareOrigin.value, token: token.value })
    : ''
));
const previewKind = computed(() => (info.value ? resolveSharePreviewKind(info.value) : 'unsupported'));
const canImport = computed(() => canImportSharedDocument(info.value));
const importBlockReason = computed(() => describeImportBlock(info.value));
const previewKindLabel = computed(() => {
  if (previewKind.value === 'markdown') return 'Markdown 预览';
  if (previewKind.value === 'text') return '文本预览';
  return '';
});
const fileTitle = computed(() => info.value?.fileName || info.value?.title || '未命名分享');
const fileKindLabel = computed(() => {
  const kind = info.value?.fileKind || '';
  return ({ markdown: 'Markdown', code: '代码', text: '文本', image: '图片', pdf: 'PDF', office: 'Office', other: '文档' } as Record<string, string>)[kind] || kind || '文档';
});

function formatTime(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : value;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function handlePreviewClick(event: MouseEvent): Promise<void> {
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement)) return;
  event.preventDefault();
  const href = anchor.getAttribute('href')?.trim() ?? '';
  if (!/^https?:\/\//i.test(href)) return;
  await appCommands.openExternalLink(href).catch(() => undefined);
}

async function renderPreview(next: CloudSharePublicInfo, generation: number): Promise<boolean> {
  let nextMarkdownHtml = '';
  let nextMindmapPreview: { formatName: string; svg: string; source: string } | null = null;
  const content = resolveShareContent(next, { origin: shareOrigin.value, token: token.value });
  const kind = resolveSharePreviewKind(next);
  if (kind === 'markdown' && content) {
    const { renderMarkdown } = await import('@/services/markdownRenderService');
    const html = renderMarkdown(content);
    const container = document.createElement('div');
    container.innerHTML = html;
    container.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
      const src = image.getAttribute('src') ?? '';
      if (src) {
        image.setAttribute('src', rewriteSharedImageUrl(src, next.assetTicket, {
          origin: shareOrigin.value,
          token: token.value,
        }));
      }
    });
    nextMarkdownHtml = container.innerHTML;
  } else if (kind === 'mindmap' && content && isMindMapPath(next.fileName)) {
    const parsed = await previewMindmapImport({ fileName: next.fileName ?? '', content });
    if (parsed.ok && parsed.document) {
      const { renderMindmapSvg } = await import('@/services/mindmapSvgService');
      const rendered = renderMindmapSvg(parsed.document, { background: 'transparent', padding: 24, colorMode: 'color' });
      nextMindmapPreview = { formatName: parsed.formatName, svg: rendered.svg, source: content };
    } else {
      if (generation === loadGeneration) mindmapSourceVisible.value = true;
    }
  }
  if (generation !== loadGeneration) return false;
  markdownHtml.value = nextMarkdownHtml;
  mindmapPreview.value = nextMindmapPreview;
  return true;
}

async function applyInfo(next: CloudSharePublicInfo, generation: number): Promise<void> {
  if (generation !== loadGeneration) return;
  info.value = next;
  passwordInput.value = '';
  await renderPreview(next, generation);
}

async function loadToken(rawToken: string): Promise<void> {
  const generation = ++loadGeneration;
  token.value = rawToken;
  verifiedPassword.value = '';
  loading.value = true;
  error.value = '';
  notice.value = '';
  info.value = null;
  try {
    const outcome = await readPublicShare(rawToken);
    if (generation !== loadGeneration) return;
    if (!outcome.ok) {
      error.value = outcome.message;
      return;
    }
    await applyInfo(outcome.data, generation);
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function loadLink(): Promise<void> {
  const parsed = parseTauShareLink(linkInput.value);
  if (!parsed) {
    error.value = '请输入有效的 Tau 分享链接，例如 https://note.lizipro.cn/s/abcdefgh12345678';
    return;
  }
  linkInput.value = parsed.url;
  await loadToken(parsed.token);
}

async function pasteClipboard(): Promise<void> {
  error.value = '';
  notice.value = '';
  busy.value = true;
  try {
    const outcome = await readShareLinkFromClipboard();
    if (!outcome.ok) {
      error.value = outcome.message;
      return;
    }
    linkInput.value = outcome.data.url;
    await loadToken(outcome.data.token);
  } finally {
    busy.value = false;
  }
}

async function verifyPassword(): Promise<void> {
  if (!token.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const password = passwordInput.value;
    const outcome = await verifyPublicShare(token.value, password);
    if (!outcome.ok) {
      error.value = outcome.kind === 'unauthorized' ? '分享密码不正确，请重试。' : outcome.message;
      return;
    }
    verifiedPassword.value = password;
    await applyInfo(outcome.data, loadGeneration);
    notice.value = '分享已解锁，可以添加到我的云端。';
  } finally {
    busy.value = false;
  }
}

async function addToCloud(): Promise<void> {
  if (!info.value || adding.value) return;
  if (!props.signedIn) {
    emit('login-request', { url: linkInput.value.trim() });
    return;
  }
  adding.value = true;
  error.value = '';
  notice.value = '';
  try {
    const outcome = await receiveShareToCloud({
      token: token.value,
      password: verifiedPassword.value || null,
      info: { ...info.value, content: shareContent.value },
    });
    if (!outcome.ok) {
      error.value = outcome.kind === 'conflict'
        ? '你的云端已有同名文档，请先改名或删除后再添加。'
        : outcome.message;
      return;
    }
    notice.value = `已添加到 ${outcome.data.cloudPath}`;
    emit('imported', { fileId: outcome.data.fileId, cloudPath: outcome.data.cloudPath });
  } finally {
    adding.value = false;
  }
}

function requestClose(): void {
  if (busy.value || adding.value) return;
  emit('close');
}

function reset(): void {
  loadGeneration += 1;
  linkInput.value = '';
  passwordInput.value = '';
  verifiedPassword.value = '';
  token.value = '';
  info.value = null;
  loading.value = false;
  busy.value = false;
  adding.value = false;
  error.value = '';
  notice.value = '';
  markdownHtml.value = '';
  mindmapPreview.value = null;
  mindmapSourceVisible.value = false;
  mindmapFitMode.value = 'fit';
}

watch(() => props.visible, (visible) => {
  if (!visible) return;
  reset();
  const initial = (props.initialUrl ?? '').trim();
  if (initial) {
    linkInput.value = initial;
    void loadLink();
  } else {
    // 工具栏「接收分享」直接识别剪贴板；只有确实存在分享链接才打开预览。
    void pasteClipboard();
  }
}, { immediate: true });

defineExpose({ loadLink, pasteClipboard, verifyPassword, addToCloud });
</script>

<style scoped>
.share-receive-backdrop { position: fixed; inset: 0; z-index: 13000; display: flex; align-items: center; justify-content: center; padding: 4vh 4vw; background: rgba(6, 10, 18, 0.82); backdrop-filter: blur(7px); }
.share-receive { display: flex; flex-direction: column; width: min(980px, 100%); max-height: 92vh; min-height: 0; color: var(--text-primary, #e5e9f0); background: var(--panel-elevated, #151d2d); border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.38)); border-radius: 10px; box-shadow: 0 28px 80px rgba(0, 0, 0, 0.48); }
.share-receive__header, .share-receive__footer { display: flex; align-items: center; gap: 12px; padding: 14px 18px; }
.share-receive__header { border-bottom: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24)); }
.share-receive__header h3 { margin: 2px 0 0; font-size: 17px; }
.share-receive__eyebrow { margin: 0; font-size: 9px; letter-spacing: 0.14em; color: var(--accent-brand, #7cc7ff); }
.share-receive__close { margin-left: auto; padding: 2px 7px; font-size: 20px; line-height: 1; color: var(--text-secondary); cursor: pointer; background: transparent; border: 0; }
.share-receive__body { display: flex; flex-direction: column; gap: 12px; min-height: 0; padding: 16px 18px; overflow: auto; }
.share-receive__intro, .share-receive__hint, .share-receive__meta, .share-receive__footer-hint { margin: 0; font-size: 12px; color: var(--text-muted, #8b98af); }
.share-receive__link-row { display: flex; gap: 8px; align-items: center; }
.share-receive__input { flex: 1; min-width: 0; padding: 8px 10px; font-size: 12px; color: var(--text-primary); background: var(--panel-base, #101726); border: 1px solid var(--border-soft); border-radius: 5px; }
.share-receive__input:focus { border-color: var(--accent-brand); outline: none; }
.share-receive__button { padding: 6px 12px; font-size: 12px; color: var(--text-primary); cursor: pointer; background: var(--surface-muted, rgba(255, 255, 255, 0.04)); border: 1px solid var(--border-soft); border-radius: 5px; white-space: nowrap; }
.share-receive__button:hover:not(:disabled) { color: var(--accent-brand); border-color: var(--accent-brand); }
.share-receive__button--primary { color: var(--accent-brand); border-color: var(--accent-brand); }
.share-receive__button:disabled { cursor: not-allowed; opacity: 0.5; }
.share-receive__notice { padding: 8px 10px; font-size: 12px; border-radius: 5px; }
.share-receive__notice--error { color: var(--state-danger, #ff8e8e); background: rgba(220, 38, 38, 0.1); }
.share-receive__notice--success { color: var(--state-success, #7ee2a8); background: rgba(34, 197, 94, 0.1); }
.share-receive__preview { display: flex; flex-direction: column; min-height: 0; border: 1px solid var(--border-soft); border-radius: 7px; overflow: hidden; }
.share-receive__preview-header { display: flex; align-items: flex-start; gap: 12px; padding: 10px 12px; background: var(--surface-muted); }
.share-receive__title { min-width: 0; flex: 1; }
.share-receive__title h4 { margin: 2px 0 0; overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.share-receive__type { font-size: 10px; color: var(--accent-brand); }
.share-receive__meta { display: flex; flex-wrap: wrap; gap: 4px 12px; text-align: right; }
.share-receive__password { display: flex; flex-direction: column; gap: 7px; padding: 12px; font-size: 12px; }
.share-receive__preview-toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-top: 1px solid var(--border-soft); border-bottom: 1px solid var(--border-soft); }
.share-receive__format { font-size: 11px; color: var(--text-muted); }
.share-receive__toolbar-actions { display: flex; gap: 6px; margin-left: auto; }
.share-receive__toolbar-actions button { padding: 2px 7px; font-size: 11px; color: var(--text-secondary); cursor: pointer; background: transparent; border: 1px solid var(--border-soft); border-radius: 4px; }
.share-receive__canvas { min-height: 220px; max-height: 52vh; margin: 0; padding: 16px; overflow: auto; color: var(--text-primary); background: var(--panel-base, #101726); white-space: pre-wrap; overflow-wrap: anywhere; }
.share-receive__canvas--mindmap { display: flex; min-height: 360px; white-space: normal; }
.share-receive__canvas--mindmap :deep(svg) { max-width: 100%; height: auto; margin: auto; }
.share-receive__canvas--mindmap.is-actual-size :deep(svg) { max-width: none; }
.share-receive__canvas--markdown { font-size: 13px; line-height: 1.7; white-space: normal; }
.share-receive__canvas--markdown :deep(h1), .share-receive__canvas--markdown :deep(h2), .share-receive__canvas--markdown :deep(h3) { margin: 0.8em 0 0.35em; }
.share-receive__canvas--markdown :deep(p), .share-receive__canvas--markdown :deep(ul), .share-receive__canvas--markdown :deep(ol) { margin: 0.55em 0; }
.share-receive__canvas--markdown :deep(pre), .share-receive__canvas--markdown :deep(table) { max-width: 100%; overflow: auto; }
.share-receive__canvas--markdown :deep(img) { max-width: 100%; height: auto; }
.share-receive__unsupported { display: flex; flex-direction: column; gap: 6px; padding: 28px 16px; font-size: 12px; color: var(--text-muted); text-align: center; }
.share-receive__unsupported strong { color: var(--text-secondary); }
.share-receive__footer { border-top: 1px solid var(--border-soft); }
.share-receive__footer-hint { flex: 1; }
.share-receive__footer-actions { display: flex; gap: 8px; }
@media (max-width: 640px) { .share-receive-backdrop { padding: 12px; } .share-receive { max-height: 96vh; } .share-receive__link-row { flex-wrap: wrap; } .share-receive__input { flex-basis: 100%; } .share-receive__preview-header, .share-receive__footer { flex-wrap: wrap; } .share-receive__footer-actions { margin-left: auto; } }
</style>
