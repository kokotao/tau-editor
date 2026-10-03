/**
 * @description 语言服务器安装、版本与可用状态 Store。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 11:20
 */

import { defineStore } from 'pinia';
import {
  probeLanguageServers,
  type LanguageServerStatus,
} from '@/services/lsp/languageServerStatus';

interface LspServersState {
  servers: LanguageServerStatus[];
  loading: boolean;
  error: string;
  checkedAt: number | null;
  provisioning: Record<string, boolean>;
}

export const useLspServersStore = defineStore('lspServers', {
  state: (): LspServersState => ({
    servers: [],
    loading: false,
    error: '',
    checkedAt: null,
    provisioning: {},
  }),

  getters: {
    availableCount: (state) => state.servers.filter((server) => server.available).length,
    unavailableCount: (state) => state.servers.filter((server) => !server.available).length,
  },

  actions: {
    async refresh() {
      if (this.loading) return;
      this.loading = true;
      this.error = '';
      try {
        this.servers = await probeLanguageServers();
        this.checkedAt = Date.now();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },

    async provision(serverId: string) {
      if (this.provisioning[serverId]) return;
      this.provisioning[serverId] = true;
      this.error = '';
      try {
        const { provisionLanguageServer } = await import('@/services/lsp/languageServerStatus');
        await provisionLanguageServer(serverId);
        this.servers = await probeLanguageServers();
        this.checkedAt = Date.now();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.provisioning[serverId] = false;
      }
    },
  },
});
