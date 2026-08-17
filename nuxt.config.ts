// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-08-16',
  devtools: { enabled: true },

  // The whole app is a client-side canvas backed by localStorage. There is no
  // server data and no SEO surface, so SSR would only buy hydration mismatches.
  ssr: false,

  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
    '@pinia/nuxt',
    '@vueuse/nuxt'
  ],

  css: ['~/assets/css/main.css'],

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
