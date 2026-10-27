# Stitch 云文档设计稿规格（SPEC）

源：Stitch 项目 `17516404595924263625`。三份 HTML 原文同目录：`cloud-doc-browser.html` / `cloud-sync-settings.html` / `explorer-cloud-doc.html`
（均由 `mcp__stitch__download_file` 的 `fileEntries/html` 取得；裁剪说明写在各自文件头：只删装饰性 `<svg>` 内部路径、演示用 `<script>` 与填充正文，**结构 / class / 文案 / 颜色配置值全保留**）。本文件可直接实现，无需回读 HTML。
## 0. 全局：三份稿子实际是三套 token（必须先统一）

| 稿件 | 画布 | 颜色体系（稿内原文） | 字体 | 基准字号 |
|---|---|---|---|---|
| 云文档浏览弹窗 | 2560×2048 | Tailwind `obsidian`(#090a0f/#0d0e16/#12131b/#161722/#1e202e/#282b3d) + `tau`(cyan #38bdf8, emerald #34d399, indigo #818cf8, purple #c084fc, amber #fbbf24, rose #f43f5e) | sans **Inter**, mono **JetBrains Mono** | 12px |
| 设置-云同步 | 2560×2846 | Material-3 风格：`surface #12131b`、`-container-lowest #0d0e16`、`-low #1a1b23`、`#1e1f28`、`-high #292932`、`-highest #33343d`、`outline #87929a`、`outline-variant #3e484f`、`primary #8ed5ff`、`primary-container #38bdf8`、`tertiary #56e5a9`、`error #ffb4ab` | **Geist** + **JetBrains Mono** | 14px |
| 资源管理器-云端文档 | 2560×2048 | Tailwind `brand`(#0a0b10/#0d0e16/#12131b/#1a1b24/#21222e/#2a2b3d/#36374e + cyan #38bdf8…)；状态栏自述 **“主题: 暗夜 (Nocturne)”** | 系统 CJK 栈 + **JetBrains Mono** | 13px |

三稿唯一共同锚点 = 主色 `#38bdf8`；第 3 稿状态栏给出主题名 **Nocturne**。落地采用单一 Nocturne Precision token（下表），忽略各稿命名。
### 0.1 Nocturne Precision → 项目 CSS 变量映射（改 `workbench-theme.css`，勿在组件写死）

| 设计语义 | 设计值 | 现项目变量 / 现值 | 建议 |
|---|---|---|---|
| 应用底·遮罩底 | `#0E0F17` | `--bg-app` `#0b1020` | 改 `#0E0F17` |
| 面板/侧栏/窗口底 | `#161826` | `--panel-base` `#101726` | 改 `#161826` |
| 卡片/弹窗主体 | `#1E2033` | `--panel-elevated` `#151d2d` | 改 `#1E2033` |
| 浮层：右键菜单·下拉·kbd·badge | `#262940` | `--panel-overlay` `rgba(13,19,34,.92)` | 改 `#262940`（不透明） |
| 描边弱 | `#262940` | `--border-soft` `rgba(148,163,184,.18)` | `rgba(50,54,83,.6)` |
| 描边强/面板边框 | `#323653` | `--border-strong` `rgba(148,163,184,.3)` | 改 `#323653` |
| 主色：选中·链接·焦点 | `#38BDF8` | `--accent-brand` `#7cc7ff` | 改 `#38BDF8` |
| 主色 hover（更亮） | `#7DD3FC` | `--accent-brand-strong` `#4dabff` | 改 `#7DD3FC` |
| 次色：渐变尾·tag | `#6366F1` | 无（稿内 indigo #818cf8 / #3131c0） | 新增 `--accent-secondary` |
| 成功·已同步·就绪 | `#10B981` | `--state-success` `#4ade80` | 改 `#10B981` |
| 警告·云端区强调（第3稿用琥珀标识云端） | `#F59E0B` | `--state-warning` `#fbbf24` | 改 `#F59E0B` |
| 错误·危险菜单项 | `#EF4444` | `--state-danger` `#f87171` | 改 `#EF4444` |
| 主文本 | `#F8FAFC` | `--text-primary` `#ecf2ff` | 改 `#F8FAFC` |
| 次文本 | `#94A3B8` | `--text-secondary` `#b6c2d9` | 改 `#94A3B8` |
| 弱文本·元信息·时间戳 | `#64748B` | `--text-muted` `#75829e` | 改 `#64748B` |
| 行 hover | `rgba(255,255,255,.08)` | `--surface-hover` 同值 | 不变 ✅ |
| 行选中底（主色 8–10%） | `rgba(56,189,248,.10)` | `--surface-active` `rgba(124,199,255,.14)` | 改 `rgba(56,189,248,.10)` |
| 控件底 | `rgba(255,255,255,.04)` | `--surface-muted` 同值 | 不变 ✅ |
| 圆角：控件/行/tag = 6px | 6 | `--radius-control` 5px | 改 6px |
| 圆角：面板/输入/按钮 = 8px | 8 | `--radius-base` 6 / `--radius-panel` 8 | 行与控件 6、面板 8 |
| 圆角：弹窗/卡片/大面板 = 12px | 12 | `--radius-dialog` 10px | 改 12px（弹窗外壳稿为 16px，见 §1.1） |
| 字体 UI | Geist | `--font-ui` `'Manrope Variable',…` | 首项改 `'Geist Variable','Geist'` |
| 字体等宽 | JetBrains Mono | `--font-code` ✅ | 不变 ✅ |
### 0.2 字号阶梯（稿内 Geist token 原文换算）

| 语义 | 稿内 token | 值 | 映射 |
|---|---|---|---|
| 大标题 | `headline-lg` | 28px/36px/-0.02em/600 | 设置页 H1 |
| 卡片标题 | `headline-sm` | 16.8px/24px/-0.01em/500（稿内写死 1.05rem） | 面板标题 |
| 正文 | `body-md` | 14px/24px/400 | 列表主文本 |
| 小正文 | `body-sm` | 13px/20px/400 | 说明文字 |
| 元信息等宽 | `code-meta` | 12px/16px/0.02em/400 | 大小·时间·版本号 |
| 标签等宽 | `label-sm` | 11px/14px/0.03em/500 | 列头·分区标题 |
| 按钮 | `label-md` | 13px/18px/0.01em/500 | 按钮文字 |

现项目 `--font-size-ui-base: 11px`（xs10/sm11/md12/lg14）偏小；建议 base 提到 12px、行高 1.5、等宽元信息 11.5–12px。
## 1. 云文档浏览弹窗（cloud-doc-browser.html）
### 1.1 结构树

```
section 外壳: max-w 1400 / h 92vh / max-h 960 / radius 16px / 底 #161826 95% / 边框 slate-700 50%
  shadow: 0 25px 60px -15px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.08); backdrop blur(28px) saturate(190%)
├ header 标题栏 h56 px16–20 border-b 底 #12131b/60
│  ├ 左: mac 三点 12px gap8 │ 1px 竖线 h16 │ 云图标16 + H1「云端文档」14/600
│  │    + 绿胶囊「共 6 个文件 · 云端匹配 6 条」(11–12px mono, 6px 脉冲点) + 「已用容量 54.3 KB / 5 GB · 延迟 12ms」(12px mono,<xl 隐藏)
│  └ 右: 搜索 w256/320 h32 pl32 pr48 r8 + ⌘K │ 刷新 │ 新建分类 │ 上传文档(主色) │ 关闭 32×32
├ body flex divide-x #1e293b/80
│  ├ aside 导航 w256 底 #0d0e16/60 p14
│  │   ├ 工作空间(标题 11px mono 大写 + 右「Cloud Pro」10px) → 个人云空间 / 团队分享空间(选中) / 归档与历史备份
│  │   ├ 文件目录树(标题+折叠按钮) → 分享(展开,徽标6) ▸ ml16 pl8 border-l: 分享子项(选中,徽标6)/技术方案文档(2)/自动化脚本与配置(3)
│  │   ├ 标签筛选 → #量化交易 #提示工程 #Python部署 #生产寄存器
│  │   └ 底栏 p12 border-t: Tau Sync Engine ● │ 54.3 KB / 5 GB │ 进度条 h6 │ 双向同步就绪 · 存储设置 ↗
│  ├ main flex-1
│  │   ├ 子头 h44 px16 border-b: 面包屑 云端根目录/分享/分享子项 + 格式 chips「全部(6) Markdown(3) Word(1) 代码脚本(2)」(11px,选中底 #282b3d)
│  │   │  + 视图切换(列表/磁贴, 28px 方按钮组)
│  │   ├ 表头 grid-cols-12 px16 py8 11px mono 大写 tracking-wider 底 #0d0e16/80
│  │   ├ 行列表 flex-1 overflow-y divide-y #1e293b/40 ; 行: grid-cols-12 items-center px16 py10 12px  → 约 40px 行高
│  │   └ 底栏 h36 px16 border-t: 当前目录: /分享/分享子项 │ 已选定 1 个项目 │ ✓ 所有变更均已安全同步至云端集群
│  └ aside 检查器 w320(<xl 隐藏) 底 #12131b/50
│      ├ p16 border-b: 徽标「Markdown 文档」+「云端同步中」; H2 文件名 14/600; 创建者 · SHA-256
│      ├ p16 border-b: 主按钮「在 Tau Editor 中打开编辑」h34 主色; 两列次级「下载副本」「分享链接」h30
│      ├ p16 border-b: 实时快照摘要(mono 12px 代码块)
│      └ p16: 版本记录时间线(2.5px 点 + ring4 + 竖线)
└ 列宽 12 栅格: 文件名 5 │ 大小 2(右对齐 pr16) │ 版本 1(居中) │ 云端更新时间 3 │ 操作 1(右对齐)
```
### 1.2 颜色与状态

| 元素 | 设计值（映射后变量） |
|---|---|
| 弹窗底 / 标题栏底 / 列表底 | `#161826` 95% / `#12131b` 60% / `#0d0e16` 40% |
| 主按钮「上传文档」「在 Tau Editor 中打开编辑」 | 底 `--accent-brand`(#38BDF8) 字 `#0f172a` 发光 `0 0 20px -3px rgba(56,189,248,.25)` |
| 次按钮（刷新/新建分类） | 底 `#161722`→hover `#1e202e` 边框 `#334155` 60% |
| 关闭按钮 hover | 底 rose 20% + 边框 rose 40% + 白字 |
| 行 hover | `--surface-hover`，文件名变主色 |
| 行选中 | 底 `rgba(56,189,248,.08)` + **左 2px 主色条** + hover 加深 .12；大小列变主色加粗；文件名旁绿 `Active` 徽标(9px) |
| 行操作区 | 默认 `opacity .6`，行 hover 时 `1`；「在编辑器中载入」hover 变主色 |
| 文件类型徽标 | MD 主色 / DOC 蓝 `#60a5fa` / PY amber / JSON 绿；统一 `px6 py2 r4 10px mono 700` |
| 版本徽标 | `rounded-full px6 py2 10px mono` 底 `#1e293b` 边 `#334155` 50% |
| 目录树选中项 | 底 主色 15% + 边框 主色 20% + 主色文字 |
| 树节点计数徽标 | `rounded-full px6 10px mono` |

**三态（设计稿未画，按 token 补齐，见 D5）** — 加载：居中主色 spinner 16px + `正在加载云端文档…` 12.5px `--text-secondary`；空态：48px 主色 20% 圆图标 + 主文本 + 11px `--text-muted` 副文本；错误态：图标 `--state-danger` + `打开失败：{message}` + 「重试」次级按钮。
**右键菜单**：浮层底 `#262940` 边 `#323653` r8 shadow `0 12px 32px rgba(0,0,0,.5)` min-w180/max-w280，项高 28–30px `px8 py6`，hover 底 `--surface-hover`，分隔线 `1px #323653` + `my4`，危险项文字/图标 `--state-danger`、hover 底 danger 14%。
### 1.3 界面文案（中文原文）

`云端文档` · `共 6 个文件 · 云端匹配 6 条` · `已用容量 54.3 KB / 5 GB · 延迟 12ms` · `搜索云端文档与全文...` · `⌘K` · `刷新云端数据`/`刷新` · `新建分类` · `上传文档` · `关闭窗口 (Esc)` · `工作空间` · `Cloud Pro` · `个人云空间` · `团队分享空间` · `归档与历史备份` · `文件目录树` · `全部折叠` · `分享` · `分享子项` · `技术方案文档` · `自动化脚本与配置` · `标签筛选` · `#量化交易` `#提示工程` `#Python部署` `#生产寄存器` · `Tau Sync Engine` · `54.3 KB / 5 GB` · `双向同步就绪` · `存储设置 ↗` · `云端根目录` · `全部 (6)` `Markdown (3)` `Word (1)` `代码脚本 (2)` · `详细列表视图`/`磁贴卡片视图` · `文件名称` `大小` `版本` `云端更新时间` `操作` · `在编辑器中载入`/`更多` · `Active` · `当前目录: /分享/分享子项` · `已选定 1 个项目` · `所有变更均已安全同步至云端集群` · `Markdown 文档` · `云端同步中` · `创建者: Tau Architect · SHA-256: 8f2a...90b4` · `在 Tau Editor 中打开编辑` · `下载副本` · `分享链接` · `实时快照摘要` · `版本记录 (Version History)` · `v2 · 当前生效` · `补充回测框架核心参数规范` · `v1 · 初始创建` · `从本地工作台初始化同步至云端`
示例数据：`镜像管理提示词.md`(v3,0 B) `经济相互依存性和贸易.md`(v4,3.0 KB) `量化学习路线.md`(v2,12.4 KB,选中) `qa-docx-190038.docx`(v1,36.6 KB) `setup.py`(v1,4.3 KB) `soft-registers.json`(v2,0 B)；时间格式 `2026/10/25 21:24:33`。
## 2. 设置-云同步（cloud-sync-settings.html）
### 2.1 结构树

```
header 固定顶栏 h40 px16 底 #0d0e16/90 + blur(24px) border-b #3e484f/30
│  左: mac 三点 12(红#ff5f56/黄#ffbd2e/绿#27c93f) │ 1px h12 │ logo h16 +「Tau」12px mono
│  中(绝对居中):「Tau 偏好设置 / Preferences」13px    右: 版本胶囊「v2.4.0-stable」11px mono │ 头像 32×32
aside 固定侧栏 w256 top40 bottom0 底 #0d0e16 border-r
│  分区标题「Preferences / 设置分类」11px 大写 tracking-wider
│  nav 7 项 px8 py6 r6 13px；选中=底 #38bdf8 字 #004965 500 shadow-sm（云同步项另加 6px 脉冲点）
│  底栏: ● System Daemon OK 11px │ Sync Latency 24ms(tertiary)
main pl256 pt40 底 #12131b max-w1440 内边距 px24 py32（md: px40 py40）
├ 区块0 页头 pb24 mb32: 面包屑「Preferences / Cloud Synchronization」11px 大写 tracking-widest
│    行: 2.5px 绿点(发光) + H1「云同步服务」28/36/600 + 胶囊「Lizi Sync Core v3」12px mono ; 副标题 13px
│    右: 「诊断节点链路」按钮(px12 py6 r8) │ 1px h24 │ 「TLS 1.3 · AES-GCM-256」胶囊
├ 区块1 Bento 遥测 4 卡 (lg 4 列 gap16 mb32): 当前运行版本 / 云端集群版本 / 本地环境架构 / 集群往返时延
│    卡片 p16 r12 底 #1a1b23 hover #1e1f28; 标题 11px 大写; 主值 20px mono 600 + 副徽标
└ 主栅格 12 列 gap32
   ├ 左列 span7 gap24
   │  ├ 卡片2 账号与配额 p24 r16 底 #1a1b23 shadow-md
   │  │    头部 pb20: 头像 48×48 r12 渐变 + 右下 16px 在线点 │ 用户名 16.8/600 + `PRO DEVELOPER` 徽标(11px mono)
   │  │              `UID: … · 凭据安全托管于 Windows Credential Manager` 12px mono │ 右: 切换账号 / 退出登录(danger 20% 底)
   │  │    配额块 mt8 p16 r12 底 #1e1f28: 标题 13px + `(8.0 GB 永久容量)` 12px mono + 右 `83.3 KB / 8.0 GB (0.01%)`
   │  │       进度条 h8 r-full 槽 #33343d, 填充 主色→#38bdf8→tertiary 渐变+发光; 下方图例 11px mono + 右「扩容方案 ↗」
   │  ├ 卡片3 文档调度中心 p24 r16: 标题行(sync 图标20 + 16.8/600) │ 右 `Idle / 就绪状态` 11px mono tertiary
   │  │    说明 13px mb20 → 三按钮条 grid3 gap12: 同步当前文档(主渐变 py12 px16 r12, hover 发光) / 从云端拉取 / 浏览云端文档(次级底 #1e1f28)
   │  │    反馈条 mt16 p12 r8 默认隐藏: spinner + `正在向集群同步当前索引分支...` 12px mono │ 右 `Task #0942`
   │  └ 卡片4 同步队列遥测 p24 r16: 标题 + 右胶囊 `0 项挂起 · 0 项阻塞`
   │       队列卡 p16 r12 底 #1e1f28: 36×36 r8 绿底图标 + `同步队列为空 (Queue Cleared)` 14px + 说明 13px │ 右: 重试失败项(disabled) + 36×36 刷新
   └ 右列 span5 gap24
      ├ 卡片5 自动化触发策略 p24 r16
      │    自动同步行 p16 r12 底 #1e1f28 mb16: 标题 14 + `Active` 徽标 │ 开关 44×24 r-full 关#33343d/开主色 滑块 20×20 top-left 2px
      │    防抖块 p16 r12: 标题 14 + 右 `3.00s` 12px mono 主色 │ 说明 13 │ 步进行: 36×36 减号 / 数字输入 h36 r8 居中 mono 聚焦 ring 主色 / 36×36 加号
      │    冲突块 p16 r12: 标题 + 16px 图标; 两个单选行 p8 r8 hover 底 #33343d/60: 主 13px + 副 12px #87929a
      ├ 卡片6 媒体资产与附件同步 p24 r16: 主复选行 p16 r12 (16×16 主色框 + 标题 14 + 说明 13, png/jpg/jpeg/gif/webp ≤20MB)
      │    缓存明细 p16 r12 space-y12: 两行 key 13 / value 12 mono │ 分隔后: 清理本地媒体缓存按钮 + 右 自动定期整理 11px
      └ 卡片7 安全徽标 p16 r12 底 #1a1b23/70: 32×32 主色 10% 图标 + 说明 12px #87929a
```

间距 token：`space-xs 4 / sm 8 / md 12 / lg 20 / xl 28`。圆角：外层 `rounded-2xl`=16、内层块 `rounded-xl`=12、控件 `lg`=8。
### 2.2 组件与状态

| 组件 | 状态 |
|---|---|
| 侧栏项 | 默认 13px `#bdc8d1`；hover 底 `#292932` 字主色；选中 底 `#38bdf8`/字 `#004965`/500 |
| 主 CTA | 渐变 primary→primary-container，字 `#004965`，hover 发光 `0 0 20px rgba(56,189,248,.4)`，active scale .98 |
| 次级按钮 | 底 `#1e1f28`→`#292932`，字 `#e3e1ed`，`active:scale-95` |
| 危险按钮 | 底 error 20%→40%，字 `#ffb4ab` |
| 禁用 | `opacity .6` + `cursor-not-allowed`（重试失败项） |
| 进度条 | 槽 8px `#33343d`，填充主色渐变+发光，实测 4% |
| 开关 | 44×24；关 `#33343d`、开 `#38bdf8`；滑块 20px，`border` 分隔 |
| 数字步进 | 36×36 按钮 hover `#383842`；输入底 `#0d0e16`、内阴影、聚焦 1px 主色环 |
| 单选/复选 | 主色 accent；行 hover 底 `#33343d` 60% |
| 加载态 | 反馈条 spinner + 主色文字；诊断按钮点击后文案 `探测链路中...` → `节点延时 14ms (极佳)` |
| 空态 | 队列为空卡片（绿勾 + `同步队列为空 (Queue Cleared)`） |
| 错误态 | 配额读取失败 → 文案位显示配额异常（`--state-danger`）；冲突态 → 卡片5 下展开冲突策略与保留两端选项 |
### 2.3 界面文案（中文原文）

`Tau 偏好设置 / Preferences` · `v2.4.0-stable` · `Preferences / 设置分类` · `通用与外观` · `主题市场` · `编辑器配置` · `云同步` · `文件关联` · `更新与版本` · `关于 Tau` · `System Daemon OK` · `Sync Latency` · `24ms` · `Preferences / Cloud Synchronization` · `云同步服务` · `Lizi Sync Core v3` · `基于端到端零知识加密协议（E2EE），实时守护并同步 Markdown 笔记与代码资产` · `诊断节点链路` · `TLS 1.3 · AES-GCM-256` · `当前运行版本` · `0.6.25` · `Stable` · `Hash: b8e41a9` · `无未结补丁` · `云端集群版本` · `0.6.13` · `已同步` · `通道: production-asia-east` · `本地环境架构` · `Windows / x86_64` · `NT Kernel 10.0 · AVX2` · `集群往返时延` · `16` · `ms` · `/ 0% 丢包` · `加密隧道：HK-Cluster-02` · `albert` · `PRO DEVELOPER` · `UID: 1747576500179` · `凭据安全托管于 Windows Credential Manager` · `切换账号` · `退出登录` · `云端存储配额` · `(8.0 GB 永久容量)` · `83.3 KB` · `/ 8.0 GB (0.01%)` · `文档数据: 70.9 KB` · `嵌入式附件: 12.4 KB` · `扩容方案` · `文档调度中心` · `Idle / 就绪状态` · `登录已绑定的统一开发者通行证后，可对当前 Markdown 知识库一键双向合并。远端增量树与本地冲突引擎已就绪。` · `同步当前文档` · `从云端拉取` · `浏览云端文档` · `正在向集群同步当前索引分支...` · `Task #0942` · `正在与香港节点 (HK-Cluster-02) 握手校验签名...` · `增量文件对比完成，已成功提交当前 Markdown 副本 (0.12s)` · `同步队列遥测` · `0 项挂起 · 0 项阻塞` · `同步队列为空 (Queue Cleared)` · `本地文档快照与分布式持久化节点完全对齐。` · `重试失败项` · `刷新状态` · `自动化触发策略` · `自动同步 (Auto Sync)` · `Active` · `文档产生修改后自动在后台触发增量 Diff 提交。` · `保存后延迟防抖 (秒)` · `3.00s` · `sec` · `保存后等待静默期再触发远端增量推送，避免快速连击保存产生多余版本快照。` · `多端冲突解决机制` · `冲突时自动创建分支副本 (推荐)` · `保留两端版本，文件名附带设备标识与时间戳` · `以本地修改为准覆盖 (Keep Local)` · `强制覆盖云端冲突文件，适合单人高频写作` · `媒体资产与附件同步` · `同步文档内图片 (Sync Embedded Media)` · `同步/分享时自动上传 Markdown 引用的相对图片路径（支持 png/jpg/jpeg/gif/webp，单张 ≤20MB，计入云端配额）。` · `本地离线图片缓存池` · `12.4 MB (48 个资源)` · `智能 WebP 矢量转码加速` · `已启用` · `清理本地媒体缓存` · `自动定期整理` · `清理完成 (释放 12.4 MB)` · `所有通讯均通过 TLS 1.3 双向认证管道。Tau 绝不会明文存储您的未加密写作草稿与访问密钥。`
## 3. 资源管理器-云端文档（explorer-cloud-doc.html）
### 3.1 结构树

```
body 13px 系统 CJK 栈 底 #0a0b10 select-none overflow-hidden
├ header 标题栏 h40 px12 border-b #2a2b3d 底 #0d0e16
│   左: mac 三点 12px(深色描边 50%) │ 终端图标16 主色 +「Tau 编辑器」粗 │ / workspace / notes / 量化学习路线.md(主色 mono + 6px 脉冲点)
│   中: 命令面板触发条(底 #12131b 边框 px12 py4 r6, `在项目中搜索与命令...` + `⌘K` kbd 10px)
│   右: `已同步到云端` 胶囊(11px mono 绿 10% 底/20% 边) │ 1px 分隔 │ 三个 28px 图标按钮(分栏/全屏/首选项)
├ body flex-1 flex
│  ├ aside 侧栏 w320 底 #12131b border-r (relative，右键菜单绝对定位于此)
│  │   ├ 仓库切换区 p10 border-b 底 #0d0e16/40: 2px 主色方块 + `tau-core-engine` 12px mono 600 + `main*` 徽标(10px)
│  │   │   分段模式切换 grid-cols-2 p2 底 #0a0b10 r6: 工作区(未选) │ 云端文档(选中: 底 #3a2818/60 字 #fde68a 边 amber-600/30 计数徽标 6)
│  │   ├ 过滤工具栏 px12 pt10 pb8 border-b/60: 搜索框(底 #0a0b10 pl28 py4 r4) + `⌘P`; 4 个 mini 图标按钮
│  │   ├ 云端分区头 px12 py6 底 #171411/50 border-b/40: 云图标 + `云端文档库` 12px 琥珀; 右 `6 项文件` 胶囊 + 同步历史
│  │   ├ 树容器 flex-1 overflow-y px4 py6 space-y2
│  │   │   节点行: px8 py4 r4 12px; 箭头 ▼/▶ 10px; 文件夹图标 14px; 名称 12px; 右侧计数徽标
│  │   │   缩进: ml12 + pl8 + border-l 1px #2a2b3d/40（三层）
│  │   │   文件行: 类型徽标(9px mono 700 px4 py1 r4) + 文件名 12px mono 截断 + 右大小 10px
│  │   │   选中节点: 底主色 10% + 1px 主色 40% 边 + r4 + px8 py6 + 左 4px 主色条 + glow(0 0 15px -3px rgba(56,189,248,.18))
│  │   │     第二行: Ln 24, Col 1 / 2.8 KB（10px mono 弱色）, 第一行右 `● 编辑中`(10px)
│  │   ├ 右键菜单 绝对定位 w224 (right8 top215) → 见 §3.2
│  │   └ 底栏 p12 border-t 底 #0d0e16/70: `云存储额度 (永久空间)` 11px + 右 `83.3 KB / 8.0 GB` mono 12px
│  │       配额条 h6 槽 #0a0b10(1px 边) 填充 主色→绿 渐变 3% │ 末行 10px mono: ● Tauri 2 + Rust Core │ 延迟 <0.8ms
│  └ main flex-1（编辑器区，本任务不涉及，见 HTML 顶部裁剪说明）
└ footer 状态栏 h24 px12 11px mono border-t 底 #12131b
    左: 太阳图标 主色 + `行 24, 列 1` │ `Ln 24   83 字符` │ `作者信息` │ ● `git: main* (+3 -1)`
    右: 三胶囊 (px6 py2 r4 底 #1a1b24 + 边框): `编码: UTF-8` │ `主题: 暗夜 (Nocturne)` │ `语言: Markdown`(主色)
```
### 3.2 右键菜单（稿内已给出完整项与分隔线）

```
浮层: w224 / 底 #21222e 95% + blur / border #2a2b3d / r8 / shadow-2xl / padding 6 / 12px 文字
├ 头部 px8 py4 10px 600 弱色 border-b/60: `云端文档快捷操作` + 右徽标 `MD 路线`(9px mono 主色)
├ 打开          ↵     (eye)          ├ 同步至云端   ⌘S    (绿色字)
├ 一键分享      ⌥⌘S   (琥珀字)        ├ 属性        ⌘I
├ 历史版本      ⌘H                    ├ 移动到...   ⌥M
├ ── 分隔线 1px #2a2b3d/80 my4 ──
└ 删除云端文档  ⌘⌫   (玫瑰色字, hover 底 rose 实色 + 白字)
项样式: px8 py6 r4; hover 为「主色实底 + 深色文字」反色(非浅底); kbd 10px 弱色随 hover 反色
```
### 3.3 组件与状态

| 组件 | 状态 |
|---|---|
| 模式切换（工作区/云端文档） | 未选 transparent + 弱色；选中 琥珀 20% 底 + 琥珀 200 字 + 边框 + shadow-sm |
| 树行 hover | 底 `#1a1b24`(`brand-low`)，文字升亮 |
| 树行选中 | 见 3.1（主色 10% 底 + 左 4px 条 + glow） |
| 云端分区徽标 | `6 项文件`：琥珀 900/40 底、琥珀 300 字、琥珀 800/40 边、rounded-full |
| 类型徽标 | MD 紫 `#c084fc` / DOC 蓝 `#60a5fa` / `</>` 琥珀 / `{ }` 绿；9px mono 700 + 12% 底 + 30% 边 |
| 状态栏胶囊 | 底 `#1a1b24` + 边 `#2a2b3d`，11px mono |
| 空/加载/错误态 | **稿内未画**。建议与 §1 三态共用同一组件（加载=主色 spinner + `正在加载云端文档…`；空=`云端还没有文档。`；错误=`--state-danger` + 重试） |
### 3.4 界面文案（中文原文）

`Tau 编辑器` · `workspace` · `notes` · `量化学习路线.md` · `在项目中搜索与命令...` · `⌘K` · `已同步到云端` · `分栏视图`/`专注全屏`/`首选项` · `tau-core-engine` · `main*` · `工作区` · `云端文档` · `快速定位文件或内容...` · `⌘P` · `新建 Markdown 文件`/`新建文件夹`/`刷新树`/`全部折叠` · `云端文档库` · `6 项文件` · `同步历史` · `分享` · `分享子项` · `镜像管理提示词.md` · `经济相互依存性和贸易...` · `编辑中` · `Ln 24, Col 1` · `2.8 KB` · `qa-docx-190038.docx` · `36KB` · `setup.py` · `4.3KB` · `soft-registers.json` · `0 B` · `本地工作区 / workspace` · `18 项` · `src / rust-core` · `IPC桥接` · `docs / architecture` · `架构指南` · `README.md` · `12.3 KB` · `package.json` · `Vue 3 + Tauri` · `云端文档快捷操作` · `MD 路线` · `打开` · `同步至云端` · `一键分享` · `属性` · `历史版本` · `移动到...` · `删除云端文档` · `云存储额度 (永久空间)` · `83.3 KB / 8.0 GB` · `Tauri 2 + Rust Core` · `延迟 <0.8ms` · `行 24, 列 1` · `Ln 24   83 字符` · `作者信息` · `git: main* (+3 -1)` · `编码: UTF-8` · `主题: 暗夜 (Nocturne)` · `语言: Markdown`
## 4. 与现状的差异（Top 5 + 附注）

对照 `CloudDocBrowser.vue`(352行) / `CloudDocTree.vue`(1380行) / `SettingsPanel.vue`(5189行) 与 `workbench-theme.css`。

**D1 布局形态完全不同（最大工作量）** 现弹窗 `960×640` 固定、`padding 16`、单列「标题+工具栏+树」，树即全部内容；设计稿是 `max-w 1400 / h 92vh(max 960)` 的**三栏工作台**：左导航 256 + 中间 12 栅格数据表 + 右检查器 320。需新增：表头/行栅格列（5/2/1/3/1）、右侧 Inspector（快照预览+版本时间线）、左栏分区（工作空间/目录树/标签）、底部状态栏。`CloudDocTree` 保留给侧栏与资源管理器复用。

**D2 字体族不一致** 项目 `--font-ui: 'Manrope Variable',…`；稿内设置页 **Geist**、弹窗 Inter、资源管理器系统 CJK。需引入 Geist 并把 `--font-ui` 首项改 `'Geist Variable','Geist'`；`--font-code` 已是 JetBrains Mono ✅。

**D3 整体字号偏小** 项目 base 11px（xs10/sm11/md12/lg14）；稿内列表行 12–13、正文 13–14、面板标题 16.8、H1 28。建议 base→12px 并按 §0.2 补 `--font-size-ui-xl`，否则 `py10` 行高撑不开、信息密度更差。

**D4 主色与语义色几乎全要换** `#7cc7ff→#38BDF8`、success `#4ade80→#10B981`、warning `#fbbf24→#F59E0B`、danger `#f87171→#EF4444`、三档 `--text-*` 全换、`--radius-control 5→6`、`--radius-dialog 10→12`。这些变量全站共用，会影响编辑器/侧栏/设置所有板块，须独立成「换肤」提交并回归；另需新增 `--accent-secondary #6366F1`。

**D5 三态（加载/空/错误）设计稿完全没画** 现项目反而齐全：`.cloud-browser__state / --error / --empty`、`__empty-title`、`__diag`、`__diag--warn`、`cloud-doc-tree__notice`、`__prompt-*`。落地以现有三态为骨架，只换 Nocturne 配色与 §1.3 尺寸，**不要照稿删掉**。

**附注**
- **右键菜单已高度就绪**：`CloudDocTree` 已有 7 项（打开/同步/分享/属性/历史/移动/删除）+ `__menu-divider` + `--danger`，与稿内 6 项+分隔线+删除基本一致；差异仅在样式（稿中 hover 是**主色实底反色**，项目是浅底）与省略号（稿 `移动到...` vs 项目 `移动到…`）。
- **云同步设置功能项其实已齐**：登录表单/账号/配额条/同步当前文档/从云端拉取/浏览云端文档/自动同步/防抖/图片同步/队列/重试/冲突保留两端/版本恢复均存在（`copy.cloudSync*`）。设计稿新增的是**展示层**：Bento 遥测 4 卡、12 列双栏重排、诊断节点链路、TLS 安全徽标、内层卡片化分组 → 属「重排+加遥测」，不是重写。
- **文案已高度对齐**：`云端文档`/`刷新`/`打开`/`历史版本`/`移动到…`/`删除云端文档`/`同步当前文档`/`从云端拉取`/`浏览云端文档`/`自动同步`/`同步文档内图片` 与稿内一致；需新增遥测类词（`当前运行版本`、`云端集群版本`、`本地环境架构`、`集群往返时延`、`诊断节点链路`、`云端文档库`、`6 项文件`、`编辑中`、`Ln 24, Col 1`）。
- **资源管理器入口**：稿中云端文档是侧栏内的**第二模式页签**（工作区/云端文档，琥珀标识），带独立分区头、配额条、状态栏胶囊；现项目是按钮/树混排。需引入「模式页签 + 模式内独立工具条」结构。
- **稿内小瑕疵勿照抄**：`py-0.2` / `h-8.5` / `h-7.5` / `active:scale-98` 等为非标准 Tailwind（CDN 下不生成），像素一律以本文标注数值为准。
