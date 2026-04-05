<script lang="ts" setup>
import type { ContextMenu, Listener, SlashCommand } from '../../../types'
import contextMenus from '#build/discord/contextMenus'
import listeners from '#build/discord/listeners'
import slashCommands from '#build/discord/slashCommands'
import { computed, ref, useFetch, useRuntimeConfig, watchEffect } from '#imports'
import { useWebSocket } from '@vueuse/core'
import TheHeader from '../components/TheHeader.vue'

const commands = ref<SlashCommand[]>(slashCommands)
const menus = ref<ContextMenu[]>(contextMenus)
const eventListeners = ref<Listener[]>(listeners)

const { data: diff } = useFetch(
  '/api/discord/slash-command/remote-diff',
  { method: 'post', immediate: import.meta.dev },
)

const commandStats = computed(() => {
  if (!diff.value)
    return null
  return {
    synced: diff.value.synced.length,
    added: diff.value.added.length,
    changed: diff.value.changed.length,
    removed: diff.value.removed.length,
    conflict: diff.value.conflict.length,
  }
})

const allSynced = computed(() => {
  if (!commandStats.value)
    return true
  return commandStats.value.added === 0
    && commandStats.value.changed === 0
    && commandStats.value.removed === 0
    && commandStats.value.conflict === 0
})

const runtimeConfig = useRuntimeConfig()

let ws: ReturnType<typeof useWebSocket> | undefined
if (import.meta.dev && runtimeConfig.public.discord?.wsUrl) {
  if ('WebSocket' in window) {
    ws = useWebSocket(runtimeConfig.public.discord.wsUrl, {
      autoReconnect: true,
      onConnected: ws => ws.send(JSON.stringify({ event: 'full-update' })),
    })
  }
}

watchEffect(() => {
  const message = ws?.data.value
  if (!message)
    return
  const data = JSON.parse(message as string)
  if (data.event === 'full-update' && data.commands)
    commands.value = data.commands
})

const userMenus = computed(() => menus.value.filter(m => m.type === 'user'))
const messageMenus = computed(() => menus.value.filter(m => m.type === 'message'))

const uniqueEvents = computed(() => {
  const events = new Set(eventListeners.value.map(l => l.event))
  return events.size
})
</script>

