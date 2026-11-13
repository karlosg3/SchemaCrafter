// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-08-16',
  devtools: { enabled: true },

  // The whole app is a client-side canvas backed by localStorage. There is no
  // server data and no SEO surface, so SSR would only buy hydration mismatches.
  ssr: false,

  devServer: {
    host: process.env.TAURI_DEV_HOST || 'localhost'
  },

  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
    '@pinia/nuxt',
    '@vueuse/nuxt'
  ],

  css: ['~/assets/css/main.css'],

  // Directories under components/ are organisational only. Without this, a file
  // at components/layout/AppNavbar.vue would have to be written <LayoutAppNavbar>.
  components: [{ path: '~/components', pathPrefix: false }],

  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },

  app: {
    head: {
      title: 'SchemaCrafter',
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Design database schemas visually and export them as Prisma, Drizzle, TypeORM, MikroORM or raw SQL.'
        },
        { property: 'og:title', content: 'SchemaCrafter' },
        {
          property: 'og:description',
          content:
            'Design database schemas visually and export them as Prisma, Drizzle, TypeORM, MikroORM or raw SQL.'
        },
        { property: 'og:type', content: 'website' }
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
    }
  },

  /**
   * CodeMirror identifies both its facets and its highlighting tags by object
   * identity. Vite pre-bundles each `@codemirror/*` package separately and will
   * happily give two of them their own copy of `@lezer/highlight`, at which
   * point the tags a language emits are different objects from the tags a
   * HighlightStyle matches on — the syntax tree parses correctly and not one
   * token gets coloured. Deduping is what keeps them the same objects.
   */
  vite: {
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
    server: {
      strictPort: true
    },
    resolve: {
      dedupe: [
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@lezer/common',
        '@lezer/highlight'
      ]
    },
    optimizeDeps: {
      include: [
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@codemirror/commands',
        '@codemirror/lang-javascript',
        '@codemirror/lang-sql',
        '@lezer/common',
        '@lezer/highlight'
      ]
    }
  },

  typescript: {
    typeCheck: false,
    strict: true
  },

  eslint: {
    config: {
      stylistic: false
    }
  }
})
