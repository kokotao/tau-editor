/**
 * @description 维护编辑器代码导航的位置历史，支持后退、前进并在新导航后截断前进分支。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 11:20
 */

export interface NavigationLocation {
  filePath: string;
  line: number;
  column: number;
}
export class NavigationHistory {
  private entries: NavigationLocation[] = [];
  private index = -1;

  get canGoBack(): boolean {
    return this.index > 0;
  }

  get canGoForward(): boolean {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }

  get current(): NavigationLocation | null {
    return this.index >= 0 ? this.entries[this.index] ?? null : null;
  }

  push(location: NavigationLocation): void {
    const normalized: NavigationLocation = {
      filePath: location.filePath,
      line: Math.max(1, Math.trunc(location.line) || 1),
      column: Math.max(1, Math.trunc(location.column) || 1),
    };
    const current = this.current;
    if (current && current.filePath === normalized.filePath
      && current.line === normalized.line && current.column === normalized.column) {
      return;
    }
    if (this.index < this.entries.length - 1) {
      this.entries = this.entries.slice(0, this.index + 1);
    }
    this.entries.push(normalized);
    this.index = this.entries.length - 1;
  }

  back(): NavigationLocation | null {
    if (!this.canGoBack) return null;
    this.index -= 1;
    return this.current;
  }

  forward(): NavigationLocation | null {
    if (!this.canGoForward) return null;
    this.index += 1;
    return this.current;
  }

  clear(): void {
    this.entries = [];
    this.index = -1;
  }
}
