import { describe, expect, it } from 'vitest';
import {
  planScratchTabMoves,
  type ScratchTabPlanInput,
} from '@/utils/scratchTabRelocation';

const SCRATCH = 'C:/Users/Administrator/AppData/Local/Temp/tau-scratch/分享';
const TARGET = 'D:/WorkSpace/分享';

const tab = (id: string, filePath: string | null, isUntitled = false) => ({ id, filePath, isUntitled });

interface PlanCase {
  name: string;
  input: ScratchTabPlanInput;
  expectMoves: Array<[tabId: string, fromPath: string, toPath: string]>;
  expectSkipped: Array<[tabId: string, reason: string]>;
}

const cases: PlanCase[] = [
  {
    name: '旧根下的标签按相对路径拼到新根，文件名大小写保持不变',
    input: {
      tabs: [tab('t1', `${SCRATCH}/镜像管理提示词.md`)],
      fromRoot: SCRATCH,
      toRoot: TARGET,
    },
    expectMoves: [['t1', `${SCRATCH}/镜像管理提示词.md`, `${TARGET}/镜像管理提示词.md`]],
    expectSkipped: [],
  },
  {
    name: '子目录保留层级',
    input: {
      tabs: [tab('t1', `${SCRATCH}/子项/Deep/Note.md`)],
      fromRoot: SCRATCH,
      toRoot: TARGET,
    },
    expectMoves: [['t1', `${SCRATCH}/子项/Deep/Note.md`, `${TARGET}/子项/Deep/Note.md`]],
    expectSkipped: [],
  },
  {
    name: 'Windows 盘符路径大小写不敏感，且旧根的反斜杠/尾斜杠都能匹配',
    input: {
      tabs: [tab('t1', 'c:\\users\\administrator\\appdata\\local\\temp\\TAU-SCRATCH\\分享\\A.md')],
      fromRoot: 'C:\\Users\\Administrator\\AppData\\Local\\Temp\\tau-scratch\\分享\\',
      toRoot: TARGET,
    },
    expectMoves: [['t1', 'c:\\users\\administrator\\appdata\\local\\temp\\TAU-SCRATCH\\分享\\A.md', `${TARGET}/A.md`]],
    expectSkipped: [],
  },
  {
    name: '不在旧根下的标签不被改动，也不计入 skipped',
    input: {
      tabs: [tab('t1', 'E:/Other/keep.md'), tab('t2', `${SCRATCH}/move.md`)],
      fromRoot: SCRATCH,
      toRoot: TARGET,
    },
    expectMoves: [['t2', `${SCRATCH}/move.md`, `${TARGET}/move.md`]],
    expectSkipped: [],
  },
  {
    name: '旧根本身、空路径、未命名标签都跳过',
    input: {
      tabs: [tab('t1', SCRATCH), tab('t2', null), tab('t3', `${SCRATCH}/x.md`, true), tab('t4', '   ')],
      fromRoot: SCRATCH,
      toRoot: TARGET,
    },
    expectMoves: [],
    expectSkipped: [],
  },
  {
    name: '目标已被其它标签打开时跳过，不静默覆盖',
    input: {
      tabs: [tab('t1', `${SCRATCH}/dup.md`), tab('t2', `${TARGET}/dup.md`)],
      fromRoot: SCRATCH,
      toRoot: TARGET,
    },
    expectMoves: [],
    expectSkipped: [['t1', 'occupied-by-tab']],
  },
  {
    name: '目标占用判断同样大小写不敏感',
    input: {
      tabs: [tab('t1', `${SCRATCH}/dup.md`), tab('t2', `${TARGET}/DUP.MD`)],
      fromRoot: SCRATCH,
      toRoot: TARGET,
    },
    expectMoves: [],
    expectSkipped: [['t1', 'occupied-by-tab']],
  },
  {
    name: '两个标签映射到同一目标时只迁第一个，第二个按占用跳过',
    input: {
      tabs: [tab('t1', `${SCRATCH}/same.md`), tab('t2', `${SCRATCH}\\same.md`)],
      fromRoot: SCRATCH,
      toRoot: TARGET,
    },
    expectMoves: [['t1', `${SCRATCH}/same.md`, `${TARGET}/same.md`]],
    expectSkipped: [['t2', 'occupied-by-tab']],
  },
  {
    name: '给了复制清单时，没被真正复制的文件不迁指针',
    input: {
      tabs: [tab('t1', `${SCRATCH}/copied.md`), tab('t2', `${SCRATCH}/skipped.docx`)],
      fromRoot: SCRATCH,
      toRoot: TARGET,
      copiedRelativePaths: ['copied.md'],
    },
    expectMoves: [['t1', `${SCRATCH}/copied.md`, `${TARGET}/copied.md`]],
    expectSkipped: [['t2', 'not-copied']],
  },
  {
    name: '复制清单里的子目录相对路径可以匹配',
    input: {
      tabs: [tab('t1', `${SCRATCH}/子项/a.md`), tab('t2', `${SCRATCH}/子项/b.docx`)],
      fromRoot: SCRATCH,
      toRoot: TARGET,
      copiedRelativePaths: ['子项/a.md'],
    },
    expectMoves: [['t1', `${SCRATCH}/子项/a.md`, `${TARGET}/子项/a.md`]],
    expectSkipped: [['t2', 'not-copied']],
  },
  {
    name: '旧根与新根相同、或任一根为空时不规划',
    input: { tabs: [tab('t1', `${SCRATCH}/a.md`)], fromRoot: SCRATCH, toRoot: SCRATCH },
    expectMoves: [],
    expectSkipped: [],
  },
];

describe('planScratchTabMoves（表驱动）', () => {
  for (const testCase of cases) {
    it(testCase.name, () => {
      const plan = planScratchTabMoves(testCase.input);
      expect(plan.moves.map((move) => [move.tabId, move.fromPath, move.toPath])).toEqual(testCase.expectMoves);
      expect(plan.skipped.map((skip) => [skip.tabId, skip.reason])).toEqual(testCase.expectSkipped);
    });
  }

  it('空的 fromRoot / toRoot 不规划', () => {
    expect(planScratchTabMoves({ tabs: [tab('t1', '/a/b.md')], fromRoot: '', toRoot: TARGET }).moves).toEqual([]);
    expect(planScratchTabMoves({ tabs: [tab('t1', '/a/b.md')], fromRoot: SCRATCH, toRoot: '  ' }).moves).toEqual([]);
  });

  it('Posix 路径区分大小写，不相干的同名前缀不算在旧根下', () => {
    const plan = planScratchTabMoves({
      tabs: [tab('t1', '/tmp/tau-scratch/ws-a/x.md')],
      fromRoot: '/tmp/tau-scratch/ws',
      toRoot: '/work/ws',
    });
    expect(plan.moves).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it('跳过项带上目标路径，便于上层提示定位', () => {
    const plan = planScratchTabMoves({
      tabs: [tab('t1', `${SCRATCH}/a.md`)],
      fromRoot: SCRATCH,
      toRoot: TARGET,
      copiedRelativePaths: [],
    });
    expect(plan.skipped).toEqual([
      { tabId: 't1', fromPath: `${SCRATCH}/a.md`, toPath: `${TARGET}/a.md`, reason: 'not-copied' },
    ]);
  });
});
