/**
 * Diff 会话状态（v0.4.0）
 *
 * Diff 视图不进入标签列表，只作为编辑器区域上的临时只读视图。
 */

import { defineStore } from 'pinia';
import type { DiffError, DiffLayout, DiffSession } from '@/services/diffService';

interface DiffState {
  session: DiffSession | null;
  loading: boolean;
  error: DiffError | null;
}

export const useDiffStore = defineStore('diff', {
  state: (): DiffState => ({
    session: null,
    loading: false,
    error: null,
  }),

  getters: {
    isOpen: (state) => state.session !== null,
    layout: (state): DiffLayout => state.session?.layout ?? 'side-by-side',
  },

  actions: {
    openSession(session: DiffSession) {
      this.session = session;
      this.error = null;
      this.loading = false;
    },

    setLoading(loading: boolean) {
      this.loading = loading;
    },

    setError(error: DiffError | null) {
      this.error = error;
      this.loading = false;
    },

    setLayout(layout: DiffLayout) {
      if (this.session) {
        this.session = { ...this.session, layout };
      }
    },

    toggleLayout() {
      if (this.session) {
        this.setLayout(this.session.layout === 'side-by-side' ? 'inline' : 'side-by-side');
      }
    },

    close() {
      this.session = null;
      this.error = null;
      this.loading = false;
    },
  },
});
