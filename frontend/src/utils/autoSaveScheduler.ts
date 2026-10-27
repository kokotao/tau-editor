/**
 * @description 自动保存触发时机：2.5s 空闲 debounce + 失焦立即 + Ctrl+S 立即，统一收敛到 onTrigger。
 * 只管"什么时候该存"，不管"存什么、怎么存"（那是 cloudDocSaveController 的事），
 * 也刻意不含任何 Vue / store 依赖，便于单测与复用。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 10:30
 */

/** 方案 §3.2 定的空闲去抖窗口。 */
export const AUTO_SAVE_DEBOUNCE_MS = 2500;

/** 触发原因：debounce（编辑空闲）/ blur（编辑器失焦）/ manual（Ctrl+S）。 */
export type AutoSaveReason = 'debounce' | 'blur' | 'manual';

export interface AutoSaveSchedulerOptions {
  /** 真正执行保存；抛异常只影响这一次触发，不会卡住后续触发 */
  onTrigger: (reason: AutoSaveReason) => void | Promise<void>;
  /** 去抖窗口，默认 2500ms */
  delayMs?: number;
}

export interface AutoSaveScheduler {
  /** 有内容变化：重置去抖窗口（连续编辑只在最后一次编辑后 delayMs 触发一次） */
  notifyEditing(): void;
  /** 立即触发（失焦 / Ctrl+S）：取消未到期的去抖窗口，避免同一次编辑被存两遍 */
  triggerNow(reason: 'blur' | 'manual'): Promise<void>;
  /** 是否有未到期的去抖窗口 */
  isPending(): boolean;
  /** 销毁（标签关闭 / 换文档 / 组件卸载）：取消窗口且此后不再触发任何 onTrigger */
  destroy(): void;
}

export function createAutoSaveScheduler(options: AutoSaveSchedulerOptions): AutoSaveScheduler {
  const requested = options.delayMs;
  const delayMs =
    typeof requested === 'number' && Number.isFinite(requested) && requested >= 0
      ? Math.trunc(requested)
      : AUTO_SAVE_DEBOUNCE_MS;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  // 错误一律吞掉：自动保存是后台动作，不能因为一次失败把后续触发链熔断，
  // 更不能让 onTrigger 的 rejection 变成未捕获的 Promise 异常。
  const runTrigger = (reason: AutoSaveReason): Promise<void> => {
    if (destroyed) {
      return Promise.resolve();
    }
    try {
      return Promise.resolve(options.onTrigger(reason)).then(
        () => undefined,
        () => undefined,
      );
    } catch {
      return Promise.resolve();
    }
  };

  return {
    notifyEditing(): void {
      if (destroyed) {
        return;
      }
      // 覆盖式重置：5 次连续编辑只会留下最后一个窗口
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void runTrigger('debounce');
      }, delayMs);
    },

    triggerNow(reason: 'blur' | 'manual'): Promise<void> {
      if (destroyed) {
        return Promise.resolve();
      }
      clearTimer();
      return runTrigger(reason);
    },

    isPending(): boolean {
      return timer !== null;
    },

    destroy(): void {
      destroyed = true;
      clearTimer();
    },
  };
}
