<script setup lang="ts">
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { MySQL, PostgreSQL, SQLite, sql } from '@codemirror/lang-sql'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import type { Extension } from '@codemirror/state'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers
} from '@codemirror/view'
import type { DatabaseEngine } from '#shared/types/schema'

const props = defineProps<{
  modelValue: string
  language: string
  engine: DatabaseEngine
  readonly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:lines': [lines: number]
  dirty: []
  apply: []
}>()

const EMIT_DEBOUNCE_MS = 100

const DIALECT = {
  postgresql: PostgreSQL,
  mysql: MySQL,
  sqlite: SQLite
} satisfies Record<DatabaseEngine, unknown>

const host = useTemplateRef<HTMLDivElement>('host')
let view: EditorView | null = null
let emitTimer: ReturnType<typeof setTimeout> | null = null

function clearEmitTimer() {
  if (emitTimer !== null) {
    clearTimeout(emitTimer)
    emitTimer = null
  }
}

function getValue(): string {
  return view ? view.state.doc.toString() : props.modelValue
}

function flush(): string {
  clearEmitTimer()
  const value = getValue()
  if (value !== props.modelValue) emit('update:modelValue', value)
  return value
}

function openSearch(): void {
  if (!view) return
  view.focus()
  openSearchPanel(view)
}

defineExpose({ getValue, flush, openSearch })

const languageCompartment = new Compartment()
const readonlyCompartment = new Compartment()

function languageExtension(): Extension {
  if (props.language === 'sql') return sql({ dialect: DIALECT[props.engine] })
  if (props.language === 'prisma') return prisma()
  return javascript({ typescript: true })
}

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        lineNumbers(),
        foldGutter(),
        history(),
        drawSelection(),
        highlightSpecialChars(),
        closeBrackets(),
        search({ top: true }),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              emit('apply')
              return true
            }
          },
          ...closeBracketsKeymap,
          ...searchKeymap,
          ...foldKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab
        ]),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        bracketMatching(),
        indentOnInput(),
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
        codeEditorTheme,
        languageCompartment.of(languageExtension()),
        readonlyCompartment.of(EditorState.readOnly.of(!!props.readonly)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          emit('update:lines', update.state.doc.lines)
          emit('dirty')
          clearEmitTimer()
          const nextDoc = update.state.doc
          emitTimer = setTimeout(() => {
            emitTimer = null
            emit('update:modelValue', nextDoc.toString())
          }, EMIT_DEBOUNCE_MS)
        })
      ]
    })
  })
  if (view) emit('update:lines', view.state.doc.lines)
})

onBeforeUnmount(() => {
  clearEmitTimer()
  view?.destroy()
  view = null
})

watch(() => props.modelValue, (next) => {
  if (!view) return
  if (next === view.state.doc.toString()) {
    emit('update:lines', view.state.doc.lines)
    return
  }
  clearEmitTimer()
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })
  emit('update:lines', view.state.doc.lines)
})

watch([() => props.language, () => props.engine], () => {
  view?.dispatch({ effects: languageCompartment.reconfigure(languageExtension()) })
})

watch(() => props.readonly, (value) => {
  view?.dispatch({ effects: readonlyCompartment.reconfigure(EditorState.readOnly.of(!!value)) })
})
</script>

<template>
  <div ref="host" class="h-full w-full overflow-hidden" />
</template>
