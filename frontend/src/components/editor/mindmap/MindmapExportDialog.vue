<script setup lang="ts">
/**
 * MindmapExportDialog（阶段 3）
 *
 * 选择导出格式；PNG 额外提供背景与倍率：
 * - 背景：透明 / 纯白；
 * - 倍率：1x / 2x / 3x（超限由导出管线给出错误提示）。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { computed, ref, watch } from 'vue';
import {
  MINDMAP_EXPORT_FORMATS,
  type MindmapExportFormatId,
} from '@/services/mindmap/importExportService';

const props = defineProps<{
  visible: boolean;
  defaultFormat?: MindmapExportFormatId;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'confirm', payload: {
    formatId: MindmapExportFormatId;
    background: 'transparent' | string;
    scale: number;
  }): void;
}>();

const formatId = ref<MindmapExportFormatId>(props.defaultFormat ?? 'taumap');
const background = ref<'transparent' | string>('transparent');
const scale = ref(2);

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      formatId.value = props.defaultFormat ?? 'taumap';
      background.value = 'transparent';
      scale.value = 2;
    }
  },
);

const isPng = computed(() => formatId.value === 'png');
const selected = computed(() => MINDMAP_EXPORT_FORMATS.find((format) => format.id === formatId.value));
</script>

<template>
  <div v-if="props.visible" class="mm-dialog-backdrop" data-testid="mm-export-backdrop" @click.self="emit('close')">
    <section class="mm-dialog" role="dialog" aria-modal="true" data-testid="mm-export-dialog">
      <h2 class="mm-dialog-title">导出思维导图</h2>

      <div class="mm-export-formats" role="radiogroup" aria-label="导出格式">
        <label
          v-for="format in MINDMAP_EXPORT_FORMATS"
          :key="format.id"
          class="mm-export-option"
          :class="{ 'is-selected': format.id === formatId }"
        >
          <input
            type="radio"
            name="mm-export-format"
            :value="format.id"
            :checked="format.id === formatId"
            :data-testid="`mm-export-format-${format.id}`"
            @change="formatId = format.id as MindmapExportFormatId"
          />
          <span>{{ format.label }}</span>
        </label>
      </div>

      <div v-if="isPng" class="mm-export-png-options" data-testid="mm-export-png-options">
        <div class="mm-export-row">
          <span class="mm-export-label">背景</span>
          <label class="mm-export-inline">
            <input
              type="radio"
              name="mm-export-bg"
              value="transparent"
              :checked="background === 'transparent'"
              data-testid="mm-export-bg-transparent"
              @change="background = 'transparent'"
            />
            透明
          </label>
          <label class="mm-export-inline">
            <input
              type="radio"
              name="mm-export-bg"
              value="#ffffff"
              :checked="background === '#ffffff'"
              data-testid="mm-export-bg-white"
              @change="background = '#ffffff'"
            />
            纯白
          </label>
        </div>
        <div class="mm-export-row">
          <span class="mm-export-label">倍率</span>
          <label v-for="value in [1, 2, 3]" :key="value" class="mm-export-inline">
            <input
              type="radio"
              name="mm-export-scale"
              :value="value"
              :checked="scale === value"
              @change="scale = value"
            />
            {{ value }}x
          </label>
        </div>
        <p class="mm-export-hint">完整地图会按内容尺寸导出（不是当前视口裁切）；超大图会提示降倍率。</p>
      </div>

      <div class="mm-dialog-actions">
        <button type="button" class="mm-btn" data-testid="mm-export-cancel" @click="emit('close')">取消</button>
        <button
          type="button"
          class="mm-btn primary"
          data-testid="mm-export-confirm"
          :disabled="props.busy"
          @click="emit('confirm', { formatId, background, scale })"
        >
          {{ props.busy ? '导出中…' : `导出 ${selected?.extension ? '.' + selected.extension : ''}` }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mm-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}
.mm-dialog {
  width: min(460px, 92vw);
  max-height: 82vh;
  overflow: auto;
  background: var(--surface, #fff);
  color: var(--text-primary, #1f2329);
  border-radius: 12px;
  padding: 18px 20px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
}
.mm-dialog-title { margin: 0 0 12px; font-size: 16px; }
.mm-export-formats { display: grid; gap: 6px; }
.mm-export-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border, #e5e7eb);
  font-size: 13px;
  cursor: pointer;
}
.mm-export-option.is-selected {
  border-color: var(--accent, #4a90e2);
  background: rgba(74, 144, 226, 0.08);
}
.mm-export-png-options { margin-top: 12px; display: grid; gap: 8px; }
.mm-export-row { display: flex; align-items: center; gap: 12px; font-size: 13px; }
.mm-export-label { width: 40px; opacity: 0.65; }
.mm-export-inline { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
.mm-export-hint { margin: 2px 0 0; font-size: 12px; opacity: 0.6; }
.mm-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.mm-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--border, #d8dee9);
  background: var(--surface, #fff);
  color: inherit;
  font-size: 13px;
  cursor: pointer;
}
.mm-btn.primary { background: var(--accent, #4a90e2); border-color: var(--accent, #4a90e2); color: #fff; }
.mm-btn:disabled { opacity: 0.5; cursor: default; }
</style>