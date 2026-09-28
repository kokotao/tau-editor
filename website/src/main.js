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
  ['◫', '主题与快捷键', '按自己的习惯调整编辑器，把工具变成你的工具。'],
]

document.querySelector('#app').innerHTML = `
  <main class="site-shell">
    <header class="nav container">
      <a class="brand" href="#top" aria-label="Tau Editor 首页"><span class="mark">τ</span><span>Tau <b>Editor</b></span></a>
      <nav><a href="#features">功能</a><a href="#preview">预览</a><a href="https://github.com/kokotao/tau-editor" target="_blank" rel="noreferrer">GitHub ↗</a></nav>
      <a class="nav-download" href="https://github.com/kokotao/tau-editor/releases" target="_blank" rel="noreferrer">下载 Tau</a>
    </header>

    <section id="top" class="hero container">
      <div class="hero-copy"><p class="eyebrow"><span></span> 开源 · 跨平台 · 为专注而造</p><h1>把想法写下来，<em>让代码流动。</em></h1><p class="lede">Tau 是一款轻量、快速、懂你的现代文本编辑器。把复杂藏在幕后，把专注留给你。</p><div class="actions"><a class="button primary" href="https://github.com/kokotao/tau-editor/releases" target="_blank" rel="noreferrer">立即下载 <b>↗</b></a><a class="button secondary" href="#preview">看看它如何工作 <b>↓</b></a></div><div class="meta"><span>v0.5.0</span><i></i><span>MIT License</span><i></i><span>macOS · Windows · Linux</span></div></div>
      <div class="hero-art" aria-label="Tau Editor 编辑器概念预览"><div class="grid"></div><div class="code-window"><div class="window-bar"><span class="dots"><i></i><i></i><i></i></span><span>welcome.md</span><span class="saved">● saved</span></div><div class="code-body"><span class="numbers">01<br>02<br>03<br>04<br>05<br>06<br>07<br>08</span><code><span>#</span> Make space for<br><strong>your next idea.</strong><br><br><small>A calm place to write,<br>think, and build.</small><br><em>— Tau Editor</em></code></div><div class="window-foot"><span>Markdown</span><span>Ln 8, Col 16</span></div></div><div class="note"><b>⌘</b><span><strong>Command palette</strong><small>Everything within reach</small></span></div></div>
    </section>

    <section class="manifesto container"><p>好的工具不会打断你。</p><p>它会在你需要时，<strong>安静地出现。</strong></p></section>

    <section id="features" class="features container reveal"><p class="eyebrow">THE TAU WAY</p><h2>少一点噪音，<br><em>多一点创造。</em></h2><div class="feature-grid"><div class="feature-list">${features.map(([num, title, body], index) => `<button class="feature ${index === 0 ? 'active' : ''}" data-index="${index}"><span>${num}</span><strong>${title}<small>${body}</small></strong><b>↗</b></button>`).join('')}</div><blockquote>“<br><span>编辑器应该消失在你的工作里，而不是成为工作本身。</span><small>— Tau design principle / 01</small></blockquote></div></section>

    <section class="capabilities container reveal"><div class="capability-intro"><p class="eyebrow">BUILT FOR THE FLOW</p><h2>每一个细节，<br><em>都在帮你前进。</em></h2><p>从第一次打开文件，到完成一次提交，Tau 把高频动作变成自然的节奏。</p></div><div class="capability-grid">${capabilities.map(([icon, title, body]) => `<article class="capability"><span>${icon}</span><h3>${title}</h3><p>${body}</p></article>`).join('')}</div></section>

    <section id="preview" class="preview container reveal"><div><p class="eyebrow">A WORKSPACE THAT ADAPTS</p><h2>你的文件，<br><em>你的节奏。</em></h2><p>从一个纯文本文件，到一整个项目工作区。Tau 将你每天依赖的能力，收进一个轻盈而清晰的界面。</p><a class="text-link" href="https://github.com/kokotao/tau-editor" target="_blank" rel="noreferrer">在 GitHub 查看全部功能 ↗</a></div><figure><img src="./assets/editor.png" alt="Tau Editor 编辑器界面预览"><figcaption>Tau Editor · focused workspace</figcaption></figure></section>

    <section class="gallery container reveal"><div class="gallery-heading"><p class="eyebrow">A CLOSER LOOK</p><h2>把工作台，<br><em>带在手边。</em></h2></div><div class="gallery-grid"><figure><img src="./assets/markdown-preview.png" alt="Markdown 分栏预览"><figcaption>Markdown preview</figcaption></figure><figure><img src="./assets/command-palette.png" alt="命令面板"><figcaption>Command palette</figcaption></figure><figure><img src="./assets/settings.png" alt="快捷键与扩展设置"><figcaption>Settings that fit</figcaption></figure></div></section>

    <section class="platforms container reveal"><div><p class="eyebrow">ONE EDITOR, EVERY DESK</p><h2>在你选择的系统上，<br><em>保持同样顺手。</em></h2></div><div class="platform-list"><div><b>⌘</b><span>macOS<small>Apple Silicon</small></span></div><div><b>⊞</b><span>Windows<small>x64</small></span></div><div><b>◉</b><span>Linux<small>Deb · RPM · AppImage</small></span></div></div></section>

    <section class="faq container reveal"><div><p class="eyebrow">QUESTIONS, ANSWERED</p><h2>开始之前，<br><em>先了解 Tau。</em></h2></div><div class="faq-list"><details open><summary>Tau 是免费的吗？<span>+</span></summary><p>是。Tau Editor 以 MIT License 开源，你可以自由使用、修改和分发。</p></details><details><summary>支持哪些平台？<span>+</span></summary><p>当前支持 macOS、Windows 与 Linux，安装包可在 GitHub Releases 获取。</p></details><details><summary>我可以参与贡献吗？<span>+</span></summary><p>当然。欢迎通过 GitHub 提交 Issue、建议或 Pull Request。</p></details></div></section>

    <section class="download container"><div><p class="eyebrow">READY WHEN YOU ARE</p><h2>从今天开始，<br><em>写得更自在。</em></h2></div><a class="button light" href="https://github.com/kokotao/tau-editor/releases" target="_blank" rel="noreferrer">获取 Tau Editor <b>↗</b></a></section>
    <footer class="footer container"><a class="brand" href="#top"><span class="mark">τ</span><span>Tau <b>Editor</b></span></a><span>作者：Albert_Luo · <a href="mailto:480199976@qq.com">480199976@qq.com</a></span><a href="https://github.com/kokotao/tau-editor" target="_blank" rel="noreferrer">GitHub ↗</a></footer>
  </main>
`

document.querySelectorAll('.feature').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.feature').forEach((item) => item.classList.remove('active'))
  button.classList.add('active')
}))

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
