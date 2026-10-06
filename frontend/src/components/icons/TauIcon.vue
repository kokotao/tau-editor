<template>
  <span
    class="tau-icon"
    :class="props.class"
    :style="iconStyleText"
    :aria-hidden="props.ariaHidden ? 'true' : undefined"
    v-html="iconMarkup"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface TauIconProps {
  /** File name without the .svg suffix, for example "icon-settings". */
  name: string
  /** Width and height of the icon. Numeric values are interpreted as pixels. */
  size?: number | string
  /** Additional classes applied to the icon wrapper. */
  class?: string | string[] | Record<string, boolean>
  /** Whether assistive technologies should ignore this decorative icon. */
  ariaHidden?: boolean
}

const props = withDefaults(defineProps<TauIconProps>(), {
  size: 18,
  ariaHidden: true,
})

/**
 * SVG files are trusted, repository-owned assets. Keeping the raw markup in
 * the bundle lets the icons inherit currentColor from the consuming button.
 */
const rawIconModules = import.meta.glob('../../assets/tau-icons/*.svg', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const iconMap = Object.fromEntries(
  Object.entries(rawIconModules).map(([filePath, markup]) => {
    const fileName = filePath.split('/').pop() ?? ''
    return [fileName.replace(/\.svg$/, ''), markup]
  }),
) as Record<string, string>

const iconMarkup = computed(() => iconMap[props.name] ?? iconMap['icon-info'] ?? '')

const iconSize = computed(() => {
  if (typeof props.size === 'number') return `${props.size}px`
  return /^\d+(?:\.\d+)?$/.test(props.size.trim()) ? `${props.size}px` : props.size
})

const iconStyleText = computed(() => `width:${iconSize.value};height:${iconSize.value};min-width:${iconSize.value};min-height:${iconSize.value};`)
</script>

<style scoped>
.tau-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  line-height: 0;
  overflow: hidden;
  vertical-align: middle;
}

.tau-icon :deep(svg) {
  display: block;
  width: 100% !important;
  height: 100% !important;
  max-width: none;
  max-height: none;
}
</style>
