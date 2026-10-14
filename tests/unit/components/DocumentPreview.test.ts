import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as XLSX from 'xlsx'
import { parseSpreadsheetBytes } from '@/utils/spreadsheetPreview'
import * as spreadsheetPreview from '@/utils/spreadsheetPreview'
import DocumentPreview from '@/components/editor/DocumentPreview.vue'

const tauriMocks = vi.hoisted(() => ({
  isTauriApp: vi.fn(() => false),
  readFileBytes: vi.fn(),
}))

vi.mock('@/lib/tauri', () => ({
  isTauriApp: tauriMocks.isTauriApp,
  fileCommands: {
    readFileBytes: tauriMocks.readFileBytes,
  },
}))

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('DocumentPreview', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    tauriMocks.isTauriApp.mockReturnValue(false)
    tauriMocks.readFileBytes.mockReset()
  })

  it('renders HTML in an isolated iframe using srcdoc', () => {
    const wrapper = mount(DocumentPreview, {
      props: {
        fileName: 'index.html',
        filePath: '/workspace/index.html',
        content: '<!doctype html><html><body><h1>Hello</h1></body></html>',
      },
    })

    const frame = wrapper.get('[data-testid="document-preview-html"]')
    expect(frame.element.tagName).toBe('IFRAME')
    expect(frame.attributes('srcdoc')).toContain('<h1>Hello</h1>')
    expect(frame.attributes('srcdoc')).toContain('<base href="file:///workspace/">')
    expect(frame.attributes('sandbox')).toBe('')
  })

  it('renders PDF files with a browser-native object preview', () => {
    const wrapper = mount(DocumentPreview, {
      props: {
        fileName: 'guide.pdf',
        filePath: '/workspace/guide.pdf',
        content: '[PDF Text Preview]\nFile: guide.pdf\n\nExtracted PDF text.',
      },
    })

    const preview = wrapper.get('[data-testid="document-preview-pdf"]')
    expect(preview.element.tagName).toBe('OBJECT')
    expect(preview.attributes('type')).toBe('application/pdf')
    expect(preview.attributes('data')).toContain('guide.pdf#view=FitH')
    expect(wrapper.find('[data-testid="document-preview-pdf-text-toggle"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Extracted PDF text.')
  })

  it('renders CSV content as a table for spreadsheet preview', () => {
    const wrapper = mount(DocumentPreview, {
      props: {
        fileName: 'people.csv',
        filePath: '/workspace/people.csv',
        content: 'name,age\nAlice,30\nBob,31',
      },
    })

    const table = wrapper.get('[data-testid="document-preview-spreadsheet"]')
    expect(table.findAll('tr')).toHaveLength(3)
    expect(table.text()).toContain('Alice')
    expect(table.text()).toContain('31')
  })

  it('renders the first worksheet of binary xlsx content as a table', async () => {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['name', 'age'],
      ['Alice', 30],
    ])
    XLSX.utils.book_append_sheet(workbook, sheet, 'People')
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array
    expect((await parseSpreadsheetBytes(bytes))[1]).toEqual(['Alice', '30'])

    const wrapper = mount(DocumentPreview, {
      props: {
        fileName: 'report.xlsx',
        filePath: '/workspace/report.xlsx',
        content: '',
        binaryContent: bytes,
      },
    })

    await flushPromises()
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await flushPromises()
    const table = wrapper.get('[data-testid="document-preview-spreadsheet"]')
    expect(table.findAll('tr')).toHaveLength(2)
    expect(table.text()).toContain('Alice')
    expect(table.text()).toContain('30')
  })

  it('does not let a stale spreadsheet parse overwrite the active file', async () => {
    const firstBytes = new Uint8Array([1])
    const secondBytes = new Uint8Array([2])
    const first = deferred<string[][]>()
    const second = deferred<string[][]>()
    vi.spyOn(spreadsheetPreview, 'parseSpreadsheetBytes').mockImplementation((bytes) => (
      bytes === firstBytes ? first.promise : second.promise
    ))

    const wrapper = mount(DocumentPreview, {
      props: {
        fileName: 'first.xlsx',
        filePath: '/workspace/first.xlsx',
        content: '',
        binaryContent: firstBytes,
      },
    })

    await wrapper.setProps({
      fileName: 'second.xlsx',
      filePath: '/workspace/second.xlsx',
      binaryContent: secondBytes,
    })
    second.resolve([['name'], ['active']])
    await flushPromises()
    first.resolve([['name'], ['stale']])
    await flushPromises()

    expect(wrapper.get('[data-testid="document-preview-spreadsheet"]').text()).toContain('active')
    expect(wrapper.get('[data-testid="document-preview-spreadsheet"]').text()).not.toContain('stale')
  })

  it('does not create a PDF object URL after the preview is unmounted', async () => {
    tauriMocks.isTauriApp.mockReturnValue(true)
    const pending = deferred<Uint8Array>()
    tauriMocks.readFileBytes.mockReturnValue(pending.promise)
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:late')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    const wrapper = mount(DocumentPreview, {
      props: {
        fileName: 'guide.pdf',
        filePath: '/workspace/guide.pdf',
        content: '',
      },
    })
    wrapper.unmount()
    pending.resolve(new Uint8Array([37, 80, 68, 70]))
    await flushPromises()

    expect(createObjectUrl).not.toHaveBeenCalled()
  })
})
