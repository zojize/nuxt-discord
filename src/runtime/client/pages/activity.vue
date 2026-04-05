<script lang="ts" setup>
import type { ActivityLogEntry } from '../../../types'
import { computed, onMounted, ref, useRuntimeConfig, watchEffect } from '#imports'
import { useWebSocket } from '@vueuse/core'
import TheHeader from '../components/TheHeader.vue'

const entries = ref<ActivityLogEntry[]>([])
const filter = ref<'all' | 'command' | 'context-menu' | 'error'>('all')
const paused = ref(false)

onMounted(async () => {
  try {
    const data = await $fetch<ActivityLogEntry[]>('/api/discord/activity')
    entries.value = data
  }
  catch { /* server may not be ready */ }
})

const runtimeConfig = useRuntimeConfig()
if (import.meta.dev && runtimeConfig.public.discord?.wsUrl) {
  if (typeof window !== 'undefined' && 'WebSocket' in window) {
    const ws = useWebSocket(runtimeConfig.public.discord.wsUrl, {
      autoReconnect: true,
    })
    watchEffect(() => {
      const message = ws.data.value
      if (!message || paused.value)
        return
      const data = JSON.parse(message as string)
      if (data.event === 'activity' && data.entry) {
        entries.value.push(data.entry)
        if (entries.value.length > 500)
          entries.value.splice(0, entries.value.length - 500)
      }
    })
  }
}

const filtered = computed(() => {
  const list = filter.value === 'all'
    ? entries.value
    : filter.value === 'error'
      ? entries.value.filter(e => e.status === 'error')
      : entries.value.filter(e => e.type === filter.value)
  return [...list].reverse()
})

const stats = computed(() => {
  const total = entries.value.length
  const errors = entries.value.filter(e => e.status === 'error').length
  const commands = entries.value.filter(e => e.type === 'command').length
  const contextMenus = entries.value.filter(e => e.type === 'context-menu').length
  const avgDuration = total > 0
    ? Math.round(entries.value.reduce((sum, e) => sum + (e.duration ?? 0), 0) / total)
    : 0
  return { total, errors, commands, contextMenus, avgDuration }
})

const typeIcon: Record<string, string> = {
  'command': '/',
  'context-menu': '\u2261',
  'autocomplete': '\u2026',
  'error': '!',
  'listener': '\u26A1',
}

