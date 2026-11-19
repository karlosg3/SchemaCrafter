import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'

const shared = fileURLToPath(new URL('./shared', import.meta.url))
const app = fileURLToPath(new URL('./app', import.meta.url))

const alias = {
  '#shared': shared,
  '~': app,
  '@': app
}

export default defineConfig({
  test: {
    projects: [
      {
        // The domain layer under shared/ is pure TypeScript with no Vue or DOM
        // dependency, so it runs in plain node.
        resolve: { alias },
        test: {
          name: 'domain',
          environment: 'node',
          include: [
            'test/generators.snapshot.test.ts',
            'test/roundtrip.test.ts',
            'test/projection.test.ts',
            'test/migration.test.ts',
            'test/graph.test.ts',
            'test/importSql.test.ts',
            'test/codeDiff.test.ts',
            'test/projectFile.test.ts',
            'test/parsers.fixes.test.ts',
            'test/layout.test.ts',
            'test/exporters.test.ts',
            'test/sqlDiff.test.ts',
            'test/releaseMeta.test.ts',
            'test/apiDesign.test.ts'
          ]
        }
      },
      {
        // Store tests need a DOM for localStorage plus Nuxt's Vue auto-imports.
        plugins: [
          vue(),
          AutoImport({
            imports: ['vue'],
            dts: false
          })
        ],
        resolve: { alias },
        test: {
          name: 'stores',
          environment: 'happy-dom',
          include: ['test/**/*.store.test.ts']
        }
      }
    ]
  }
})
