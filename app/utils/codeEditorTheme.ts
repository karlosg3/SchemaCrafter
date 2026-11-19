import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { tags } from '@lezer/highlight'

/**
 * CodeMirror syntax palette backed by CSS variables defined in main.css so
 * switching between Dark and Light mode updates the editor instantaneously.
 */
const highlightStyle = HighlightStyle.define([
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.definitionKeyword], color: 'var(--cm-keyword)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--cm-type)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--cm-string)' },
  { tag: [tags.number, tags.integer, tags.float], color: 'var(--cm-number)' },
  { tag: [tags.meta, tags.annotation, tags.attributeName], color: 'var(--cm-attribute)' },
  { tag: [tags.atom, tags.bool, tags.null], color: 'var(--cm-atom)' },
  { tag: [tags.propertyName, tags.definition(tags.variableName)], color: 'var(--cm-name)' },
  { tag: [tags.variableName, tags.labelName], color: 'var(--cm-name)' },
  { tag: [tags.punctuation, tags.separator, tags.bracket], color: 'var(--cm-punctuation)' },
  { tag: [tags.operator, tags.operatorKeyword], color: 'var(--cm-operator)' },
  { tag: tags.invalid, color: 'var(--cm-invalid)' }
])

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '12px',
    backgroundColor: 'var(--color-surface-code)',
    color: 'var(--color-ink-code)'
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.6'
  },
  '.cm-content': {
    padding: '10px 0',
    caretColor: 'var(--color-accent-400)'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-surface-code)',
    color: 'var(--color-ink-gutter)',
    border: 'none',
    paddingRight: '4px'
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 10px' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', color: 'var(--color-ink-faint)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--cm-active-line)', color: 'var(--color-ink-muted)' },
  '.cm-activeLine': { backgroundColor: 'var(--cm-active-line)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-accent-400)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--cm-selection)'
  },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--cm-bracket-bg)',
    outline: '1px solid var(--color-line-panel)'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--color-surface-input)',
    border: '1px solid var(--color-line-chrome)',
    borderRadius: '4px',
    padding: '0 4px',
    color: 'var(--color-ink-dim)'
  },
  '.cm-panels': {
    backgroundColor: 'var(--color-surface-chrome)',
    color: 'var(--color-ink)',
    borderBottom: '1px solid var(--color-line-chrome)'
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--cm-search)',
    outline: '1px solid var(--cm-search-border)'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--cm-search-selected)'
  }
})

export const codeEditorTheme: Extension = [editorTheme, syntaxHighlighting(highlightStyle)]