const typeColor: Record<string, string> = {
  'command': 'text-[#5865F2]',
  'context-menu': 'text-[#00DC82]',
  'autocomplete': 'text-muted',
  'error': 'text-red-500',
  'listener': 'text-amber-500',
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function clearLog() {
  entries.value = []
}

const filters = [
  { key: 'all' as const, label: 'All' },
  { key: 'command' as const, label: 'Commands' },
  { key: 'context-menu' as const, label: 'Context Menus' },
  { key: 'error' as const, label: 'Errors' },
]
</script>

<template>
  <div class="bg-default min-h-screen">
    <TheHeader />

    <main class="mx-auto px-6 py-8 max-w-6xl">
      <!-- Title bar -->
      <div class="mb-6 flex items-start justify-between">
        <div>
          <h1 class="text-2xl tracking-tight font-bold">
            Activity Log
          </h1>
          <p class="text-muted text-sm mt-1">
            Live interaction history
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            :class="paused ? 'border-amber-500/50 text-amber-500 bg-amber-500/5' : 'border-default text-muted hover:text-highlighted hover:bg-elevated'"
            @click="paused = !paused"
          >
            {{ paused ? 'Resume' : 'Pause' }}
          </button>
          <button
            class="cursor-pointer rounded-md border border-default px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-highlighted hover:bg-elevated"
            @click="clearLog"
          >
            Clear
          </button>
        </div>
      </div>

      <!-- Stats row -->
      <div class="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div class="rounded-lg border border-default bg-elevated px-3 py-2">
          <p class="text-dimmed text-[10px] font-medium uppercase tracking-wider">
            Total
          </p>
          <p class="text-xl font-bold text-highlighted tabular-nums">
            {{ stats.total }}
          </p>
        </div>
        <div class="rounded-lg border border-default bg-elevated px-3 py-2">
          <p class="text-dimmed text-[10px] font-medium uppercase tracking-wider">
            Commands
          </p>
          <p class="text-xl font-bold text-[#5865F2] tabular-nums">
            {{ stats.commands }}
          </p>
        </div>
        <div class="rounded-lg border border-default bg-elevated px-3 py-2">
          <p class="text-dimmed text-[10px] font-medium uppercase tracking-wider">
            Context Menus
          </p>
          <p class="text-xl font-bold text-[#00DC82] tabular-nums">
            {{ stats.contextMenus }}
          </p>
        </div>
        <div class="rounded-lg border border-default bg-elevated px-3 py-2">
          <p class="text-dimmed text-[10px] font-medium uppercase tracking-wider">
            Errors
          </p>
          <p class="text-xl font-bold tabular-nums" :class="stats.errors > 0 ? 'text-red-500' : 'text-highlighted'">
            {{ stats.errors }}
          </p>
        </div>
        <div class="rounded-lg border border-default bg-elevated px-3 py-2">
          <p class="text-dimmed text-[10px] font-medium uppercase tracking-wider">
            Avg Duration
          </p>
          <p class="text-xl font-bold text-highlighted tabular-nums">
            {{ stats.avgDuration }}<span class="text-xs text-dimmed font-normal">ms</span>
          </p>
        </div>
      </div>

      <!-- Filters -->
      <div class="mb-4 flex items-center gap-1">
        <button
          v-for="f in filters"
          :key="f.key"
          class="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
          :class="filter === f.key
            ? 'bg-elevated text-highlighted'
            : 'text-muted hover:text-highlighted hover:bg-elevated/50'"
          @click="filter = f.key"
        >
          {{ f.label }}
          <span v-if="f.key === 'error' && stats.errors > 0" class="ml-1 text-red-500">{{ stats.errors }}</span>
        </button>
      </div>

      <!-- Log entries -->
      <div class="rounded-lg border border-default overflow-hidden">
        <!-- Header row -->
        <div class="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 border-b border-default bg-elevated px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-dimmed">
          <span class="w-16">Time</span>
          <span>Event</span>
          <span class="w-24 text-right">User</span>
          <span class="w-16 text-right">Duration</span>
          <span class="w-12 text-right">Status</span>
        </div>

        <!-- Entries -->
        <div v-if="filtered.length === 0" class="px-4 py-12 text-center text-dimmed text-sm">
          {{ entries.length === 0 ? 'No activity yet — interact with your bot to see events here' : 'No matching entries' }}
        </div>
        <div v-else class="divide-y divide-default max-h-[calc(100vh-24rem)] overflow-y-auto">
          <div
            v-for="entry in filtered"
            :key="entry.id"
            class="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-4 py-2 text-sm transition-colors hover:bg-elevated/50"
            :class="entry.status === 'error' ? 'bg-red-500/3' : ''"
          >
            <!-- Time -->
            <span class="w-16 font-mono text-xs text-dimmed tabular-nums">{{ formatTime(entry.timestamp) }}</span>

            <!-- Event -->
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                :class="typeColor[entry.type]"
                style="background: var(--ui-bg-elevated);"
              >{{ typeIcon[entry.type] ?? '?' }}</span>
              <span class="font-medium text-highlighted truncate">{{ entry.name }}</span>
              <span v-if="entry.detail" class="truncate text-xs text-error">{{ entry.detail }}</span>
            </div>

            <!-- User -->
            <span class="w-24 text-right text-xs text-muted truncate">{{ entry.userName ?? '—' }}</span>

            <!-- Duration -->
            <span class="w-16 text-right font-mono text-xs tabular-nums" :class="(entry.duration ?? 0) > 1000 ? 'text-amber-500' : 'text-dimmed'">
              {{ entry.duration != null ? `${entry.duration}ms` : '—' }}
            </span>

            <!-- Status -->
            <span class="w-12 text-right">
              <span
                class="inline-block size-2 rounded-full"
                :class="entry.status === 'ok' ? 'bg-emerald-500' : 'bg-red-500'"
              />
            </span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
