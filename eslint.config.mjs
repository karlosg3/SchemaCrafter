// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: ['dist', '.nuxt', '.output', 'node_modules'],
  rules: {
    'vue/multi-word-component-names': 'off'
  }
})
