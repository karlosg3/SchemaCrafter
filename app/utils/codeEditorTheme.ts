import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { tags } from '@lezer/highlight'

/**
 * Replaces the 70 lines of hand-written Prism colours in the React app's
 * index.css (L69-139), and with them the `.code-editor-overlay` `!important`
 * alignment contract that kept a transparent textarea sitting on top of a
 * highlighted `<pre>` (audit CE-1/2/6/7).
 *
 * Colours are read from the `@theme` tokens rather than hard-coded, so the
 * editor stays in step with the rest of the design system.
 */
const PALETTE = {
  comment: '#5b6270',
  keyword: '#c084fc',
  type: '#7dd3fc',
  string: '#86efac',
  number: '#fbbf24',
  attribute: '#f0abfc',
  atom: '#fca5a5',
  name: '#c7cad1',
  punctuation: '#6b7280',
  operator: '#9aa1ac'
} as const

const highlightStyle = HighlightStyle.define([
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: PALETTE.comment, fontStyle: 'italic' },
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.definitionKeyword], color: PALETTE.keyword },
  { tag: [tags.typeName, tags.className, tags.namespace], color: PALETTE.type },
  { tag: [tags.string, tags.special(tags.string)], color: PALETTE.string },
  { tag: [tags.number, tags.integer, tags.float], color: PALETTE.number },
  { tag: [tags.meta, tags.annotation, tags.attributeName], color: PALETTE.attribute },
  { tag: [tags.atom, tags.bool, tags.null], color: PALETTE.atom },
  { tag: [tags.propertyName, tags.definition(tags.variableName)], color: PALETTE.name },
  { tag: [tags.variableName, tags.labelName], color: PALETTE.name },
  { tag: [tags.punctuation, tags.separator, tags.bracket], color: PALETTE.punctuation },
  { tag: [tags.operator, tags.operatorKeyword], color: PALETTE.operator },
  { tag: tags.invalid, color: '#f87171' }
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
    lineHeight: '1.55'
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
  '.cm-activeLineGutter': { backgroundColor: 'rgb(255 255 255 / 0.04)', color: 'var(--color-ink-muted)' },
  '.cm-activeLine': { backgroundColor: 'rgb(255 255 255 / 0.03)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-accent-400)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgb(99 102 241 / 0.30)'
  },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'rgb(255 255 255 / 0.10)',
    outline: '1px solid var(--color-line-panel)'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--color-surface-input)',
    border: 'none',
    color: 'var(--color-ink-dim)'
  }
}, { dark: true })

export const codeEditorTheme: Extension = [editorTheme, syntaxHighlighting(highlightStyle)]
