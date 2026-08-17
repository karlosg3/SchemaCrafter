import { LanguageSupport, StreamLanguage } from '@codemirror/language'
import type { StringStream } from '@codemirror/language'

/**
 * There is no `@codemirror/lang-prisma`, so this is a hand-written stream
 * tokenizer. The token set is ported from the `Prism.languages.prisma` grammar
 * the React app registered inline at CodePreviewPanel.tsx:12 — a rewrite rather
 * than a port, because Prism matches with a flat list of regexes over the whole
 * document and CodeMirror walks a character stream with state.
 */
interface PrismaState {
  inBlockComment: boolean
}

const KEYWORD = /^(?:model|datasource|generator|enum|type|view)\b/
const SCALAR = /^(?:String|Int|BigInt|Float|Decimal|Boolean|DateTime|Json|Bytes|Unsupported)\b/
const CONSTANT = /^(?:true|false|null|env)\b/
const IDENTIFIER = /^[A-Za-z_]\w*/

export const prismaLanguage = StreamLanguage.define<PrismaState>({
  name: 'prisma',

  startState: () => ({ inBlockComment: false }),

  token(stream: StringStream, state: PrismaState): string | null {
    if (state.inBlockComment) {
      if (stream.skipTo('*/')) {
        stream.match('*/')
        state.inBlockComment = false
      } else {
        stream.skipToEnd()
      }
      return 'comment'
    }

    if (stream.eatSpace()) return null

    // `//` and `///` doc comments alike.
    if (stream.match('//')) {
      stream.skipToEnd()
      return 'comment'
    }

    if (stream.match('/*')) {
      state.inBlockComment = true
      return 'comment'
    }

    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string'
    if (stream.match(/^\d+(?:\.\d+)?/)) return 'number'

    // @id, @default(...), @@unique — block attributes take the same style.
    if (stream.match(/^@@?[A-Za-z_][\w.]*/)) return 'meta'

    if (stream.match(KEYWORD)) return 'keyword'
    if (stream.match(SCALAR)) return 'typeName'
    if (stream.match(CONSTANT)) return 'atom'

    // A capitalised bare word in a field position is a model or enum reference.
    if (stream.match(/^[A-Z]\w*/)) return 'typeName'
    if (stream.match(IDENTIFIER)) return 'variableName'

    if (stream.match(/^[[\]{}(),:]/)) return 'punctuation'
    if (stream.match(/^[?![\]=]/)) return 'operator'

    stream.next()
    return null
  },

  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', '"'] }
  }
})

export function prisma(): LanguageSupport {
  return new LanguageSupport(prismaLanguage)
}
