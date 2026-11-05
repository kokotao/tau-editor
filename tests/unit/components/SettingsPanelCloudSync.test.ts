import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent } from 'vue';

/**
 * P8：设置页云同步分类的「版本历史 / 恢复」与「冲突双按钮」。
 * 桌面端（isTauriApp = true）才能看到这些入口，因此单独用一份带云命令 mock 的用例，
 * 避免影响既有 SettingsPanel.test.ts 的 Web 行为。
 */
const NConfigProviderStub = defineComponent({
  name: 'NConfigProvider',
  template: '<div class="n-config-provider"><slot /></div>',
});

const NSelectStub = defineComponent({
  name: 'NSelect',
  props: {
    value: { type: [String, Number], default: null },
    options: { type: Array, default: () => [] },
  },
  emits: ['update:value'],
  template: `
    <select :value="value" @change="$emit('update:value', $event.target.value)">
      <option v-for="option in options" :key="String(option.value)" :value="String(option.value)">
        {{ option.label }}
      </option>
    </select>
  `,
});

const cloudMocks = vi.hoisted(() => ({
  isTauri: { value: true },
  get: vi.fn(),
  save: vi.fn(),
  me: vi.fn(),
  list: vi.fn(),
  versions: vi.fn(),
  restore: vi.fn(),
  readSyncSource: vi.fn(),
  session: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
  blogCategories: vi.fn(),
  blogTags: vi.fn(),
  getAppVersionInfo: vi.fn(),
  checkGithubUpdate: vi.fn(),
  downloadAndInstallUpdate: vi.fn(),
  openExternalLink: vi.fn(),
}));

vi.mock('naive-ui', () => ({
  darkTheme: {},
  NConfigProvider: NConfigProviderStub,
  NSelect: NSelectStub,
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => cloudMocks.isTauri.value,
    cloudCommands: {
      ...actual.cloudCommands,
      get: cloudMocks.get,
      save: cloudMocks.save,
      me: cloudMocks.me,
      list: cloudMocks.list,
      versions: cloudMocks.versions,
      restore: cloudMocks.restore,
      readSyncSource: cloudMocks.readSyncSource,
      session: cloudMocks.session,
      logout: cloudMocks.logout,
      login: cloudMocks.login,
      blogCategories: cloudMocks.blogCategories,
      blogTags: cloudMocks.blogTags,
    },
    appCommands: {
      ...actual.appCommands,
      openExternalLink: cloudMocks.openExternalLink,
    },
    settingsCommands: {
      ...actual.settingsCommands,
      getAppVersionInfo: cloudMocks.getAppVersionInfo,
      checkGithubUpdate: cloudMocks.checkGithubUpdate,
      downloadAndInstallUpdate: cloudMocks.downloadAndInstallUpdate,
    },
  };
});

vi.mock('@/services/markdownRenderService', () => ({
  renderMarkdown: vi.fn(() => '<h1>新版本</h1>'),
}));

/** 拉取覆盖本地时会读文件修订号（走 Tauri 文件系统），这里只替换这一处边界。 */
const captureFileRevision = vi.hoisted(() => vi.fn(async (_path: string) => 'rev-cloud'));

vi.mock('@/services/workspaceService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/workspaceService')>();
  return {
    ...actual,
    createWorkspaceService: () => ({ captureFileRevision }),
  };
});

import SettingsPanel from '@/components/editor/SettingsPanel.vue';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useSettingsStore } from '@/stores/settings';
import { useFileConflictsStore } from '@/stores/fileConflicts';
import { useFileSystemStore } from '@/stores/fileSystem';
import { useTabsStore, type Tab } from '@/stores/tabs';
import { useWorkspaceStore } from '@/stores/workspace';

const REMOTE_DOC = {
  fileId: 42,
  path: 'tau/ws/notes.md',
  title: 'notes.md',
  contentHash: 'sha256:remote',
  size: 10,
  version: 7,
  category: '笔记',
  categoryId: 1001,
  tags: '旧标签',
  visibility: 'PRIVATE',
  publishedArticleId: null,
  updatedAt: '2026-10-24T10:00:00Z',
};