<template>
  <div class="bg-default min-h-screen">
    <TheHeader />

    <main class="mx-auto px-6 py-8 max-w-6xl">
      <!-- Hero -->
      <div class="mb-10 relative overflow-hidden rounded-xl border border-default bg-elevated px-6 py-8">
        <div class="absolute inset-0 bg-linear-to-br from-[#00DC82]/5 via-transparent to-[#5865F2]/5" />
        <div class="relative">
          <h1 class="text-3xl tracking-tight font-bold">
            Dashboard
          </h1>
          <p class="text-muted text-sm mt-1">
            Overview of your Discord bot configuration
          </p>
        </div>
      </div>

      <!-- Stat cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <!-- Slash Commands -->
        <NuxtLink to="/discord/slash-commands" class="group">
          <UCard variant="outline" class="transition-colors group-hover:border-[#5865F2]/60">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-muted text-xs font-medium uppercase tracking-wider">
                  Slash Commands
                </p>
                <p class="text-3xl font-bold mt-1.5 text-highlighted">
                  {{ commands.length }}
                </p>
              </div>
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#5865F2]/10 text-[#5865F2]">
                <span class="text-lg font-bold">/</span>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <template v-if="commandStats && !allSynced">
                <UBadge v-if="commandStats.added" color="success" variant="subtle" size="xs">
                  {{ commandStats.added }} new
                </UBadge>
                <UBadge v-if="commandStats.changed" color="warning" variant="subtle" size="xs">
                  {{ commandStats.changed }} changed
                </UBadge>
                <UBadge v-if="commandStats.removed" color="neutral" variant="subtle" size="xs">
                  {{ commandStats.removed }} removed
                </UBadge>
                <UBadge v-if="commandStats.conflict" color="error" variant="subtle" size="xs">
                  {{ commandStats.conflict }} conflict
                </UBadge>
              </template>
              <UBadge v-else color="success" variant="subtle" size="xs">
                synced
              </UBadge>
            </div>
          </UCard>
        </NuxtLink>

        <!-- Context Menus -->
        <NuxtLink to="/discord/context-menus" class="group">
          <UCard variant="outline" class="transition-colors group-hover:border-[#00DC82]/60">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-muted text-xs font-medium uppercase tracking-wider">
                  Context Menus
                </p>
                <p class="text-3xl font-bold mt-1.5 text-highlighted">
                  {{ menus.length }}
                </p>
              </div>
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#00DC82]/10 text-[#00DC82]">
                <svg class="size-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V5zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V9zm0 4a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" clip-rule="evenodd" />
                </svg>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <UBadge v-if="userMenus.length" color="info" variant="subtle" size="xs">
                {{ userMenus.length }} user
              </UBadge>
              <UBadge v-if="messageMenus.length" color="secondary" variant="subtle" size="xs">
                {{ messageMenus.length }} message
              </UBadge>
              <span v-if="menus.length === 0" class="text-dimmed text-xs">none defined</span>
            </div>
          </UCard>
        </NuxtLink>

        <!-- Event Listeners -->
        <NuxtLink to="/discord/listeners" class="group">
          <UCard variant="outline" class="transition-colors group-hover:border-amber-500/60">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-muted text-xs font-medium uppercase tracking-wider">
                  Event Listeners
                </p>
                <p class="text-3xl font-bold mt-1.5 text-highlighted">
                  {{ eventListeners.length }}
                </p>
              </div>
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                <svg class="size-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
                </svg>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <UBadge v-if="uniqueEvents" color="warning" variant="subtle" size="xs">
                {{ uniqueEvents }} event{{ uniqueEvents === 1 ? '' : 's' }}
              </UBadge>
              <UBadge
                v-if="eventListeners.some(l => l.once)"
                color="neutral" variant="subtle" size="xs"
              >
                {{ eventListeners.filter(l => l.once).length }} once
              </UBadge>
              <span v-if="eventListeners.length === 0" class="text-dimmed text-xs">none defined</span>
            </div>
          </UCard>
        </NuxtLink>
      </div>

      <USeparator class="mb-8" />

      <!-- Quick lists -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Commands list -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
              Commands
            </h2>
            <NuxtLink to="/discord/slash-commands" class="text-xs text-primary hover:underline">
              View all
            </NuxtLink>
          </div>
          <UCard variant="outline" :ui="{ body: 'p-0!' }">
            <div v-if="commands.length === 0" class="p-6 text-center text-dimmed text-sm">
              No commands defined
            </div>
            <div v-else class="divide-y divide-default">
              <div
                v-for="cmd in commands.slice(0, 8)"
                :key="cmd.name"
                class="flex items-center justify-between px-4 py-2.5"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <code class="text-highlighted text-sm font-medium">/{{ cmd.name }}</code>
                  <span class="text-dimmed text-xs truncate">{{ cmd.description }}</span>
                </div>
                <div class="flex shrink-0 gap-1.5">
                  <UBadge
                    v-if="cmd.options.length"
                    :label="`${cmd.options.length} opt`"
                    color="neutral" variant="subtle" size="xs"
                  />
                  <UBadge
                    v-if="'subcommands' in cmd && cmd.subcommands?.length"
                    :label="`${cmd.subcommands.length} sub`"
                    color="info" variant="subtle" size="xs"
                  />
                </div>
              </div>
              <div v-if="commands.length > 8" class="px-4 py-2 text-center">
                <NuxtLink to="/discord/slash-commands" class="text-xs text-primary hover:underline">
                  +{{ commands.length - 8 }} more
                </NuxtLink>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Right column: context menus + listeners -->
        <div class="space-y-6">
          <!-- Context Menus -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
                Context Menus
              </h2>
              <NuxtLink to="/discord/context-menus" class="text-xs text-primary hover:underline">
                View all
              </NuxtLink>
            </div>
            <UCard variant="outline" :ui="{ body: 'p-0!' }">
              <div v-if="menus.length === 0" class="p-6 text-center text-dimmed text-sm">
                No context menus defined
              </div>
              <div v-else class="divide-y divide-default">
                <div
                  v-for="menu in menus"
                  :key="menu.name"
                  class="flex items-center justify-between px-4 py-2.5"
                >
                  <span class="text-highlighted text-sm font-medium">{{ menu.name }}</span>
                  <UBadge
                    :label="menu.type"
                    :color="menu.type === 'user' ? 'info' : 'secondary'"
                    variant="subtle" size="xs"
                  />
                </div>
              </div>
            </UCard>
          </div>

          <!-- Listeners -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
                Event Listeners
              </h2>
              <NuxtLink to="/discord/listeners" class="text-xs text-primary hover:underline">
                View all
              </NuxtLink>
            </div>
            <UCard variant="outline" :ui="{ body: 'p-0!' }">
              <div v-if="eventListeners.length === 0" class="p-6 text-center text-dimmed text-sm">
                No listeners defined
              </div>
              <div v-else class="divide-y divide-default">
                <div
                  v-for="listener in eventListeners"
                  :key="listener.path"
                  class="flex items-center justify-between px-4 py-2.5"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <code class="text-highlighted text-sm font-medium">{{ listener.event }}</code>
                    <span class="text-dimmed text-xs truncate font-mono">{{ listener.path.split('/discord/listeners/').pop() }}</span>
                  </div>
                  <UBadge
                    v-if="listener.once"
                    label="once"
                    color="warning" variant="subtle" size="xs"
                  />
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
