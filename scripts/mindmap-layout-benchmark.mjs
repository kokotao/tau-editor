#!/usr/bin/env node
/**
 * 思维导图布局基准（阶段 2）
 *
 * 运行 `node scripts/mindmap-layout-benchmark.mjs`（或 `pnpm test:mindmap:bench`），
 * 用 200 节点 fixture 与 1k/5k/10k 合成宽树输出布局耗时。
 *
 * 说明：实际测量逻辑在同名 vitest 用例中，避免在脚本里重复实现 TS 逻辑。
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vitestBin = resolve(
  root,
  process.platform === 'win32' ? 'node_modules/.bin/vitest.cmd' : 'node_modules/.bin/vitest',
);

const result = spawnSync(
  vitestBin,
  [
    'run',
    'tests/unit/services/mindmap/mindmapLayoutPerformance.test.ts',
    '--reporter=verbose',
  ],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.error) {
  console.error('[mindmap-layout-benchmark] 启动 vitest 失败:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);