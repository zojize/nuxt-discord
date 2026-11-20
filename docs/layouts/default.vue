<script setup lang="ts">
import AppearanceSelect from '../../src/runtime/client/components/AppearanceSelect.vue'
</script>

<template>
  <div class="min-h-screen bg-default">
    <!-- Header -->
    <header class="sticky top-0 z-50 w-full border-b border-default bg-default/80 backdrop-blur-xl">
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <NuxtLink to="/" class="flex items-center gap-2.5">
          <div class="flex size-7 items-center justify-center rounded-lg bg-[#5865F2]">
            <span class="text-sm font-bold text-white">/</span>
          </div>
          <span class="text-sm font-semibold tracking-tight">nuxt-discord</span>
          <UBadge label="docs" variant="subtle" color="neutral" size="xs" />
        </NuxtLink>

        <div class="flex items-center gap-1">
          <AppearanceSelect />
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

    <details :key="$route.path" class="px-6 py-3 lg:hidden">
      <summary class="cursor-pointer">
        Browse documentation
      </summary>
      <GuideNav class="mt-4" />
    </details>
    <div class="mx-auto flex max-w-7xl">
      <!-- Sidebar -->
      <aside class="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r border-default px-4 py-6 lg:block">
        <GuideNav />
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
