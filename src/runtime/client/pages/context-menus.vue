<script lang="ts" setup>
import type { ContextMenu } from '../../../types'
import contextMenus from '#build/discord/contextMenus'
import { computed, ref } from '#imports'
import TheHeader from '../components/TheHeader.vue'

const menus = ref<ContextMenu[]>(contextMenus)

const userMenus = computed(() => menus.value.filter(m => m.type === 'user'))
const messageMenus = computed(() => menus.value.filter(m => m.type === 'message'))
</script>

<template>
  <div class="bg-default min-h-screen">
    <TheHeader />

    <main class="mx-auto px-6 py-8 max-w-6xl">
      <!-- Title bar -->
      <div class="mb-8">
        <h1 class="text-2xl tracking-tight font-bold">
          Context Menus
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ menus.length }} context menu{{ menus.length === 1 ? '' : 's' }} registered
        </p>
      </div>

      <!-- Type filter pills -->
      <div v-if="menus.length > 0" class="mb-6 flex flex-wrap gap-2">
        <UBadge v-if="userMenus.length" color="info" variant="subtle" size="sm">
          {{ userMenus.length }} user
        </UBadge>
        <UBadge v-if="messageMenus.length" color="secondary" variant="subtle" size="sm">
          {{ messageMenus.length }} message
        </UBadge>
      </div>

      <USeparator class="mb-8" />

      <!-- User Context Menus -->
      <div v-if="userMenus.length > 0" class="mb-8">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted mb-4 flex items-center gap-2">
          <svg class="size-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
          </svg>
          User Context Menus
        </h2>
        <p class="text-dimmed text-xs mb-4">
          Right-click a user → Apps → your command
        </p>
        <div class="space-y-3">
          <UCard
            v-for="menu in userMenus"
            :key="menu.name"
            variant="outline"
          >
            <template #header>
              <div class="flex gap-4 items-center justify-between">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="text-highlighted text-base font-semibold">{{ menu.name }}</span>
                  <UBadge label="user" color="info" variant="subtle" size="xs" />
                  <UBadge v-if="menu.guilds" :label="menu.guilds === true ? 'guild' : `${menu.guilds.length} guild(s)`" color="warning" variant="soft" size="xs" />
                </div>
              </div>
            </template>
            <template #footer>
              <a :href="`vscode://file${menu.path}`" class="text-dimmed text-xs font-mono truncate hover:text-highlighted transition-colors">{{ menu.path.split('/discord/context-menus/').pop() }}</a>
            </template>
          </UCard>
        </div>
      </div>

      <!-- Message Context Menus -->
      <div v-if="messageMenus.length > 0" class="mb-8">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted mb-4 flex items-center gap-2">
          <svg class="size-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 13V5a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2h3l3 3 3-3h3a2 2 0 002-2z" clip-rule="evenodd" />
          </svg>
          Message Context Menus
        </h2>
        <p class="text-dimmed text-xs mb-4">
          Right-click a message → Apps → your command
        </p>
        <div class="space-y-3">
          <UCard
            v-for="menu in messageMenus"
            :key="menu.name"
            variant="outline"
          >
            <template #header>
              <div class="flex gap-4 items-center justify-between">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="text-highlighted text-base font-semibold">{{ menu.name }}</span>
                  <UBadge label="message" color="secondary" variant="subtle" size="xs" />
                  <UBadge v-if="menu.guilds" :label="menu.guilds === true ? 'guild' : `${menu.guilds.length} guild(s)`" color="warning" variant="soft" size="xs" />
                </div>
              </div>
            </template>
            <template #footer>
              <a :href="`vscode://file${menu.path}`" class="text-dimmed text-xs font-mono truncate hover:text-highlighted transition-colors">{{ menu.path.split('/discord/context-menus/').pop() }}</a>
            </template>
          </UCard>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="menus.length === 0" class="py-20 text-center flex flex-col items-center justify-center">
        <div class="bg-elevated mb-4 rounded-2xl flex size-16 items-center justify-center">
          <svg class="size-7 text-muted" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V5zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V9zm0 4a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" clip-rule="evenodd" />
          </svg>
        </div>
        <h3 class="text-lg font-semibold">
          No context menus yet
        </h3>
        <p class="text-muted text-sm mt-1 max-w-sm">
          Create a file in <code class="bg-elevated text-xs px-1.5 py-0.5 rounded">discord/context-menus/</code> to get started.
        </p>
      </div>
    </main>
  </div>
</template>
