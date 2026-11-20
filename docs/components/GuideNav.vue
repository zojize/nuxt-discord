<script setup lang="ts">
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
      { label: 'Middleware', to: '/guide/middleware' },
      { label: 'Text channels', to: '/guide/use-text-channel' },
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
</template>
