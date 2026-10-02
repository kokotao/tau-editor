/**
 * FileTree.vue 组件单元测试
 * 
 * 测试文件树组件的核心功能：
 * - 文件/文件夹渲染
 * - 文件夹展开/折叠
 * - 文件选择
 * - 右键菜单
 * - 事件发射
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount as vueMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import FileTree from '@/components/editor/FileTree.vue'
import type { FileTreeNode } from '@/stores/fileSystem'

const teleportedMenu = () => document.body.querySelector('.context-menu') as HTMLElement | null
const teleportedItems = () => teleportedMenu()?.querySelectorAll('.context-menu-item') ?? []

// Mock 数据
const mockFileTree: FileTreeNode[] = [
  {
    name: 'src',
    path: '/project/src',
    type: 'folder',
    isExpanded: false,
    children: [
      {
        name: 'components',
        path: '/project/src/components',
        type: 'folder',
        isExpanded: false,
        children: [],
      },
      {
        name: 'App.vue',
        path: '/project/src/App.vue',
        type: 'file',
        size: 1024,
      },
    ],
  },
  {
    name: 'package.json',
    path: '/project/package.json',
    type: 'file',
    size: 512,
    created: '2026-04-08T09:08:00.000Z',
    modified: '2026-04-08T09:19:00.000Z',
  },
]

describe('FileTree.vue', () => {
  let pinia: ReturnType<typeof createPinia>
  const mountedWrappers: Array<ReturnType<typeof vueMount>> = []

  const mount = (...args: Parameters<typeof vueMount>) => {
    const wrapper = vueMount(...args)
    mountedWrappers.push(wrapper)
    return wrapper
  }

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => {
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.querySelectorAll('.context-menu').forEach((menu) => menu.remove())
    vi.restoreAllMocks()
  })

  describe('渲染测试', () => {
    it('应正确渲染文件树', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      expect(wrapper.find('.file-tree').exists()).toBe(true)
      expect(wrapper.find('.file-tree-title').text()).toBe('我的工作区')
      expect(wrapper.find('.workspace-caption').text()).toBe('工作区')
    })

    it('应显示文件和文件夹', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const fileItems = wrapper.findAll('.file-tree-item')
      expect(fileItems.length).toBeGreaterThanOrEqual(2)
    })

    it('应正确显示文件夹图标', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const folderItems = wrapper.findAll('.file-tree-item.is-folder')
      expect(folderItems.length).toBeGreaterThanOrEqual(1)
    })

    it('应正确显示文件图标', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const fileIcons = wrapper.findAll('.file-icon svg')
      expect(fileIcons.length).toBeGreaterThanOrEqual(2)
    })

    it('应显示文件名', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      expect(wrapper.text()).toContain('src')
      expect(wrapper.text()).toContain('package.json')
    })

    it('应在文件右侧显示创建时间、大小和修改时间，并提供完整悬浮提示', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const meta = wrapper
        .find('[data-node-path="/project/package.json"]')
        .find('[data-testid="file-tree-entry-meta"]')
      expect(meta.exists()).toBe(true)
      expect(meta.text()).toContain('08 4月 2026')
      expect(meta.text()).toContain('512 B')
      expect(meta.attributes('title')).toContain('路径：/project/package.json')
      expect(meta.attributes('title')).toContain('创建时间：08 4月 2026')
      expect(meta.attributes('title')).toContain('修改时间：08 4月 2026')
      expect(meta.text()).toContain('创建')
      expect(meta.text()).toContain('修改')
      expect(meta.text()).not.toContain('…')
    })

    it('长文件名和元信息应保留完整文本并允许资源区横向查看', () => {
      const longName = 'very-long-source-file-name-that-must-remain-visible-without-ellipsis.ts'
      const wrapper = mount(FileTree, {
        props: {
          fileTree: [{
            name: longName,
            path: `/project/${longName}`,
            type: 'file',
            size: 1024 * 1024,
            created: '2026-04-08T09:08:00.000Z',
            modified: '2026-04-08T09:19:00.000Z',
          }],
        },
      })

      const content = wrapper.find('.file-tree-content')
      const item = wrapper.find('.file-tree-item')
      const name = wrapper.find('.file-name')
      const meta = wrapper.find('[data-testid="file-tree-entry-meta"]')

      expect(content.exists()).toBe(true)
      expect(content.classes()).toContain('file-tree-content')
      expect(item.exists()).toBe(true)
      expect(name.text()).toBe(longName)
      expect(name.attributes('title')).toBe(longName)
      expect(name.text()).not.toContain('…')
      expect(meta.text()).toContain('1.0 MB')
      expect(meta.attributes('title')).toContain(`/project/${longName}`)
    })

    it('搜索输入壳应展示', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const searchShell = wrapper.find('[data-testid="file-tree-search-shell"]')
      expect(searchShell.exists()).toBe(true)
      const input = searchShell.find('input')
      expect(input.attributes('placeholder')).toBe('在工作区中搜索')
      expect((input.element as HTMLInputElement).value).toBe('')
    })

    it('工作区标题旁应提供当前文件定位按钮', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
          canRevealCurrentFile: true,
        },
      })

      const locateButton = wrapper.get('[data-testid="btn-locate-current-file-tree"]')
      expect(locateButton.attributes('title')).toBe('定位当前文件')
      await locateButton.trigger('click')
      expect(wrapper.emitted('reveal-current-file')).toBeTruthy()
    })

    it('工作区标题旁应提供复制路径和文件管理器按钮', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
          canRevealCurrentFile: true,
        },
      })

      await wrapper.get('[data-testid="btn-copy-current-file-path"]').trigger('click')
      await wrapper.get('[data-testid="btn-reveal-current-file"]').trigger('click')

      expect(wrapper.emitted('copy-current-file-path')).toBeTruthy()
      expect(wrapper.emitted('reveal-current-file-manager')).toBeTruthy()
    })

    it('输入关键字后应过滤文件树节点', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const input = wrapper.find('[data-testid="file-tree-search-shell"] input')
      await input.setValue('package')

      expect(wrapper.text()).toContain('package.json')
      expect(wrapper.text()).not.toContain('src')
    })

    it('命中文件夹时应展示其子项用于预览', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const input = wrapper.find('[data-testid="file-tree-search-shell"] input')
      await input.setValue('src')

      expect(wrapper.text()).toContain('src')
      expect(wrapper.text()).toContain('App.vue')
    })

    it('空文件树不应显示额外提示文案', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: [],
        },
      })

      expect(wrapper.find('.file-tree-empty').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('当前工作区暂无文件')
      expect(wrapper.text()).not.toContain('右键创建文件/文件夹')
    })

    it('加载状态应显示加载提示', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: [],
          loading: true,
        },
      })

      expect(wrapper.find('.file-tree-loading').exists()).toBe(true)
      expect(wrapper.find('.file-tree-loading').text()).toContain('加载文件树')
    })

    it('应支持自定义层级缩进', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
          level: 2,
        },
      })

      const fileItem = wrapper.find('.file-tree-item')
      const paddingLeft = fileItem.attributes('style')
      expect(paddingLeft).toContain('40') // (2 * 16 + 8) = 40
    })
  })

  describe('文件选择', () => {
    it('revealPath 应将当前文件滚动到资源区中央并短暂高亮', async () => {
      const scrollIntoView = vi.fn()
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: scrollIntoView,
      })
      const wrapper = mount(FileTree, {
        props: {
          fileTree: [{
            name: 'src',
            path: '/project/src',
            type: 'folder',
            isExpanded: true,
            children: [{ name: 'App.vue', path: '/project/src/App.vue', type: 'file' }],
          }],
        },
      })

      await (wrapper.vm as any).revealPath('/project/src/App.vue')

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center', inline: 'center' })
      expect(wrapper.find('[data-node-path="/project/src/App.vue"]').classes()).toContain('is-revealed')
    })

    it('应高亮选中的文件', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
          selectedPath: '/project/package.json',
        },
      })

      const selectedItem = wrapper.find('.file-tree-item.selected')
      expect(selectedItem.exists()).toBe(true)
    })

    it('点击文件应发射 file-open 事件', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const fileItem = wrapper.find('.file-tree-item:not(.is-folder)')
      await fileItem.trigger('click')

      expect(wrapper.emitted('file-open')).toBeTruthy()
      expect(wrapper.emitted('file-open')![0]).toEqual(['/project/package.json'])
    })

    it('点击文件夹应发射 folder-toggle 事件', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const folderItem = wrapper.find('.file-tree-item.is-folder')
      await folderItem.trigger('click')

      expect(wrapper.emitted('folder-toggle')).toBeTruthy()
      expect(wrapper.emitted('folder-toggle')![0]).toEqual(['/project/src'])
    })
  })

  describe('文件夹展开/折叠', () => {
    it('点击展开按钮应发射 folder-toggle 事件', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const toggleBtn = wrapper.find('.folder-toggle')
      await toggleBtn.trigger('click')

      expect(wrapper.emitted('folder-toggle')).toBeTruthy()
      expect(wrapper.emitted('folder-toggle')![0]).toEqual(['/project/src'])
    })

    it('展开的文件夹应显示子项', () => {
      const expandedTree: FileTreeNode[] = [
        {
          name: 'src',
          path: '/project/src',
          type: 'folder',
          isExpanded: true,
          children: [
            {
              name: 'App.vue',
              path: '/project/src/App.vue',
              type: 'file',
            },
          ],
        },
      ]

      const wrapper = mount(FileTree, {
        props: {
          fileTree: expandedTree,
        },
      })

      expect(wrapper.find('.file-tree-children').exists()).toBe(true)
    })

    it('折叠的文件夹不应显示子项', () => {
      const collapsedTree: FileTreeNode[] = [
        {
          name: 'src',
          path: '/project/src',
          type: 'folder',
          isExpanded: false,
          children: [
            {
              name: 'App.vue',
              path: '/project/src/App.vue',
              type: 'file',
            },
          ],
        },
      ]

      const wrapper = mount(FileTree, {
        props: {
          fileTree: collapsedTree,
        },
      })

      expect(wrapper.find('.file-tree-children').exists()).toBe(false)
    })

    it('展开按钮应显示正确的旋转状态', () => {
      const expandedTree: FileTreeNode[] = [
        {
          name: 'src',
          path: '/project/src',
          type: 'folder',
          isExpanded: true,
          children: [],
        },
      ]

      const wrapper = mount(FileTree, {
        props: {
          fileTree: expandedTree,
        },
      })

      const toggleSvg = wrapper.find('.folder-toggle svg')
      expect(toggleSvg.classes()).toContain('expanded')
    })
  })

  describe('右键菜单', () => {
    it('右键点击应显示右键菜单', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const fileItem = wrapper.find('.file-tree-item')
      await fileItem.trigger('contextmenu', {
        clientX: 100,
        clientY: 200,
      })

      expect(teleportedMenu()).not.toBeNull()
    })

    it('空工作区右键应显示创建菜单并隐藏无目标操作', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: [],
        },
      })

      await wrapper.find('.file-tree-content').trigger('contextmenu', {
        clientX: 100,
        clientY: 200,
      })

      expect(teleportedMenu()).not.toBeNull()
      expect(teleportedItems().length).toBeGreaterThanOrEqual(2)
      expect(teleportedMenu()?.textContent).toContain('新建文件')
      expect(teleportedMenu()?.textContent).toContain('新建文件夹')
      expect(teleportedMenu()?.textContent).not.toContain('重命名')
      expect(teleportedMenu()?.textContent).not.toContain('删除')
    })

    it('文件树空白区域右键应使用工作区创建菜单', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      await wrapper.find('.file-tree-content').trigger('contextmenu', {
        clientX: 100,
        clientY: 200,
      })

      expect(teleportedMenu()).not.toBeNull()
      expect(wrapper.emitted('contextMenu')?.at(-1)).toEqual([null, expect.anything()])
    })

    it('右键菜单应显示正确位置', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const fileItem = wrapper.find('.file-tree-item')
      await fileItem.trigger('contextmenu', {
        clientX: 100,
        clientY: 200,
      })

      await nextTick()
      const style = teleportedMenu()?.getAttribute('style') ?? ''
      expect(style).toContain('top:')
      expect(style).toContain('left:')
    })

    it('右键菜单应发射 context-menu 事件', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const fileItem = wrapper.find('.file-tree-item')
      const mockEvent = {
        clientX: 100,
        clientY: 200,
        preventDefault: vi.fn(),
      }
      await fileItem.trigger('contextmenu', mockEvent)

      expect(wrapper.emitted('contextMenu')).toBeTruthy()
    })

    it('递归多级目录连续右键时始终只显示最新菜单', async () => {
      const nestedTree: FileTreeNode[] = [{
        name: 'src',
        path: '/project/src',
        type: 'folder',
        isExpanded: true,
        children: [{
          name: 'components',
          path: '/project/src/components',
          type: 'folder',
          isExpanded: true,
          children: [{
            name: 'Button.vue',
            path: '/project/src/components/Button.vue',
            type: 'file',
          }],
        }],
      }]
      const wrapper = mount(FileTree, { props: { fileTree: nestedTree } })
      const nestedFile = wrapper.find('[data-node-path="/project/src/components/Button.vue"]')

      expect(nestedFile.exists()).toBe(true)
      await nestedFile.trigger('contextmenu', { clientX: 180, clientY: 220 })
      await nextTick()
      expect(document.body.querySelectorAll('.context-menu')).toHaveLength(1)
      expect(wrapper.emitted('contextMenu')?.at(-1)?.[0]).toEqual(nestedTree[0].children?.[0].children?.[0])

      const nestedFolder = wrapper.find('[data-node-path="/project/src/components"]')
      await nestedFolder.trigger('contextmenu', { clientX: 260, clientY: 260 })
      await nextTick()
      expect(document.body.querySelectorAll('.context-menu')).toHaveLength(1)
      expect(teleportedMenu()?.textContent).toContain('重命名')
      expect(wrapper.emitted('contextMenu')?.at(-1)?.[0]).toEqual(nestedTree[0].children?.[0])
    })

    it('ArrowRight 应触发文件夹展开事件', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const folderItem = wrapper.find('.file-tree-item.is-folder')
      await folderItem.trigger('keydown', { key: 'ArrowRight' })

      expect(wrapper.emitted('folder-toggle')).toBeTruthy()
    })

    it('点击其他地方应关闭右键菜单', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const fileItem = wrapper.find('.file-tree-item')
      await fileItem.trigger('contextmenu', {
        clientX: 100,
        clientY: 200,
      })

      expect(teleportedMenu()).not.toBeNull()

      // 点击文档其他地方
      document.dispatchEvent(new MouseEvent('click'))
      await wrapper.vm.$nextTick()

      await nextTick()
      expect(teleportedMenu()).toBeNull()
    })

    it('点击"新建文件"应发射 new-file 事件', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const fileItem = wrapper.find('.file-tree-item')
      await fileItem.trigger('contextmenu', {
        clientX: 100,
        clientY: 200,
      })

      const newFileItem = document.body.querySelector('.context-menu-item') as HTMLElement
      newFileItem.click()

      expect(wrapper.emitted('new-file')).toBeTruthy()
      await nextTick()
      expect(teleportedMenu()).toBeNull()
    })

    it('点击"新建文件夹"应发射 new-folder 事件', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const fileItem = wrapper.find('.file-tree-item')
      await fileItem.trigger('contextmenu', {
        clientX: 100,
        clientY: 200,
      })

      const newFolderItem = document.body.querySelectorAll('.context-menu-item')[1] as HTMLElement
      newFolderItem.click()

      expect(wrapper.emitted('new-folder')).toBeTruthy()
      await nextTick()
      expect(teleportedMenu()).toBeNull()
    })

    it('点击"重命名"应发射 rename 事件', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const fileItem = wrapper.find('.file-tree-item')
      await fileItem.trigger('contextmenu', {
        clientX: 100,
        clientY: 200,
      })
      await nextTick()

      const renameItem = document.body.querySelectorAll('.context-menu-item')[2] as HTMLElement
      renameItem.click()

      expect(wrapper.emitted('rename')).toBeTruthy()
      expect(wrapper.emitted('rename')![0][0]).toEqual(mockFileTree[0])
      await nextTick()
      expect(teleportedMenu()).toBeNull()
    })

    it('点击"文件详情"应发射 details 事件并关闭菜单', async () => {
      const wrapper = mount(FileTree, { props: { fileTree: mockFileTree } })
      await wrapper.find('.file-tree-item').trigger('contextmenu', { clientX: 100, clientY: 100 })
      await nextTick()
      ;(document.body.querySelector('[data-testid="file-tree-details"]') as HTMLElement).click()
      expect(wrapper.emitted('details')?.[0]?.[0]).toEqual(mockFileTree[0])
      await nextTick()
      expect(teleportedMenu()).toBeNull()
    })

    it('点击"删除"应发射 delete 事件', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const fileItem = wrapper.find('.file-tree-item')
      await fileItem.trigger('contextmenu', {
        clientX: 100,
        clientY: 200,
      })
      await nextTick()

      const deleteItem = document.body.querySelector('.context-menu-item.danger') as HTMLElement
      deleteItem.click()

      expect(wrapper.emitted('delete')).toBeTruthy()
      expect(wrapper.emitted('delete')![0][0]).toEqual(mockFileTree[0])
      await nextTick()
      expect(teleportedMenu()).toBeNull()
    })
  })

  describe('刷新功能', () => {
    it('点击刷新按钮应发射 refresh 事件', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const refreshBtn = wrapper.find('.file-tree-action')
      await refreshBtn.trigger('click')

      expect(wrapper.emitted('refresh')).toBeTruthy()
    })
  })

  describe('递归渲染', () => {
    it('应递归渲染子文件夹', () => {
      const nestedTree: FileEntry[] = [
        {
          name: 'src',
          path: '/project/src',
          type: 'folder',
          isExpanded: true,
          children: [
            {
              name: 'components',
              path: '/project/src/components',
              type: 'folder',
              isExpanded: true,
              children: [
                {
                  name: 'Button.vue',
                  path: '/project/src/components/Button.vue',
                  type: 'file',
                },
              ],
            },
          ],
        },
      ]

      const wrapper = mount(FileTree, {
        props: {
          fileTree: nestedTree,
        },
      })

      expect(wrapper.text()).toContain('Button.vue')
    })

    it('子组件应接收正确的层级', () => {
      const nestedTree: FileEntry[] = [
        {
          name: 'src',
          path: '/project/src',
          type: 'folder',
          isExpanded: true,
          children: [
            {
              name: 'App.vue',
              path: '/project/src/App.vue',
              type: 'file',
            },
          ],
        },
      ]

      const wrapper = mount(FileTree, {
        props: {
          fileTree: nestedTree,
          level: 0,
        },
      })

      // 子组件应该存在
      expect(wrapper.findAllComponents(FileTree).length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('样式类', () => {
    it('文件夹应有 is-folder 类', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const folderItem = wrapper.find('.file-tree-item.is-folder')
      expect(folderItem.exists()).toBe(true)
    })

    it('选中项应有 selected 类', () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
          selectedPath: '/project/package.json',
        },
      })

      const selectedItem = wrapper.find('.file-tree-item.selected')
      expect(selectedItem.exists()).toBe(true)
    })

    it('危险操作项应有 danger 类', async () => {
      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      const fileItem = wrapper.find('.file-tree-item')
      await fileItem.trigger('contextmenu', {
        clientX: 100,
        clientY: 200,
      })

      const deleteItem = wrapper.find('.context-menu-item.danger')
      expect((document.body.querySelector('.context-menu-item.danger') as HTMLElement).classList.contains('danger')).toBe(true)
    })
  })

  describe('生命周期', () => {
    it('挂载时应添加点击事件监听器', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener')

      mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function))
    })

    it('卸载时应移除点击事件监听器', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')

      const wrapper = mount(FileTree, {
        props: {
          fileTree: mockFileTree,
        },
      })

      wrapper.unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function))
    })
  })
})
