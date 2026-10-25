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

import SettingsPanel from '@/components/editor/SettingsPanel.vue';
import { useCloudSyncStore } from '@/stores/cloudSync';
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

  it('有云端映射时应展开版本历史并在恢复时调用 restore', async () => {
    seedActiveTab();
    const wrapper = mountPanel();
    await settle();

    const versionsBtn = wrapper.get('[data-testid="cloud-sync-versions-btn"]');
    expect(versionsBtn.exists()).toBe(true);
    await versionsBtn.trigger('click');
    await settle();

    expect(cloudMocks.versions).toHaveBeenCalledWith(42);
    const rows = wrapper.findAll('[data-testid="cloud-sync-version-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain('版本 v3');
    expect(rows[0]?.text()).toContain('首次上传');

    const restoreBtn = wrapper.findAll('[data-testid="cloud-sync-version-restore"]')[0];
    expect(restoreBtn).toBeDefined();
    await restoreBtn!.trigger('click');
    await settle();

    expect(cloudMocks.restore).toHaveBeenCalledWith(42, 101);
    // 恢复后要刷新配额并重新拉取版本列表
    expect(cloudMocks.me).toHaveBeenCalled();
    expect(cloudMocks.versions).toHaveBeenCalledTimes(2);
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

  it('文档属性卡应渲染分类树、回填云端属性，并在保存时把 meta 送入 payload', async () => {
    seedActiveTab();

    const wrapper = mountPanel();
    await settle();

    expect(cloudMocks.blogCategories).toHaveBeenCalled();

    const categorySelect = wrapper.get('[data-testid="cloud-sync-meta-category"]');
    const optionValues = categorySelect.findAll('option').map((option) => (option.element as HTMLOptionElement).value);
    expect(optionValues).toContain('1001');
    expect(optionValues).toContain('2002');
    // 表单初值来自 getCloudDoc 返回的云端属性
    expect((categorySelect.element as HTMLSelectElement).value).toBe('1001');
    expect((wrapper.get('[data-testid="cloud-sync-meta-tags"]').element as HTMLInputElement).value).toBe('旧标签');

    await categorySelect.setValue('2002');
    await wrapper.get('[data-testid="cloud-sync-meta-tags"]').setValue('新标签, 云同步');
    await wrapper.get('[data-testid="cloud-sync-meta-visibility"]').setValue(true);
    await wrapper.get('[data-testid="cloud-sync-meta-save"]').trigger('click');
    await settle();

    const payload = cloudMocks.save.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      path: 'tau/ws/notes.md',
      baseVersion: 7,
      category: '子分类',
      // 雪花 id 字符串必须转成 number 传给后端
      categoryId: 2002,
      tags: '新标签, 云同步',
      visibility: 'PUBLIC',
    });
  });

  it('分类接口失败时应降级为文本输入并仍能保存分类名', async () => {
    seedActiveTab();
    cloudMocks.blogCategories.mockRejectedValue(new Error('网络异常'));

    const wrapper = mountPanel();
    await settle();

    expect(wrapper.find('[data-testid="cloud-sync-meta-categories-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-meta-category"]').exists()).toBe(false);

    const categoryText = wrapper.get('[data-testid="cloud-sync-meta-category-text"]');
    await categoryText.setValue('手写分类');
    await wrapper.get('[data-testid="cloud-sync-meta-save"]').trigger('click');
    await settle();

    const payload = cloudMocks.save.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      category: '手写分类',
      categoryId: null,
      visibility: 'PRIVATE',
    });
  });
});
