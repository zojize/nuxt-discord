<script lang="ts" setup>
import { useRoute } from '#imports'
import { appearanceSelect } from './appearance-select'
import ProjectLogo from './ProjectLogo.vue'

const route = useRoute()

const nav = [
  { label: 'Overview', to: '/discord' },
  { label: 'Commands', to: '/discord/slash-commands' },
  { label: 'Context Menus', to: '/discord/context-menus' },
  { label: 'Listeners', to: '/discord/listeners' },
  { label: 'Activity', to: '/discord/activity' },
]
</script>

<template>
  <header class="sticky top-0 z-50 w-full border-b border-default bg-default/80 backdrop-blur-xl">
    <a href="#discord-main" class="sr-only focus:not-sr-only">Skip to content</a>
    <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
      <div class="flex items-center gap-6">
        <NuxtLink to="/discord" class="flex items-center gap-2.5">
          <ProjectLogo width="32" height="32" aria-hidden="true" class="shrink-0" />
          <span class="text-sm font-semibold tracking-tight">nuxt-discord</span>
        </NuxtLink>

        <nav class="hidden sm:flex items-center gap-1">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors"
            :class="route.path === item.to
              ? 'text-highlighted bg-elevated'
              : 'text-muted hover:text-highlighted hover:bg-elevated/50'"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
      </div>

      <div class="flex items-center gap-1">
        <UColorModeSelect v-bind="appearanceSelect" />
        <a
          href="https://github.com/zojize/nuxt-discord"
          target="_blank"
          title="View on GitHub"
          class="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-highlighted"
        >
          <UIcon name="i-simple-icons-github" class="size-4" />
        </a>
      </div>
    </div>
    <nav aria-label="Dashboard" class="flex gap-3 overflow-x-auto border-t border-default px-4 py-2 text-sm sm:hidden">
      <NuxtLink v-for="item in nav" :key="item.to" :to="item.to" class="shrink-0" exact-active-class="font-bold">
        {{ item.label }}
      </NuxtLink>
    </nav>
  </header>
</template>
