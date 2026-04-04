<script lang="ts" setup>
const navigation = [
  {
    label: 'Getting Started',
    items: [
      { label: 'Introduction', to: '/getting-started' },
      { label: 'Installation', to: '/installation' },
      { label: 'Configuration', to: '/configuration' },
    ],
  },
  {
    label: 'Guide',
    items: [
      { label: 'Commands', to: '/guide/commands' },
      { label: 'Option Types', to: '/guide/options' },
      { label: 'Responses', to: '/guide/responses' },
      { label: 'Subcommands', to: '/guide/subcommands' },
      { label: 'Guild Commands', to: '/guide/guild-commands' },
      { label: 'Localization', to: '/guide/localization' },
      { label: 'Event Listeners', to: '/guide/listeners' },
      { label: 'Context Menus', to: '/guide/context-menus' },
      { label: 'Hooks', to: '/guide/hooks' },
    ],
  },
  {
    label: 'Web Dashboard',
    items: [
      { label: 'Overview', to: '/dashboard' },
    ],
  },
]

const route = useRoute()
</script>

<template>
  <div class="min-h-screen bg-default">
    <!-- Header -->
    <header class="sticky top-0 z-50 w-full border-b border-default bg-default/80 backdrop-blur-xl">
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <NuxtLink to="/getting-started" class="flex items-center gap-2.5">
          <div class="flex size-7 items-center justify-center rounded-lg bg-[#5865F2]">
            <span class="text-sm font-bold text-white">/</span>
          </div>
          <span class="text-sm font-semibold tracking-tight">nuxt-discord</span>
          <UBadge label="docs" variant="subtle" color="neutral" size="xs" />
        </NuxtLink>

        <div class="flex items-center gap-1">
          <UButton
            to="https://github.com/zojize/nuxt-discord"
            target="_blank"
            variant="ghost"
            color="neutral"
            size="sm"
            label="GitHub"
            class="cursor-pointer"
          />
        </div>
      </div>
    </header>

    <div class="mx-auto flex max-w-7xl">
      <!-- Sidebar -->
      <aside class="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r border-default px-4 py-6 lg:block">
        <nav class="space-y-6">
          <div v-for="group in navigation" :key="group.label">
            <h3 class="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
              {{ group.label }}
            </h3>
            <ul class="space-y-0.5">
              <li v-for="item in group.items" :key="item.to">
                <NuxtLink
                  :to="item.to"
                  class="block rounded-md px-2 py-1.5 text-sm transition-colors"
                  :class="route.path === item.to
                    ? 'bg-elevated font-medium text-highlighted'
                    : 'text-muted hover:bg-elevated hover:text-highlighted'"
                >
                  {{ item.label }}
                </NuxtLink>
              </li>
            </ul>
          </div>
        </nav>
      </aside>

      <!-- Content -->
      <main class="min-w-0 flex-1 px-8 py-8 lg:px-12">
        <div class="prose prose-neutral dark:prose-invert mx-auto max-w-3xl">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
