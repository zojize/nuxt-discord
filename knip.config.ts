import type { KnipConfig } from 'knip'

export default {
  // Nuxt module runtime files are loaded dynamically by the module system
  ignore: [
    'src/runtime/**',
    'playground/**',
    'test/fixtures/**',
  ],
  // These are used at runtime by Nuxt/Nitro auto-imports or as peer deps
  ignoreDependencies: [
    '@nuxt/ui',
    '@nuxt/devtools',
    '@nuxt/eslint-config',
    '@nuxt/schema',
    '@nuxt/test-utils',
    '@vueuse/core',
    'simple-icons',
    'tailwindcss',
    'nitropack',
  ],
} satisfies KnipConfig
