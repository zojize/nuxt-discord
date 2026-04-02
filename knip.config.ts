import type { KnipConfig } from 'knip'

export default {
  // Nuxt module runtime files are loaded dynamically by the module system
  ignore: [
    'src/runtime/**',
    'playground/**',
    'test/fixtures/**',
    'docs/**',
  ],
  // These are used at runtime by Nuxt/Nitro auto-imports, as peer deps,
  // or resolved by convention (iconify icon data packages)
  ignoreDependencies: [
    '@nuxt/ui',
    '@nuxt/devtools',
    '@nuxt/eslint-config',
    '@nuxt/schema',
    '@vueuse/core',
    '@iconify-json/lucide',
    '@iconify-json/simple-icons',
    'simple-icons',
    'tailwindcss',
    'nitropack',
  ],
} satisfies KnipConfig
