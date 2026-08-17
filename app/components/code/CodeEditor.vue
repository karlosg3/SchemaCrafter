<script setup lang="ts">
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { MySQL, PostgreSQL, SQLite, sql } from '@codemirror/lang-sql'
import { Compartment, EditorState } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import type { DatabaseEngine } from '#shared/types/schema'

/**
 * CodeMirror 6 replaces the `<pre dangerouslySetInnerHTML>` plus transparent
 * `<textarea>` overlay the React app used. That arrangement needed a magic
 * `lineCount * 20 + 40` height and an `!important` alignment contract in CSS to
 * keep the two layers on top of each other (audit CE-1/2/6/7); line numbers and
 * bracket matching come free here instead.
 *
 * Mounted directly rather than through `vue-codemirror`: that wrapper builds
 * its initial EditorState from `[basicSetup]` and only appends the `extensions`
 * prop afterwards through a compartment, which left this component's theme and
 * `lineWrapping` inert while silently pulling in autocompletion, search and
 * lint that the panel does not use.
 *
 * The extension list is composed from the individual `@codemirror/*` packages
 * rather than the `codemirror` meta-package's `minimalSetup`. That package
 * bundles its own copies of the core modules, and a facet declared in one copy
 * does not unify with the same facet from another — which silently disabled
 * syntax highlighting for every language while leaving everything else working.
 */
const props = defineProps<{
  modelValue: string
  language: string
  engine: DatabaseEngine
  readonly?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const DIALECT = {
  postgresql: PostgreSQL,
  mysql: MySQL,
  sqlite: SQLite
} satisfies Record<DatabaseEngine, unknown>

const host = useTemplateRef<HTMLDivElement>('host')
let view: EditorView | null = null

// Swapped in place on target/engine changes so the document, selection and
// undo history survive; recreating the view would drop all three.
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
        history(),
        drawSelection(),
        highlightSpecialChars(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        bracketMatching(),
        indentOnInput(),
        // The panel is 440px wide by default; horizontal scrolling would hide
        // the ends of most Prisma and Drizzle lines.
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
        codeEditorTheme,
        languageCompartment.of(languageExtension()),
        readonlyCompartment.of(EditorState.readOnly.of(!!props.readonly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
        })
      ]
    })
  })
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

// Guarded: writing the value we just emitted back into the document would move
// the caret to the end on every keystroke.
watch(() => props.modelValue, (next) => {
  if (!view || next === view.state.doc.toString()) return
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })
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
