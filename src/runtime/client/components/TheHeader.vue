<script lang="ts" setup>
import { ref, useRoute } from '#imports'
import { Icon } from '@iconify/vue'

const route = useRoute()

const isDark = ref(false)

function toggleDark() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
}

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
    <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
      <div class="flex items-center gap-6">
        <NuxtLink to="/discord" class="flex items-center gap-2.5">
          <div class="relative flex size-7 items-center justify-center rounded-lg bg-linear-to-br from-[#00DC82] to-[#5865F2]">
            <span class="text-xs font-bold text-white">/d</span>
          </div>
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
        <button
          class="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-highlighted"
          title="Toggle dark mode"
          @click="toggleDark"
        >
          <Icon :icon="isDark ? 'lucide:moon' : 'lucide:sun'" class="size-4" />
        </button>
        <a
          href="https://github.com/zojize/nuxt-discord"
          target="_blank"
          title="View on GitHub"
          class="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-highlighted"
        >
          <Icon icon="simple-icons:github" class="size-4" />
        </a>
      </div>
    </div>
  </header>
</template>
