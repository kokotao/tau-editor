import { MINDMAP_FORMAT, type MindMapDocument, type MindMapTopic } from '@/types/mindmap';
import { MINDMAP_IMAGE_NODES_EXTENSION, MINDMAP_IMAGE_NODES_VERSION } from '@/services/mindmapImageNodeService';

const TAU_ICON = 'data:image/png;base64,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';

interface TopicInput extends Partial<Omit<MindMapTopic, 'id' | 'parentId' | 'childIds' | 'text'>> {
  id: string;
  text: string;
}

export function createWelcomeMindMapDocument(): MindMapDocument {
  const topics: Record<string, MindMapTopic> = {};
  const add = (id: string, parentId: string | null, text: string, extra: TopicInput = { id, text }) => {
    topics[id] = { ...extra, id, parentId, childIds: [], text };
    if (parentId) topics[parentId]?.childIds.push(id);
  };

  add('overview', null, 'Tau Editor 思维导图功能全景', {
    id: 'overview', text: 'Tau Editor 思维导图功能全景',
    notes: '这是可编辑的示例文档。点击节点查看属性，使用上方工具栏切换布局、主题、撤销重做与导入导出。',
    markers: ['star'], labels: ['欢迎使用', '功能总览'],
    style: { fill: '#dff4eb', color: '#164c3b', shape: 'pill', borderColor: '#25805d', borderWidth: '2' },
  });

  add('editing', 'overview', '节点编辑与导航', { id: 'editing', text: '节点编辑与导航', summary: '快速构建清晰结构' });
  add('editing-add', 'editing', '新增节点：Tab 新增子节点，Enter 新增同级节点');
  add('editing-rename', 'editing', 'F2 重命名节点；可复制主题分支，保留层级后继续编辑');
  add('editing-delete', 'editing', 'Delete 删除选中主题及其后代；根主题可重置，操作可撤销');
  add('editing-move', 'editing', '拖动节点调整顺序；拖到其它节点上可调整层级');
  add('editing-order', 'editing', 'Alt + ↑ / ↓ 调整同级节点顺序；右键菜单也可执行');
  add('editing-collapse', 'editing', '折叠与展开子树，长图可先收起暂时不看的分支', { id: 'editing-collapse', text: '折叠与展开子树，长图可先收起暂时不看的分支', collapsed: false });
  add('editing-collapse-all', 'editing', '画布空白处右键可展开全部或折叠全部节点');
  add('editing-undo', 'editing', '撤销 / 重做：Ctrl 或 Cmd + Z / Shift + Z', { id: 'editing-undo', text: '撤销 / 重做：Ctrl 或 Cmd + Z / Shift + Z', markers: ['priority-1'] });
  add('editing-search', 'editing', '在大纲中搜索节点；结果与画布联动，可快速定位目标');

  add('content', 'overview', '丰富节点内容', { id: 'content', text: '丰富节点内容', boundary: { label: '内容能力', color: '#3b82f6' } });
  add('content-notes', 'content', '备注、标签与链接', {
    id: 'content-notes', text: '备注、标签与链接',
    notes: '节点可附加长文本备注、多个标签和网页链接。选中本节点后，在右侧属性面板查看这些字段。',
    labels: ['属性面板', '可检索'], link: 'https://github.com/kokotao/tau-editor', markers: ['flag'],
  });
  add('content-format', 'content', '文本样式：选中文字后设置颜色和背景高亮', {
    id: 'content-format', text: '文本样式：彩色文字与背景高亮',
    textStyles: [{ start: 0, end: 4, color: '#c2410c' }, { start: 5, end: 9, background: '#fef08a' }],
  });
  add('content-image', 'content', '图片节点：可在节点附近放置配图并调整大小', {
    id: 'content-image', text: '图片节点：配图、缩放与适配',
    notes: '图片节点扩展支持 PNG、JPEG、GIF 和 WebP；Plus / Pro 账号可以新增或编辑图片节点。此处示例图片是 Tau Editor 图标。',
    markers: ['question'],
  });
  add('content-image-caveat', 'content-image', '图片作为独立画布对象，不会挤进节点文字');

  add('style', 'overview', '样式与结构表达', { id: 'style', text: '样式与结构表达', summary: '让重点和分组一眼可见' });
  add('style-theme', 'style', '画布主题：内置配色与彩虹分支主题', { id: 'style-theme', text: '画布主题：内置配色与彩虹分支主题', markers: ['star'], style: { fill: '#fef3c7', color: '#78350f', shape: 'rounded' } });
  add('style-node', 'style', '节点样式：文字色、填充色、圆角 / 直角 / 胶囊形状');
  add('style-edge', 'style', '父子连线：颜色、粗细、实线 / 虚线 / 点线与箭头', { id: 'style-edge', text: '父子连线：颜色、粗细、实线 / 虚线 / 点线与箭头', style: { edgeColor: '#d97706', edgeWidth: '2', edgeStyle: 'dashed', edgeEndArrow: 'arrow' } });
  add('style-boundary', 'style', '边界框：将一个主题及其后代圈成语义分组', { id: 'style-boundary', text: '边界框：将一个主题及其后代圈成语义分组', boundary: { label: '可折叠的主题范围', color: '#16a34a' } });
  add('style-summary', 'style', '概要：为一组子节点添加括线与结论', { id: 'style-summary', text: '概要：为一组子节点添加括线与结论', summary: '分组结论' });
  add('style-markers', 'style', '标记徽章：优先级、星标、旗标与疑问标记', { id: 'style-markers', text: '标记徽章：优先级、星标、旗标与疑问标记', markers: ['priority-2', 'star', 'flag'] });

  add('relations', 'overview', '关系线与交叉引用', { id: 'relations', text: '关系线与交叉引用', notes: '父子连线表达树结构；关系线表达跨分支联系，两者可以同时存在。' });
  add('relations-create', 'relations', '关系线工具：依次选择起点和终点');
  add('relations-style', 'relations', '关系线支持标签、颜色、线型和起止箭头');
  add('relations-example', 'relations', '交叉关系示例：样式实验室也会用到文本样式功能', { id: 'relations-example', text: '交叉关系示例：样式实验室也会用到文本样式功能', markers: ['question'] });

  add('canvas', 'overview', '画布与视图', { id: 'canvas', text: '画布与视图', notes: '滚轮或触控板平移画布，Ctrl / Cmd + 滚轮缩放；也可拖动空白区域平移。' });
  add('canvas-layout', 'canvas', '四种布局：中心双侧导图、逻辑图、树形图、组织图');
  add('canvas-theme', 'canvas', '切换主题、隐藏网格、适配画布或回到 100%');
  add('canvas-zoom', 'canvas', '滚轮 / 触控板缩放与平移；拖动空白处平移，也可用工具栏缩放和适配内容');
  add('canvas-panels', 'canvas', '大纲与属性面板可折叠；全屏画布提供更大编辑空间');
  add('canvas-sheets', 'canvas', '底部工作表栏：一个文件容纳多个独立中心主题');
  add('canvas-properties', 'canvas', '属性面板编辑当前主题文字、备注、标签、链接、标记和样式');
  add('canvas-tools', 'canvas', '画布工具可切换选择与关系线；右键节点可新增、排序、复制、删除或装饰');

  add('output', 'overview', '导入、导出与分享', { id: 'output', text: '导入、导出与分享', boundary: { label: '文件与协作', color: '#d97706' } });
  add('output-import', 'output', '导入 Tau、XMind、FreeMind、OPML 和 Markdown 大纲');
  add('output-export', 'output', '导出 Tau、XMind、FreeMind、OPML、Markdown、SVG、PNG、JPEG 与 PDF');
  add('output-limit', 'output', '外部格式可能无法保留全部样式；导入预览会列出兼容与丢失字段');
  add('output-unsupported', 'output', 'MindManager（.mmap）和 MindNode（.mindnode）暂不支持导入');
  add('output-share', 'output', '保存为 .taumap；也可分享云端文档并查看历史版本');
  add('output-watermark', 'output', '部分免费导出带品牌水印；会员可配置水印权益');

  add('layout-root', null, '布局实验室：同一结构，四种视角', { id: 'layout-root', text: '布局实验室：同一结构，四种视角', notes: '点选本工作表后，使用顶部布局按钮比较导图、逻辑图、树形图和组织图。布局会保存在文档中。', markers: ['star'], style: { fill: '#dbeafe', color: '#1e3a8a', shape: 'rounded' } });
  add('layout-mindmap', 'layout-root', '导图：中心主题向左右展开，适合自由发散');
  add('layout-logic', 'layout-root', '逻辑图：所有层级向右展开，适合步骤与因果');
  add('layout-tree', 'layout-root', '树形图：正交连线，适合分类与目录');
  add('layout-org', 'layout-root', '组织图：自上而下排列，适合汇报关系');
  add('layout-preserve', 'layout-root', '切换布局只改变呈现方式，节点、备注、关系和样式仍保留');

  add('workflow-root', null, '实战工作流：从想法到交付', { id: 'workflow-root', text: '实战工作流：从想法到交付', notes: '这张工作表示范如何用多工作表拆分主题：规划、执行、复盘可各自维护一棵树。', markers: ['priority-1'], style: { fill: '#fee2e2', color: '#7f1d1d', shape: 'pill' } });
  add('workflow-plan', 'workflow-root', '规划：拆分目标、里程碑、风险与负责人');
  add('workflow-execute', 'workflow-root', '执行：用标签筛选状态，用标记突出优先级');
  add('workflow-review', 'workflow-root', '复盘：添加备注、跨节点关系与阶段总结');
  add('workflow-export', 'workflow-root', '交付：导出图片 / PDF 用于汇报，保留 .taumap 继续编辑');

  add('editor-root', null, 'Tau Editor 工作台：文本、代码与 Markdown', {
    id: 'editor-root', text: 'Tau Editor 工作台：文本、代码与 Markdown',
    notes: '第四张工作表把操作说明中的核心应用能力汇总成可编辑目录。试用快捷键、命令面板和右侧上下文面板时，可随时切回本表查看。',
    markers: ['star'], labels: ['应用功能地图'], style: { fill: '#dcfce7', color: '#14532d', shape: 'rounded' },
  });
  add('editor-files', 'editor-root', '文件与工作区：管理本地内容', { id: 'editor-files', text: '文件与工作区：管理本地内容', boundary: { label: '文件管理', color: '#16a34a' } });
  add('editor-new-open', 'editor-files', '新建、打开、保存与另存为；系统可通过“打开方式”打开文件');
  add('editor-tabs', 'editor-files', '多标签编辑：切换文件、右键标签执行关闭和文件操作');
  add('editor-explorer', 'editor-files', '文件资源管理器：浏览、新建文件夹、重命名、删除、刷新与文件对比');
  add('editor-quick-open', 'editor-files', '快速打开 Ctrl/Cmd + P：按名称定位工作区文件');
  add('editor-workspace-search', 'editor-files', '工作区搜索 Ctrl/Cmd + Shift + F：跨文件查找，预览后应用替换');

  add('editor-code', 'editor-root', '代码与纯文本：编写、定位和理解代码', { id: 'editor-code', text: '代码与纯文本：编写、定位和理解代码', boundary: { label: '编辑与导航', color: '#2563eb' } });
  add('editor-highlight', 'editor-code', '多语言语法高亮；状态栏可切换语言模式、编码和编辑器主题');
  add('editor-find', 'editor-code', '当前文件查找 Ctrl/Cmd + F；跳转行 Ctrl/Cmd + G');
  add('editor-symbols', 'editor-code', '支持的语言可搜索符号、跳转定义与引用、重命名并查看问题');
  add('editor-zoom', 'editor-code', '编辑器字号：Ctrl/Cmd + = 放大，Ctrl/Cmd + - 缩小，Ctrl/Cmd + 0 重置');
  add('editor-history', 'editor-code', '编辑历史：撤销与重做；自动保存行为可在设置中调整');

  add('editor-markdown', 'editor-root', 'Markdown：从编写到预览和发布', { id: 'editor-markdown', text: 'Markdown：从编写到预览和发布', boundary: { label: 'Markdown 工作流', color: '#d97706' } });
  add('markdown-toolbar', 'editor-markdown', '格式工具栏：标题、强调、列表、链接、图片、表格、代码块和 Mermaid');
  add('markdown-preview', 'editor-markdown', '预览模式：编辑、分栏、纯预览；预览区可缩放');
  add('markdown-context', 'editor-markdown', '上下文面板：文档大纲、任务清单、链接与引用检查');
  add('markdown-images', 'editor-markdown', '插入或粘贴图片时导入到文档旁的 assets/ 目录');
  add('markdown-html', 'editor-markdown', '从上下文面板将 Markdown 导出为独立 HTML 文件');
  add('markdown-scroll', 'editor-markdown', '宽代码块与表格支持横向浏览；底部辅助滚动条可用鼠标拖动');

  add('editor-command', 'editor-root', '命令面板与个性化：快速找到并调整功能', { id: 'editor-command', text: '命令面板与个性化：快速找到并调整功能', boundary: { label: '效率与设置', color: '#9333ea' } });
  add('editor-command-open', 'editor-command', 'F1 或 Ctrl/Cmd + Shift + P：搜索命令并查看可执行操作');
  add('editor-settings', 'editor-command', '设置 Ctrl/Cmd + ,：外观、编辑偏好、自动保存和快捷键');
  add('editor-shortcuts', 'editor-command', '快捷键可在设置中查看与自定义；也可通过命令面板执行同一操作');
  add('editor-themes', 'editor-command', '主题市场：浏览并应用外观主题');
  add('editor-context', 'editor-command', '右侧上下文面板根据当前文件展示大纲、Markdown 任务与链接、工作区或 Git 信息');
  add('editor-recovery', 'editor-command', '本地文件与云文档可结合自动保存、同步和版本历史管理');
  add('editor-cloud', 'editor-command', '云文档支持同步、分享和查看历史版本；云端能力按账号权限开放');

  const document: MindMapDocument = {
    format: MINDMAP_FORMAT,
    schemaVersion: 1,
    id: 'tau-editor-welcome-mindmap',
    title: 'Tau Editor 思维导图功能全景',
    rootTopicId: 'overview',
    layoutMode: 'mindmap',
    themeId: 'rainbow',
    topics,
    relations: [
      { id: 'relation-format-style', sourceTopicId: 'content-format', targetTopicId: 'style-node', label: '格式能力', lineStyle: 'dashed', endArrow: 'arrow' },
      { id: 'relation-image-export', sourceTopicId: 'content-image', targetTopicId: 'output-export', label: '配图可随画布导出', lineStyle: 'dotted' },
      { id: 'relation-layout-sheets', sourceTopicId: 'canvas-layout', targetTopicId: 'canvas-sheets', label: '视图组织', lineStyle: 'solid', startArrow: 'arrow' },
    ],
    sheets: [
      { id: 'sheet-overview', title: '功能总览', rootTopicId: 'overview' },
      { id: 'sheet-layout', title: '布局实验室', rootTopicId: 'layout-root' },
      { id: 'sheet-workflow', title: '实战工作流', rootTopicId: 'workflow-root' },
      { id: 'sheet-editor', title: '应用功能地图', rootTopicId: 'editor-root' },
    ],
    opaqueExtensions: {
      [MINDMAP_IMAGE_NODES_EXTENSION]: {
        version: MINDMAP_IMAGE_NODES_VERSION,
        nodes: [{ id: 'welcome-logo-image', topicId: 'content-image', src: TAU_ICON, alt: 'Tau Editor 图标', width: 96, height: 96, objectFit: 'contain' }],
      },
    },
  };

  return document;
}
