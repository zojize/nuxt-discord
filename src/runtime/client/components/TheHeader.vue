<script lang="ts" setup>
import { Icon } from '@iconify/vue'
import { ref } from 'vue'

const isDark = ref(false)

function toggleDark() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
}
</script>

<template>
  <header class="sticky top-0 z-50 w-full border-b border-default bg-default/80 backdrop-blur-xl">
    <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
      <NuxtLink to="/discord/slash-commands" class="flex items-center gap-2.5">
        <div class="flex size-7 items-center justify-center rounded-lg bg-[#5865F2]">
          <span class="text-sm font-bold text-white">/</span>
        </div>
        <span class="text-sm font-semibold tracking-tight">nuxt-discord</span>
      </NuxtLink>

      <div class="flex items-center gap-1">
        <button
          class="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-highlighted"
          @click="toggleDark"
        >
          <Icon :name="isDark ? 'lucide:moon' : 'lucide:sun'" class="size-4" />
        </button>
        <a
          href="https://github.com/zojize/nuxt-discord"
          target="_blank"
          class="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-highlighted"
        >
          <Icon name="simple-icons:github" class="size-4" />
        </a>
      </div>
    </div>
  </header>
</template>
