<script lang="ts" setup>
import type { Listener } from '../../../types'
import listeners from '#build/discord/listeners'
import { ref, useRuntimeConfig } from '#imports'
import TheHeader from '../components/TheHeader.vue'

const eventListeners = ref<Listener[]>(listeners)
const rootDir = useRuntimeConfig().public.discord?.rootDir as string | undefined
</script>

<template>
  <div class="bg-default min-h-screen">
    <TheHeader />

    <main class="mx-auto px-6 py-8 max-w-6xl">
      <div class="mb-8">
        <h1 class="text-2xl tracking-tight font-bold">
          Event Listeners
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ eventListeners.length }} listener{{ eventListeners.length === 1 ? '' : 's' }} registered
        </p>
      </div>

      <USeparator class="mb-8" />

      <div v-if="eventListeners.length > 0" class="space-y-3">
        <UCard
          v-for="listener in eventListeners"
          :key="listener.path"
          variant="outline"
        >
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
                  <svg class="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
                  </svg>
                </div>
                <code class="text-highlighted text-base font-semibold">{{ listener.event }}</code>
                <UBadge v-if="listener.once" label="once" color="warning" variant="subtle" size="xs" />
              </div>
            </div>
          </template>
          <template #footer>
            <a
              v-if="rootDir"
              :href="`vscode://file${listener.path}`"
              class="text-dimmed text-xs font-mono truncate hover:text-highlighted transition-colors"
            >{{ listener.path.split('/discord/listeners/').pop() }}</a>
            <span v-else class="text-dimmed text-xs font-mono truncate">{{ listener.path.split('/discord/listeners/').pop() }}</span>
          </template>
        </UCard>
      </div>

      <!-- Empty state -->
      <div v-else class="py-20 text-center flex flex-col items-center justify-center">
        <div class="bg-elevated mb-4 rounded-2xl flex size-16 items-center justify-center">
          <svg class="size-7 text-muted" viewBox="0 0 20 20" fill="currentColor">
            <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
          </svg>
        </div>
        <h3 class="text-lg font-semibold">
          No listeners yet
        </h3>
        <p class="text-muted text-sm mt-1 max-w-sm">
          Create a file in <code class="bg-elevated text-xs px-1.5 py-0.5 rounded">discord/listeners/</code> to get started.
        </p>
      </div>
    </main>
  </div>
</template>
