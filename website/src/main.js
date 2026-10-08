import './style.css'

const features = [
  ['01', '专注写作', '清爽的工作台、可靠的标签页与自动保存，让每一次输入都保持连贯。'],
  ['02', '为代码而生', 'Monaco Editor 驱动的语法高亮、多光标、折叠和 50+ 语言支持。'],
  ['03', 'Markdown 原生体验', '边写边预览，文档大纲、任务清单和链接状态都在一个工作区里。'],
]

const capabilities = [
  ['⌘', '命令面板', '常用操作、文件跳转和工作区命令，一个快捷键即可触达。'],
  ['◐', 'Markdown 预览', '编辑与预览并排工作，文档结构一眼可读。'],
  ['⌁', '工作区上下文', '文件树、标签页、任务与链接状态保持在同一条工作流。'],
  ['◫', '主题与快捷键', '主题包、快捷键、圆角和配色都可以按自己的习惯调整。'],
]

const releases = [
  {
    version: 'v0.6.11', date: '2026-10-08', label: '工作台导航与编辑器上下文', category: '编辑器体验', latest: true,
    summary: '更新安装体验、macOS 工作台导航、编辑器路径上下文和状态栏可访问性，并收口 Markdown 预览、图片预览、主题市场、工具栏与标签页交互。',
    highlights: ['新增编辑器路径面包屑，工作区、文件夹与文件可联动定位', 'macOS 标题栏支持返回/前进、Quick Open、命令面板、资源区、上下文栏和 Markdown 预览入口', '状态栏编码、语言模式和主题改为支持键盘导航的自绘选择器', 'Markdown 预览新增林间薄荷、雾紫信笺和深海蓝调风格并修复外链与主题同步', '更新包改为流式写入并显示下载进度，macOS 标题栏可触发匹配设备安装包下载'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.6.11',
    assets: [
      ['Tau.Editor-0.6.11-1.x86_64.rpm', 'https://github.com/kokotao/tau-editor/releases/download/v0.6.11/Tau.Editor-0.6.11-1.x86_64.rpm'],
      ['Tau.Editor_0.6.11_aarch64.dmg', 'https://github.com/kokotao/tau-editor/releases/download/v0.6.11/Tau.Editor_0.6.11_aarch64.dmg'],
      ['Tau.Editor_0.6.11_amd64.AppImage', 'https://github.com/kokotao/tau-editor/releases/download/v0.6.11/Tau.Editor_0.6.11_amd64.AppImage'],
      ['Tau.Editor_0.6.11_amd64.deb', 'https://github.com/kokotao/tau-editor/releases/download/v0.6.11/Tau.Editor_0.6.11_amd64.deb'],
      ['Tau.Editor_0.6.11_universal.dmg', 'https://github.com/kokotao/tau-editor/releases/download/v0.6.11/Tau.Editor_0.6.11_universal.dmg'],
      ['Tau.Editor_0.6.11_x64-setup.exe', 'https://github.com/kokotao/tau-editor/releases/download/v0.6.11/Tau.Editor_0.6.11_x64-setup.exe'],
      ['Tau.Editor_0.6.11_x64_zh-CN.msi', 'https://github.com/kokotao/tau-editor/releases/download/v0.6.11/Tau.Editor_0.6.11_x64_zh-CN.msi'],
    ].map(([name, url]) => ({ name, url })),
  },
  {
    version: 'v0.6.4', date: '2026-10-02', label: '三平台发布与官网动态同步', category: '稳定性', latest: false,
    summary: '补齐 macOS、Windows、Linux 六类安装包，并让官网更新日志自动同步 GitHub Releases，减少手动维护遗漏。',
    highlights: ['修复 CI 类型库兼容问题，恢复三平台构建', '发布前校验 tag 与应用版本一致', '构建后校验 DMG、DEB、AppImage、RPM、MSI、EXE 六类资产', '官网按公开 GitHub Release 动态展示版本、摘要和下载资产', 'GitHub API 不可用时自动回退内置版本记录'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.6.4',
  },
  {
    version: 'v0.6.3', date: '2026-10-02', label: '编辑器导航与图片预览', category: '编辑器体验',
    summary: 'Markdown 工具栏完成 SVG 图标、快捷插入、快捷键、图片粘贴和代码块语言选择，编辑体验更接近成熟 Markdown 编辑器。',
    highlights: ['H1-H6 标题下拉与显眼 SVG 工具图标', '图片、表格、分割线、折叠块、Mermaid、目录和时间戳快捷插入', 'Ctrl+B / Ctrl+I 双向加粗斜体组合快捷键', '剪贴板图片写入文档同级 assets 并使用相对路径', '代码块语言选择、自定义语言、撤销与重做可用'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.6.3',
  },
  {
    version: 'v0.6.2', date: '2026-10-02', label: '资源区与编辑器稳定性', category: '编辑器体验',
    summary: '补齐资源区信息展示、Markdown 二级菜单、图片预览和代码导航能力，让工作区在真实使用中更稳定。',
    highlights: ['资源区空状态静默展示，文件信息支持横向查看', '修复 Markdown 右键分类二级菜单被裁剪、悬浮不出现的问题', '图片文件直接渲染预览，避免将二进制内容显示为源码', '代码文件支持已打开模型之间的类、接口、函数和方法跳转', 'Hover 显示符号签名与引用数量'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.6.2',
  },
  {
    version: 'v0.6.1', date: '2026-09-30', label: 'Markdown 编辑器工具链', category: '编辑器体验',
    summary: '补齐 Markdown 工具栏、快捷插入、快捷键、图片粘贴和代码块语言选择，编辑体验更接近成熟 Markdown 编辑器。',
    highlights: ['标题、粗体、斜体、引用、列表、代码、链接和图片使用清晰 SVG 图标', '支持表格、分割线、折叠块、Mermaid、目录和时间戳快捷插入', 'Ctrl+B 与 Ctrl+I 可按任意顺序组合为加粗斜体', '复制粘贴图片自动保存到文档同级 assets 目录并写入相对路径', '代码块支持常用语言选择和自定义语言输入', '标题、撤销与重做按钮恢复真实可用状态'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.6.1',
  },
  {
    version: 'v0.6.0', date: '2026-09-29', label: '主题市场与外观自定义', category: '主题与外观',
    summary: '主题市场成为独立工作区，主题包、源码查看、颜色配置与圆角设置可以在一个连贯的流程里完成。',
    highlights: ['主题市场独立为左侧菜单栏目', '主题卡片支持仓库跳转与原始 JSON 弹窗', '主题包与自定义配色支持标签、选择项和状态色配置', '新增全局圆角配置并同步到工作台', '主题切换时顶部栏、编辑器和标签状态保持联动'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.6.0',
  },
  {
    version: 'v0.5.0', date: '2026-09-28', label: '主题模式与主题市场', category: '主题与外观',
    summary: '主题模式、双模式主题包与 GitHub 主题市场正式加入 Tau。',
    highlights: ['浅色与深色各 5 组主题色块', '主题包 v2 支持 light / dark 双模式', '主题市场支持搜索、筛选、安装、缓存与源码查看', '自定义配色与 Monaco 配色保持同步'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.5.0',
  },
  {
    version: 'v0.4.3', date: '2026-09-28', label: 'Markdown 图表与主题可读性', category: '主题与外观',
    summary: '扩展 Mermaid 图表识别范围，修复宽屏工作台布局并加强主题对比度保护。',
    highlights: ['支持流程图、时序图、类图、甘特图、Sankey、Kanban 等 Mermaid 类型', '宽屏工作台边缘对齐，移除多余留白', '明暗模式自动匹配 Monaco 基底主题', '正文与背景自动进行可读性保护'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.4.3',
  },
  {
    version: 'v0.4.2', date: '2026-09-26', label: '微圆角与 macOS 签名修复', category: '主题与外观',
    summary: '建立克制的微圆角体系，并修复 macOS 产物可能被系统判定为已损坏的问题。',
    highlights: ['统一 0 / 2 / 4 / 6 / 8px 圆角体系', '工具栏、标签和工作区保持平角基线', 'macOS .app 完整 ad-hoc 签名', '支持 Developer ID 签名、公证与 staple 开关'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.4.2',
  },
  {
    version: 'v0.4.1', date: '2026-09-25', label: '工作台视觉与交互优化', category: '工作台体验',
    summary: '统一平角工作台、字号层级与标签交互，加入视觉回归基线。',
    highlights: ['标签悬浮详情、活动定位线与键盘导航', '未保存状态改为紧凑单行徽标', '设置、搜索、替换和通知统一视觉规范', '新增视觉基线采集命令'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.4.1',
  },
  {
    version: 'v0.4.0', date: '2026-09-22', label: '可定制、可比对、可扩展', category: '核心能力',
    summary: '主题包、快捷键自定义、Diff、多窗口和 Provider 扩展点完成首轮落地。',
    highlights: ['导入 / 导出主题包并同步 UI 与 Monaco', '录制改键、冲突检测与命令面板绑定提示', '只读 Monaco Diff，支持并排与内联模式', '多窗口标签迁移与主题、命令、文件动作 Provider'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.4.0',
  },
  {
    version: 'v0.3.3', date: '2026-09-22', label: '数据安全闭环', category: '核心能力',
    summary: '恢复库、文件监听、三方冲突和大文件事务让写作过程更可靠。',
    highlights: ['恢复库 v2 与启动工作区恢复', '外部修改冲突提示与三方 Diff', '大文件分段加载、取消、重试与原子保存', '搜索替换会话可取消并逐项反馈'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/tree/v0.3.3',
  },
  {
    version: 'v0.3.2', date: '2026-08-24', label: 'Windows 体验修复', category: '稳定性',
    summary: '修复 Windows 控制台闪窗，文件关联改为按需加载。',
    highlights: ['Git 子进程不再弹出黑色控制台窗口', '文件关联注册按需初始化', '保持桌面端启动稳定'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.3.2',
  },
  {
    version: 'v0.3.1', date: '2026-08-24', label: 'Windows 文件关联', category: '稳定性',
    summary: '修复 Windows 文件关联与运行时配置，补齐 Cargo.lock。',
    highlights: ['文件关联打开路径修复', '桌面运行时配置收口', '锁定 Rust 依赖版本'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.3.1',
  },
  {
    version: 'v0.3.0', date: '2026-07-16', label: '工作区 Runtime', category: '核心能力',
    summary: '快速打开、项目搜索、Git 上下文和 Markdown 导出让工作区开始成形。',
    highlights: ['工作区 Runtime 与快速打开', '项目范围搜索与 Git 上下文', 'Markdown 导出为独立 HTML', '恢复未保存草稿与光标状态'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.3.0',
  },
  {
    version: 'v0.2.6', date: '2026-07-16', label: '三栏工作台', category: '工作台体验',
    summary: '三栏工作台、Context Rail 和文档大纲带来更完整的写作空间。',
    highlights: ['三栏工作台与响应式侧栏', 'Context Rail 上下文栏', '文档大纲与任务聚合', 'macOS / Windows / Linux 桌面包'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.2.6',
  },
  {
    version: 'v0.2.5', date: '2026-04-12', label: '编辑器补全与同步', category: '核心能力',
    summary: '补齐编辑器补全、外部文件同步和 macOS 更新安装流程。',
    highlights: ['编辑器补全体验', '外部文件变更同步', 'macOS 更新安装支持'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/tree/v0.2.5',
  },
  {
    version: 'v0.2.4', date: '2026-04-12', label: 'Markdown 预览主题', category: '主题与外观',
    summary: '新增四套 Markdown 预览阅读主题与右键切换入口。',
    highlights: ['docs-clean、paper-soft、editorial-warm、graphite-night', '设置面板与预览区右键均可切换', '修复右键菜单定位偏移'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/tree/v0.2.4',
  },
  {
    version: 'v0.2.3', date: '2026-03-28', label: '大文件与标签性能', category: '稳定性',
    summary: '大文件分段加载与保存，标签切换在长文档下保持流畅。',
    highlights: ['大文件分段加载与分段保存', '标签切换性能优化'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/tree/v0.2.3',
  },
  {
    version: 'v0.2.2', date: '2026-03-25', label: '桌面包版本收口', category: '稳定性',
    summary: '统一桌面包版本号，减少安装与升级时的识别歧义。',
    highlights: ['桌面包版本号统一'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/tree/v0.2.2',
  },
  {
    version: 'v0.2.1', date: '2026-03-23', label: '设置与自动更新', category: '工作台体验',
    summary: '设置工作区重构，加入自动更新、文件关联和标签内存护栏。',
    highlights: ['设置工作区重构', '自动更新与文件关联', '标签内存护栏'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/tree/v0.2.1',
  },
  {
    version: 'v0.2.0', date: '2026-03-23', label: '桌面端基线', category: '核心能力',
    summary: '作者与捐赠信息、新应用图标和三平台打包正式建立。',
    highlights: ['作者与捐赠信息内置', '新应用图标', 'macOS、Windows、Linux 三平台打包'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/tree/v0.2.0',
  },
  {
    version: 'v0.1.0', date: '2026-03-23', label: '首个公开版本', category: '核心能力',
    summary: 'Tau Editor 首个公开 Release，完成命名与贡献入口统一。',
    highlights: ['Tau Editor 命名统一', '作者与捐赠入口'],
    releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.1.0',
  },
]

const githubReleasesApi = 'https://api.github.com/repos/kokotao/tau-editor/releases'
const releaseCategoryOrder = ['编辑器体验', '主题与外观', '工作台体验', '核心能力', '稳定性']

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const stripMarkdown = (value) => String(value ?? '')
  .replace(/```[\s\S]*?```/g, '')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[`*_~>#]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const extractReleaseHighlights = (body) => {
  const lines = String(body ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const bullets = lines
    .filter((line) => /^(?:[-*+]\s+|\d+[.)]\s+)/.test(line))
    .map((line) => stripMarkdown(line.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '')))
    .filter(Boolean)
  if (bullets.length) return [...new Set(bullets)]
  return [...new Set(lines
    .filter((line) => !/^#{1,6}\s/.test(line) && !/^```/.test(line))
    .map(stripMarkdown)
    .filter(Boolean))].slice(0, 8)
}

const extractReleaseSummary = (body, highlights) => {
  const paragraphs = String(body ?? '').split(/\r?\n\s*\r?\n/)
    .map(stripMarkdown)
    .filter((paragraph) => paragraph && !/^(?:[-*+]\s+|\d+[.)]\s+)/.test(paragraph))
  return paragraphs[0] || highlights[0] || '查看 GitHub 发布页面了解本版本的完整更新内容。'
}

const inferReleaseCategory = (release) => {
  const text = `${release.name || ''} ${release.body || ''}`.toLowerCase()
  if (/主题|外观|圆角|颜色|配色|theme|appearance/.test(text)) return '主题与外观'
  if (/编辑器|markdown|图片|代码|导航|工具栏|快捷键|预览|mermaid/.test(text)) return '编辑器体验'
  if (/修复|稳定|签名|性能|安全|fix|stability/.test(text)) return '稳定性'
  if (/工作台|设置|标签|资源|文件|窗口|workspace|settings/.test(text)) return '工作台体验'
  return '核心能力'
}

const semverParts = (version) => {
  const match = String(version ?? '').match(/(\d+)\.(\d+)\.(\d+)/)
  return match ? match.slice(1).map(Number) : null
}

const compareReleaseVersions = (left, right) => {
  const leftParts = semverParts(left.version)
  const rightParts = semverParts(right.version)
  if (leftParts && rightParts) {
    for (let index = 0; index < 3; index += 1) {
      if (leftParts[index] !== rightParts[index]) return rightParts[index] - leftParts[index]
    }
  } else if (leftParts) {
    return -1
  } else if (rightParts) {
    return 1
  }
  return String(right.publishedAt).localeCompare(String(left.publishedAt))
}

const inferAssetPlatform = (assetName) => {
  const name = String(assetName ?? '').toLowerCase()
  if (/\.(?:exe|msi)$/i.test(name) || /(?:windows|win32|win64|x64-setup|x64_zh)/i.test(name)) return 'Windows'
  if (/\.(?:dmg|pkg)$/i.test(name) || /(?:macos|darwin|universal|apple|arm64\.dmg|amd64\.dmg)/i.test(name)) return 'macOS'
  if (/\.(?:deb|rpm|appimage)$/i.test(name) || /(?:linux|ubuntu|debian|fedora|appimage)/i.test(name)) return 'Linux'
  return null
}

const normalizeGithubRelease = (release) => {
  const version = release.tag_name || release.name || '未知版本'
  const highlights = extractReleaseHighlights(release.body)
  const title = stripMarkdown(release.name || '')
    .replace(/^Tau Editor\s*/i, '')
    .replace(new RegExp(`^${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-:]?\\s*`, 'i'), '')
  return {
    version,
    date: String(release.published_at || release.created_at || '').slice(0, 10) || '未知日期',
    publishedAt: release.published_at || release.created_at || '',
    label: title || '版本更新',
    category: inferReleaseCategory(release),
    summary: extractReleaseSummary(release.body, highlights),
    highlights,
    releaseUrl: release.html_url || `https://github.com/kokotao/tau-editor/releases/tag/${encodeURIComponent(version)}`,
    assets: Array.isArray(release.assets) ? release.assets
      .filter((asset) => asset?.name && asset?.browser_download_url)
      .map((asset) => ({
        name: asset.name,
        url: asset.browser_download_url,
        platform: inferAssetPlatform(asset.name),
      })) : [],
  }
}

const normalizeGithubReleases = (items) => items
  .filter((release) => release && !release.draft && !release.prerelease && release.tag_name)
  .map(normalizeGithubRelease)
  .sort(compareReleaseVersions)
  .map((release, index) => ({ ...release, latest: index === 0 }))

const renderReleaseFilters = (items) => {
  const categories = [...new Set(items.map((release) => release.category))]
    .sort((left, right) => {
      const leftIndex = releaseCategoryOrder.indexOf(left)
      const rightIndex = releaseCategoryOrder.indexOf(right)
      return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex)
    })
  return ['全部', ...categories].map((category, index) => `<button class="release-filter${index === 0 ? ' active' : ''}" data-release-filter="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('')
}

const releasePlatformOrder = ['Windows', 'macOS', 'Linux']

const renderReleaseAssetTables = (assets) => {
  const groups = releasePlatformOrder
    .map((platform) => ({ platform, assets: assets.filter((asset) => (asset.platform || inferAssetPlatform(asset.name)) === platform) }))
    .filter((group) => group.assets.length)

  if (!groups.length) return ''

  const installAssets = groups.reduce((total, group) => total + group.assets.length, 0)
  return `<section class="release-downloads" aria-label="安装包下载"><div class="release-downloads-heading"><span>安装包</span><small>按系统整理 · ${installAssets} 个桌面安装包</small></div><div class="release-download-tables">${groups.map(({ platform, assets: platformAssets }) => `<div class="release-download-group"><div class="release-download-group-heading"><span class="platform-dot platform-${platform.toLowerCase().replace(/[^a-z]+/g, '-')}" ></span><strong>${escapeHtml(platform)}</strong><small>${platformAssets.length} 个安装包</small></div><div class="release-download-table-wrap"><table class="release-download-table"><thead><tr><th scope="col">文件名</th><th scope="col">类型</th><th scope="col"><span class="sr-only">操作</span></th></tr></thead><tbody>${platformAssets.map((asset) => `<tr><td><span class="asset-name" title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</span></td><td><span class="asset-type">${escapeHtml(asset.name.split('.').pop()?.toUpperCase() || 'FILE')}</span></td><td><a class="asset-download" href="${escapeHtml(asset.url)}" target="_blank" rel="noreferrer" download aria-label="下载 ${escapeHtml(asset.name)}">下载 <span aria-hidden="true">↗</span></a></td></tr>`).join('')}</tbody></table></div></div>`).join('')}</div></section>`
}

const renderReleaseCards = (items) => items.map((release) => {
  const assets = Array.isArray(release.assets) ? release.assets : []
  const highlights = Array.isArray(release.highlights) ? release.highlights : []
  return `<article class="release-card ${release.latest ? 'latest' : ''}" data-release-category="${escapeHtml(release.category)}"><div class="release-marker"><span></span></div><div class="release-card-body"><div class="release-meta"><span class="release-version">${escapeHtml(release.version)}</span><time datetime="${escapeHtml(release.date)}">${escapeHtml(release.date)}</time><span class="release-category">${escapeHtml(release.category)}</span>${release.latest ? '<b class="release-latest">当前版本</b>' : ''}</div><div class="release-title-row"><h3>${escapeHtml(release.label)}</h3><a href="${escapeHtml(release.releaseUrl)}" target="_blank" rel="noreferrer" aria-label="查看 ${escapeHtml(release.version)} 发布详情">查看发布 ↗</a></div><p class="release-summary">${escapeHtml(release.summary)}</p><details${release.latest ? ' open' : ''}><summary>查看本版本更新 <span>＋</span></summary><ul>${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>${assets.length ? renderReleaseAssetTables(assets) : ''}</div></article>`
}).join('')

const renderReleaseSection = (items) => {
  const filterRoot = document.querySelector('.release-filters')
  const listRoot = document.querySelector('.release-list')
  if (!filterRoot || !listRoot) return
  filterRoot.innerHTML = renderReleaseFilters(items)
  listRoot.innerHTML = renderReleaseCards(items)
  document.querySelector('[data-current-version]')?.replaceChildren(items[0]?.version || releases[0].version)
  bindReleaseFilters()
}

let activeReleaseFilter = '全部'
const bindReleaseFilters = () => {
  document.querySelectorAll('.release-filter').forEach((button) => button.addEventListener('click', () => {
    activeReleaseFilter = button.dataset.releaseFilter || '全部'
    document.querySelectorAll('.release-filter').forEach((item) => item.classList.toggle('active', item === button))
    document.querySelectorAll('.release-card').forEach((card) => {
      card.hidden = activeReleaseFilter !== '全部' && card.dataset.releaseCategory !== activeReleaseFilter
    })
  }))
}

const fetchGithubReleases = async () => {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  try {
    const releases = []
    for (let page = 1; ; page += 1) {
      const response = await fetch(`${githubReleasesApi}?per_page=100&page=${page}`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`GitHub Releases 请求失败：${response.status}`)
      const pageItems = await response.json()
      if (!Array.isArray(pageItems)) throw new Error('GitHub Releases 返回数据格式错误')
      releases.push(...pageItems)
      if (pageItems.length < 100) break
    }
    return normalizeGithubReleases(releases)
  } finally {
    window.clearTimeout(timeout)
  }
}

document.querySelector('#app').innerHTML = `
  <main class="site-shell">
    <header class="nav container">
      <a class="brand" href="#top" aria-label="Tau Editor 首页"><span class="mark">τ</span><span>Tau <b>Editor</b></span></a>
      <nav aria-label="主导航"><a href="#features">功能</a><a href="#preview">预览</a><a href="#releases">更新日志</a><a href="#contact">联系我</a><a href="https://github.com/kokotao/tau-editor" target="_blank" rel="noreferrer">GitHub ↗</a></nav>
      <a class="nav-download" href="https://github.com/kokotao/tau-editor/releases" target="_blank" rel="noreferrer">下载 Tau</a>
    </header>

    <section id="top" class="hero container">
      <div class="hero-copy"><p class="eyebrow"><span></span> 开源 · 跨平台 · 为专注而造</p><h1>把想法写下来，<em>让代码流动。</em></h1><p class="lede">Tau 是一款轻量、快速、懂你的现代文本编辑器。把复杂藏在幕后，把专注留给你。</p><div class="actions"><a class="button primary" href="https://github.com/kokotao/tau-editor/releases" target="_blank" rel="noreferrer">立即下载 <b>↗</b></a><a class="button secondary" href="#preview">看看它如何工作 <b>↓</b></a></div><div class="meta"><span data-current-version>${releases[0].version}</span><i></i><span>MIT License</span><i></i><span>macOS · Windows · Linux</span></div></div>
      <div class="hero-art" aria-label="Tau Editor 编辑器概念预览"><div class="grid"></div><div class="code-window"><div class="window-bar"><span class="dots"><i></i><i></i><i></i></span><span>welcome.md</span><span class="saved">● saved</span></div><div class="code-body"><span class="numbers">01<br>02<br>03<br>04<br>05<br>06<br>07<br>08</span><code><span>#</span> Make space for<br><strong>your next idea.</strong><br><br><small>A calm place to write,<br>think, and build.</small><br><em>— Tau Editor</em></code></div><div class="window-foot"><span>Markdown</span><span>Ln 8, Col 16</span></div></div><div class="note"><b>⌘</b><span><strong>Command palette</strong><small>Everything within reach</small></span></div></div>
    </section>

    <section class="manifesto container"><p>好的工具不会打断你。</p><p>它会在你需要时，<strong>安静地出现。</strong></p></section>

    <section id="features" class="features container reveal"><p class="eyebrow">THE TAU WAY</p><h2>少一点噪音，<br><em>多一点创造。</em></h2><div class="feature-grid"><div class="feature-list">${features.map(([num, title, body], index) => `<button class="feature ${index === 0 ? 'active' : ''}" data-index="${index}"><span>${num}</span><strong>${title}<small>${body}</small></strong><b>↗</b></button>`).join('')}</div><blockquote>“<br><span>编辑器应该消失在你的工作里，而不是成为工作本身。</span><small>— Tau design principle / 01</small></blockquote></div></section>

    <section class="capabilities container reveal"><div class="capability-intro"><p class="eyebrow">BUILT FOR THE FLOW</p><h2>每一个细节，<br><em>都在帮你前进。</em></h2><p>从第一次打开文件，到完成一次提交，Tau 把高频动作变成自然的节奏。现在，主题市场和可调节外观也加入了这条工作流。</p></div><div class="capability-grid">${capabilities.map(([icon, title, body]) => `<article class="capability"><span>${icon}</span><h3>${title}</h3><p>${body}</p></article>`).join('')}</div></section>

    <section id="preview" class="preview container reveal"><div><p class="eyebrow">A WORKSPACE THAT ADAPTS</p><h2>你的文件，<br><em>你的节奏。</em></h2><p>路径面包屑、标签页和沉浸式编辑区，把工作区上下文留在视线之内；从纯文本到完整项目，都能保持专注。</p><a class="text-link" href="https://github.com/kokotao/tau-editor" target="_blank" rel="noreferrer">在 GitHub 查看全部功能 ↗</a></div><figure><img src="./assets/editor.png" alt="Tau Editor v0.6.11 路径面包屑与沉浸式编辑工作区预览"><figcaption>Tau Editor · focused workspace with breadcrumbs</figcaption></figure></section>

    <section class="gallery container reveal"><div class="gallery-heading"><p class="eyebrow">A CLOSER LOOK</p><h2>把工作台，<br><em>带在手边。</em></h2></div><div class="gallery-grid"><figure><img src="./assets/markdown-preview.png" alt="Tau Editor v0.6.11 Markdown 分栏预览与文档上下文"><figcaption>Markdown preview · split editing and context</figcaption></figure><figure><img src="./assets/command-palette.png" alt="Tau Editor 命令面板与快速导航"><figcaption>Command palette · every action within reach</figcaption></figure><figure><img src="./assets/settings.png" alt="Tau Editor 主题、快捷键与语言服务设置"><figcaption>Settings · themes, keybindings and language services</figcaption></figure></div></section>

    <section id="releases" class="releases container reveal"><div class="release-heading"><div><p class="eyebrow">RELEASE NOTES</p><h2>每一次更新，<br><em>都值得被看见。</em></h2></div><p>更新日志自动同步 GitHub Releases，按公开 tag 排序展示；网络不可用时保留内置版本记录。</p></div><div class="release-sync-status" role="status" aria-live="polite" data-release-sync>内置版本记录 · 正在同步 GitHub Releases…</div><div class="release-filters" role="group" aria-label="筛选更新日志">${renderReleaseFilters(releases)}</div><div class="release-list">${renderReleaseCards(releases)}</div></section>

    <section class="platforms container reveal"><div><p class="eyebrow">ONE EDITOR, EVERY DESK</p><h2>在你选择的系统上，<br><em>保持同样顺手。</em></h2></div><div class="platform-list"><div><b>⌘</b><span>macOS<small>Apple Silicon</small></span></div><div><b>⊞</b><span>Windows<small>x64</small></span></div><div><b>◉</b><span>Linux<small>Deb · RPM · AppImage</small></span></div></div></section>

    <section class="faq container reveal"><div><p class="eyebrow">QUESTIONS, ANSWERED</p><h2>开始之前，<br><em>先了解 Tau。</em></h2></div><div class="faq-list"><details open><summary>Tau 是免费的吗？<span>+</span></summary><p>是。Tau Editor 以 MIT License 开源，你可以自由使用、修改和分发。</p></details><details><summary>支持哪些平台？<span>+</span></summary><p>当前支持 macOS、Windows 与 Linux，安装包可在 GitHub Releases 获取。</p></details><details><summary>我可以参与贡献吗？<span>+</span></summary><p>当然。欢迎通过 GitHub 提交 Issue、建议或 Pull Request。</p></details></div></section>

    <section id="contact" class="contact container reveal"><div class="contact-intro"><p class="eyebrow">SAY HELLO</p><h2>联系作者，<br><em>一起把 Tau 做得更好。</em></h2><p>欢迎反馈问题、分享使用体验，或加入 QQ 群参与交流。</p></div><div class="contact-list"><a class="contact-item" href="mailto:480199976@qq.com"><span class="contact-label">作者</span><strong>Albert_Luo</strong><span class="contact-arrow" aria-hidden="true">↗</span></a><a class="contact-item" href="mailto:480199976@qq.com"><span class="contact-label">邮箱</span><strong>480199976@qq.com</strong><span class="contact-arrow" aria-hidden="true">↗</span></a><a class="contact-item" href="https://github.com/kokotao/tau-editor" target="_blank" rel="noreferrer"><span class="contact-label">开源地址</span><strong>github.com/kokotao/tau-editor</strong><span class="contact-arrow" aria-hidden="true">↗</span></a><a class="contact-item contact-qq" href="https://qm.qq.com/cgi-bin/qm/qr?group_code=1091775563" target="_blank" rel="noreferrer" data-qq-app-link="mqqapi://card/show_pslcard?src_type=internal&version=1&uin=1091775563&card_type=group&source=qrcode" data-qq-group="1091775563"><span class="contact-label">QQ 交流群</span><strong>1091775563 <small>点击唤起 QQ 加群</small></strong><span class="contact-arrow" aria-hidden="true">↗</span></a></div></section>

    <section class="download container"><div><p class="eyebrow">READY WHEN YOU ARE</p><h2>从今天开始，<br><em>写得更自在。</em></h2></div><a class="button light" href="https://github.com/kokotao/tau-editor/releases" target="_blank" rel="noreferrer">获取 Tau Editor <b>↗</b></a></section>
    <footer class="footer container"><a class="brand" href="#top"><span class="mark">τ</span><span>Tau <b>Editor</b></span></a><span>作者：Albert_Luo · <a href="mailto:480199976@qq.com">480199976@qq.com</a></span><a href="https://github.com/kokotao/tau-editor" target="_blank" rel="noreferrer">GitHub ↗</a></footer>
  </main>
`

document.querySelectorAll('.feature').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.feature').forEach((item) => item.classList.remove('active'))
  button.classList.add('active')
}))

bindReleaseFilters()

const qqGroupLink = document.querySelector('[data-qq-app-link]')
qqGroupLink?.addEventListener('click', (event) => {
  const appLink = qqGroupLink.dataset.qqAppLink
  if (!appLink) return
  event.preventDefault()
  const fallbackLink = qqGroupLink.href
  const startedAt = Date.now()
  window.location.href = appLink
  window.setTimeout(() => {
    if (!document.hidden && Date.now() - startedAt < 1800) window.location.href = fallbackLink
  }, 900)
})

fetchGithubReleases()
  .then((items) => {
    if (!items.length) throw new Error('没有可展示的公开 Release')
    renderReleaseSection(items)
    const status = document.querySelector('[data-release-sync]')
    if (status) status.textContent = `已同步 ${items.length} 个公开版本 · 来源 GitHub Releases`
    if (activeReleaseFilter !== '全部') {
      [...document.querySelectorAll('.release-filter')]
        .find((button) => button.dataset.releaseFilter === activeReleaseFilter)?.click()
    }
  })
  .catch((error) => {
    console.warn('[Tau website] GitHub Releases 动态同步失败，继续使用内置版本记录。', error)
    const status = document.querySelector('[data-release-sync]')
    if (status) status.textContent = 'GitHub Releases 暂时不可用 · 当前显示内置版本记录'
  })

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible')
      revealObserver.unobserve(entry.target)
    }
  })
}, { threshold: 0.14 })
document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element))

const pointer = document.querySelector('.hero-art')
pointer?.addEventListener('pointermove', (event) => {
  const rect = pointer.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width - 0.5
  const y = (event.clientY - rect.top) / rect.height - 0.5
  pointer.style.setProperty('--mx', `${x * 10}px`)
  pointer.style.setProperty('--my', `${y * 8}px`)
})
pointer?.addEventListener('pointerleave', () => {
  pointer.style.setProperty('--mx', '0px')
  pointer.style.setProperty('--my', '0px')
})

const qqContact = document.querySelector('.contact-qq')
qqContact?.addEventListener('click', (event) => {
  const appLink = qqContact.dataset.qqAppLink
  const webLink = qqContact.href
  if (!appLink) return
  event.preventDefault()

  const fallback = window.setTimeout(() => {
    if (document.visibilityState === 'visible') {
      window.open(webLink, '_blank', 'noopener,noreferrer')
    }
  }, 900)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      window.clearTimeout(fallback)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.location.href = appLink
})
