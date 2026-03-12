import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Editor } from '@/components/Editor'
import { EditorProvider } from '@/store/editor'

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('Editor Component', () => {
  const renderEditor = (props = {}) => {
    return render(
      <EditorProvider>
        <Editor {...props} />
      </EditorProvider>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render editor container', () => {
      renderEditor()
      expect(screen.getByTestId('editor-container')).toBeInTheDocument()
    })

    it('should render line numbers', () => {
      renderEditor()
      expect(screen.getByTestId('line-numbers')).toBeInTheDocument()
    })

    it('should render textarea for editing', () => {
      renderEditor()
      expect(screen.getByTestId('editor-textarea')).toBeInTheDocument()
    })

    it('should start with empty content', () => {
      renderEditor()
      const textarea = screen.getByTestId('editor-textarea') as HTMLTextAreaElement
      expect(textarea.value).toBe('')
    })
  })

  describe('Text Input', () => {
    it('should update content when typing', () => {
      renderEditor()
      const textarea = screen.getByTestId('editor-textarea') as HTMLTextAreaElement
      
      fireEvent.change(textarea, { target: { value: 'Hello World' } })
      
      expect(textarea.value).toBe('Hello World')
    })

    it('should update line count when adding lines', () => {
      renderEditor()
      const textarea = screen.getByTestId('editor-textarea') as HTMLTextAreaElement
      
      fireEvent.change(textarea, { target: { value: 'line1\nline2\nline3' } })
      
      const lineNumbers = screen.getByTestId('line-numbers')
      expect(lineNumbers.children.length).toBe(3)
    })
  })

  describe('Line Numbers', () => {
    it('should show 1 line number initially', () => {
      renderEditor()
      const lineNumbers = screen.getByTestId('line-numbers')
      expect(lineNumbers.children.length).toBe(1)
    })

    it('should sync with content lines', () => {
      renderEditor()
      const textarea = screen.getByTestId('editor-textarea') as HTMLTextAreaElement
      
      fireEvent.change(textarea, { target: { value: 'line1\nline2\nline3\nline4' } })
      
      const lineNumbers = screen.getByTestId('line-numbers')
      expect(lineNumbers.children.length).toBe(4)
    })

    it('should update when content is reduced', () => {
      renderEditor()
      const textarea = screen.getByTestId('editor-textarea') as HTMLTextAreaElement
      
      // Add lines
      fireEvent.change(textarea, { target: { value: 'line1\nline2\nline3' } })
      expect(screen.getByTestId('line-numbers').children.length).toBe(3)
      
      // Reduce lines
      fireEvent.change(textarea, { target: { value: 'line1' } })
      expect(screen.getByTestId('line-numbers').children.length).toBe(1)
    })
  })

  describe('Keyboard Shortcuts', () => {
    it('should handle Tab key for indentation', () => {
      renderEditor()
      const textarea = screen.getByTestId('editor-textarea') as HTMLTextAreaElement
      
      fireEvent.keyDown(textarea, { key: 'Tab', code: 'Tab' })
      
      // Tab should insert spaces instead of changing focus
      expect(textarea.value).toBe('  ')
    })

    it('should handle Enter key for new line', () => {
      renderEditor()
      const textarea = screen.getByTestId('editor-textarea') as HTMLTextAreaElement
      
      fireEvent.change(textarea, { target: { value: 'line1' } })
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })
      
      expect(textarea.value).toContain('\n')
    })
  })

  describe('Syntax Highlighting', () => {
    it('should apply markdown highlighting when mode is markdown', () => {
      renderEditor({ mode: 'markdown' })
      
      const textarea = screen.getByTestId('editor-textarea') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: '# Heading' } })
      
      // Should have highlighting class
      expect(textarea).toHaveClass('syntax-highlighted')
    })

    it('should not apply highlighting in plain text mode', () => {
      renderEditor({ mode: 'text' })
      
      const textarea = screen.getByTestId('editor-textarea') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: '# Not a heading' } })
      
      // Should not have highlighting class
      expect(textarea).not.toHaveClass('syntax-highlighted')
    })
  })

  describe('Cursor Position', () => {
    it('should update cursor position on click', () => {
      renderEditor()
      const textarea = screen.getByTestId('editor-textarea') as HTMLTextAreaElement
      
      fireEvent.change(textarea, { target: { value: 'Hello World' } })
      fireEvent.click(textarea)
      
      // Cursor position should be tracked
      expect(screen.getByTestId('cursor-position')).toBeInTheDocument()
    })

    it('should update cursor position on typing', () => {
      renderEditor()
      const textarea = screen.getByTestId('editor-textarea') as HTMLTextAreaElement
      
      fireEvent.change(textarea, { target: { value: 'Hello' } })
      fireEvent.change(textarea, { target: { value: 'Hello World' } })
      
      // Position should update
      const position = screen.getByTestId('cursor-position')
      expect(position).toHaveTextContent('1:12')
    })
  })

  describe('Scroll Sync', () => {
    it('should sync scroll between textarea and line numbers', () => {
      renderEditor()
      const textarea = screen.getByTestId('editor-textarea')
      const lineNumbers = screen.getByTestId('line-numbers')
      
      // Add enough content to scroll
      fireEvent.change(textarea, { 
        target: { value: Array(50).fill('line').join('\n') } 
      })
      
      fireEvent.scroll(textarea, { target: { scrollTop: 100 } })
      
      // Line numbers should scroll too
      expect(lineNumbers).toHaveStyle('transform: translateY(-100px)')
    })
  })

  describe('Readonly Mode', () => {
    it('should disable editing in readonly mode', () => {
      renderEditor({ readonly: true })
      const textarea = screen.getByTestId('editor-textarea') as HTMLTextAreaElement
      
      expect(textarea).toBeDisabled()
    })

    it('should hide line numbers in readonly mode when configured', () => {
      renderEditor({ readonly: true, showLineNumbers: false })
      
      expect(screen.queryByTestId('line-numbers')).not.toBeInTheDocument()
    })
  })
})