/** 分类树：id 为雪花字符串，父节点 parentId 为 null。 */
const CATEGORY_TREE = [
  {
    id: '1001',
    name: '笔记',
    parentId: null,
    children: [
      { id: '2002', name: '子分类', parentId: '1001', children: [] },
    ],
  },
  { id: '1003', name: '随笔', parentId: null, children: [] },
];

const VERSION_ROWS = [
  {
    versionId: 101,
    version: 3,
    contentHash: 'sha256:v3',
    size: 1024,
    remark: '首次上传',
    createdAt: '2026-10-24T10:00:00Z',
  },
  {
    versionId: 102,
    version: 2,
    contentHash: 'sha256:v2',
    size: 2048,
    remark: null,
    createdAt: '2026-10-23T10:00:00Z',
  },
];

describe('SettingsPanel 云同步版本历史与冲突处理', () => {
  let pinia: ReturnType<typeof createPinia>;

  const seedActiveTab = (overrides: Partial<Omit<Tab, 'id' | 'createdAt'>> = {}) => {
    const tabsStore = useTabsStore();
    return tabsStore.addTab({
      filePath: '/ws/notes.md',
      fileName: 'notes.md',
      language: 'markdown',
      isDirty: false,
      isUntitled: false,
      content: 'local content',
      cloudFileId: 42,
      cloudVersion: 5,
      cloudContentHash: 'sha256:base',
      ...overrides,
    });
  };

  const mountPanel = () => mount(SettingsPanel, {
    props: { activeCategory: 'cloudSync' },
    global: {
      plugins: [pinia],
      stubs: {
        NConfigProvider: NConfigProviderStub,
        NSelect: NSelectStub,
        'n-config-provider': NConfigProviderStub,
        'n-select': NSelectStub,
      },
    },
  });

  /** 组件 onMounted 会串起会话恢复 + 配额刷新，多刷一轮微任务确保状态落地。 */
  const settle = async () => {
    await flushPromises();
    await flushPromises();
    await flushPromises();
  };

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    cloudMocks.isTauri.value = true;
    cloudMocks.get.mockResolvedValue(REMOTE_DOC);
    captureFileRevision.mockResolvedValue('rev-cloud');
    cloudMocks.blogCategories.mockResolvedValue(CATEGORY_TREE);
    cloudMocks.blogTags.mockResolvedValue(['笔记', '云同步']);
    cloudMocks.save.mockResolvedValue({
      fileId: 42,
      version: 8,
      contentHash: 'sha256:local',
      size: 12,
      updatedAt: '2026-10-25T09:00:00Z',
    });
    cloudMocks.me.mockResolvedValue({
      userId: 'u1',
      usedBytes: 12,
      quotaBytes: 1024,
      fileCount: 1,
      maxVersionPerFile: 30,
    });
    cloudMocks.list.mockResolvedValue({ records: [], total: 0, page: 1, size: 100 });
    cloudMocks.versions.mockResolvedValue(VERSION_ROWS);
    cloudMocks.restore.mockResolvedValue({
      fileId: 42,
      version: 9,
      contentHash: 'sha256:restored',
      size: 1024,
      updatedAt: '2026-10-25T09:30:00Z',
    });
    cloudMocks.readSyncSource.mockResolvedValue({
      content: 'local content',
      contentHash: 'sha256:local',
      size: 12,
      modifiedMs: 1,
    });
    cloudMocks.session.mockResolvedValue({
      signedIn: true,
      userId: 'u1',
      username: 'alice',
      baseUrl: 'https://note.lizipro.cn/lizi',
    });
    cloudMocks.logout.mockResolvedValue(undefined);
    cloudMocks.openExternalLink.mockResolvedValue(undefined);
    cloudMocks.getAppVersionInfo.mockResolvedValue({
      version: '0.2.0',
      os: 'linux',
      arch: 'x86_64',
      buildTarget: 'x86_64-linux',
      homepageUrl: 'https://github.com/kokotao/tau-editor',
    });
    cloudMocks.checkGithubUpdate.mockResolvedValue({
      currentVersion: '0.2.0',
      latestVersion: '0.2.0',
      hasUpdate: false,
      releaseName: 'v0.2.0',
      releaseNotes: '',
      releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.2.0',
      publishedAt: null,
      selectedAsset: null,
      device: { os: 'linux', arch: 'x86_64' },
      repositoryUrl: 'https://github.com/kokotao/tau-editor',
    });
    cloudMocks.downloadAndInstallUpdate.mockResolvedValue({
      downloadedPath: '/tmp/installer',
      launched: true,
      message: 'ok',
    });

    // 组件 onMounted 会异步恢复会话；先置为已登录，避免用例受恢复时序影响。
    const cloudSyncStore = useCloudSyncStore();
    cloudSyncStore.signedIn = true;

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspacePath = '/ws';
    workspaceStore.currentWorkspaceName = 'ws';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });


  it('同步结果为冲突时应出现双按钮，用本地覆盖时以云端版本为 baseVersion 保存', async () => {
    seedActiveTab();
    cloudMocks.list.mockResolvedValue({ records: [REMOTE_DOC], total: 1, page: 1, size: 100 });

    const wrapper = mountPanel();
    await settle();

    expect(wrapper.find('[data-testid="cloud-sync-keep-local-btn"]').exists()).toBe(false);

    await wrapper.get('[data-testid="cloud-sync-now-btn"]').trigger('click');
    await settle();

    expect(wrapper.find('[data-testid="cloud-sync-conflict"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-keep-local-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-keep-remote-btn"]').exists()).toBe(true);

    await wrapper.get('[data-testid="cloud-sync-keep-local-btn"]').trigger('click');
    await settle();

    expect(cloudMocks.get).toHaveBeenCalledWith(42);
    const payload = cloudMocks.save.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      path: 'tau/ws/notes.md',
      content: 'local content',
      baseVersion: 7,
    });
    // 冲突解决后按钮应消失
    expect(wrapper.find('[data-testid="cloud-sync-keep-local-btn"]').exists()).toBe(false);
  });

  it('Web 构建下不应展示版本历史与冲突处理入口', async () => {
    cloudMocks.isTauri.value = false;
    seedActiveTab();

    const wrapper = mountPanel();
    await settle();

    expect(wrapper.find('[data-testid="cloud-sync-versions"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cloud-sync-versions-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cloud-sync-keep-local-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cloud-sync-keep-remote-btn"]').exists()).toBe(false);
  });



  it('磁盘外部修改不应点亮云同步冲突面板', async () => {
    seedActiveTab();
    // 省略 source：磁盘/外部程序改动，属于外部变更提示，不是云冲突
    useFileConflictsStore().flag({ path: '/ws/notes.md', kind: 'modified' });

    const wrapper = mountPanel();
    await settle();

    expect(wrapper.find('[data-testid="cloud-sync-conflict"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cloud-sync-keep-remote-btn"]').exists()).toBe(false);
  });

  it('只有云端冲突来源才点亮云同步冲突面板', async () => {
    seedActiveTab();
    useFileConflictsStore().flag({ path: '/ws/notes.md', kind: 'modified', source: 'cloud' });

    const wrapper = mountPanel();
    await settle();

    expect(wrapper.find('[data-testid="cloud-sync-conflict"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-keep-remote-btn"]').exists()).toBe(true);
  });

  it('「从云端拉取」遇到未保存修改时先确认；取消不落盘且保留本地内容', async () => {
    seedActiveTab({ isDirty: true, content: 'unsaved local' });
    cloudMocks.list.mockResolvedValue({ records: [REMOTE_DOC], total: 1, page: 1, size: 100 });
    cloudMocks.get.mockResolvedValue({ ...REMOTE_DOC, content: 'cloud content', createdAt: null });
    const write = vi
      .spyOn(useFileSystemStore(), 'writeFileContent')
      .mockResolvedValue(undefined);

    const wrapper = mountPanel();
    await settle();

    await wrapper.get('[data-testid="cloud-sync-pull-btn"]').trigger('click');
    await settle();

    expect(wrapper.find('[data-testid="cloud-sync-pull-confirm"]').exists()).toBe(true);
    expect(write).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="cloud-sync-pull-confirm-cancel"]').trigger('click');
    await settle();

    expect(wrapper.find('[data-testid="cloud-sync-pull-confirm"]').exists()).toBe(false);
    expect(write).not.toHaveBeenCalled();
    const tab = useTabsStore().activeTab;
    expect(tab?.content).toBe('unsaved local');
    expect(tab?.isDirty).toBe(true);
  });

  it('确认覆盖后落盘并刷新云端基线', async () => {
    seedActiveTab({ isDirty: true, content: 'unsaved local' });
    cloudMocks.list.mockResolvedValue({ records: [REMOTE_DOC], total: 1, page: 1, size: 100 });
    cloudMocks.get.mockResolvedValue({ ...REMOTE_DOC, content: 'cloud content', createdAt: null });
    const write = vi
      .spyOn(useFileSystemStore(), 'writeFileContent')
      .mockResolvedValue(undefined);

    const wrapper = mountPanel();
    await settle();

    await wrapper.get('[data-testid="cloud-sync-pull-btn"]').trigger('click');
    await settle();
    await wrapper.get('[data-testid="cloud-sync-pull-confirm-ok"]').trigger('click');
    await settle();

    expect(write).toHaveBeenCalledWith('/ws/notes.md', 'cloud content');
    const tab = useTabsStore().activeTab;
    expect(tab?.content).toBe('cloud content');
    expect(tab?.isDirty).toBe(false);
    expect(tab?.cloudVersion).toBe(7);
    expect(tab?.cloudContentHash).toBe('sha256:remote');
    expect(captureFileRevision).toHaveBeenCalledWith('/ws/notes.md');
  });

  it('冲突面板选「以云端为准」时不再二次确认，脏标签也直接覆盖', async () => {
    seedActiveTab({ isDirty: true, content: 'unsaved local' });
    useFileConflictsStore().flag({ path: '/ws/notes.md', kind: 'modified', source: 'cloud' });
    cloudMocks.list.mockResolvedValue({ records: [REMOTE_DOC], total: 1, page: 1, size: 100 });
    cloudMocks.get.mockResolvedValue({ ...REMOTE_DOC, content: 'cloud content', createdAt: null });
    const write = vi
      .spyOn(useFileSystemStore(), 'writeFileContent')
      .mockResolvedValue(undefined);

    const wrapper = mountPanel();
    await settle();

    await wrapper.get('[data-testid="cloud-sync-keep-remote-btn"]').trigger('click');
    await settle();

    expect(wrapper.find('[data-testid="cloud-sync-pull-confirm"]').exists()).toBe(false);
    expect(write).toHaveBeenCalledWith('/ws/notes.md', 'cloud content');
    expect(useTabsStore().activeTab?.cloudVersion).toBe(7);
  });


  it('「同步文档内图片」开关默认开启且可切换并持久化', async () => {
    seedActiveTab();
    const wrapper = mountPanel();
    await settle();

    const toggle = wrapper.get('[data-testid="cloud-sync-images-toggle"]');
    expect((toggle.element as HTMLInputElement).checked).toBe(true);

    await toggle.setValue(false);
    await flushPromises();

    expect(useSettingsStore().syncDocumentImages).toBe(false);
  });

  it('点「浏览云端文档」应 emit open-cloud-browser（由 App 关设置面板后再打开）', async () => {
    seedActiveTab();
    const wrapper = mountPanel();
    await settle();

    await wrapper.get('[data-testid="cloud-sync-browse-btn"]').trigger('click');

    expect(wrapper.emitted('open-cloud-browser')).toHaveLength(1);
  });

  it('配额接口失败时显示错误归类与原因，不再留空白配额', async () => {
    cloudMocks.me.mockRejectedValue(
      Object.assign(new Error('获取云空间信息失败：无法连接服务器'), { code: 'NETWORK_ERROR' }),
    );
    seedActiveTab();

    const wrapper = mountPanel();
    await settle();
    await settle();

    const issue = wrapper.get('[data-testid="cloud-sync-quota-issue"]');
    expect(issue.text()).toContain('network');
    expect(issue.text()).toContain('无法连接服务器');
    // 拿不到配额时不渲染空进度条
    expect(wrapper.find('[data-testid="cloud-sync-quota-label"]').exists()).toBe(false);
  });
});
