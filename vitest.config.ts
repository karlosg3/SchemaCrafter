import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The domain layer under shared/ is pure TypeScript with no Vue or DOM
// dependency, so these tests run in plain node without the Nuxt environment.
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
})
