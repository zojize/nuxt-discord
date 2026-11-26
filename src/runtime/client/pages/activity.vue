<script lang="ts" setup>
import type { ActivityLogEntry } from '../../../types'
import { computed, ref, useRuntimeConfig } from '#imports'
import TheHeader from '../components/TheHeader.vue'
import { useActivityLog } from '../useActivityLog'

const { public: config } = useRuntimeConfig()
const { entries, paused, togglePause, clearLog } = useActivityLog(
  signal => $fetch<ActivityLogEntry[]>('/api/discord/activity', { signal, timeout: 5000, retry: 0 }),
  import.meta.dev ? config.discord?.wsUrl : undefined,
)
const filter = ref<'all' | 'command' | 'context-menu' | 'error'>('all')

const filtered = computed(() => {
  const list = filter.value === 'all'
    ? entries.value
    : filter.value === 'error'
      ? entries.value.filter(e => e.status === 'error')
      : entries.value.filter(e => e.type === filter.value)
  return list.toReversed()
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

    <main id="discord-main" tabindex="-1" class="mx-auto px-6 py-8 max-w-6xl">
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
            :aria-pressed="paused"
            @click="togglePause"
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
          :aria-pressed="filter === f.key"
          @click="filter = f.key"
        >
          {{ f.label }}
          <span v-if="f.key === 'error' && stats.errors > 0" class="ml-1 text-red-500">{{ stats.errors }}</span>
        </button>
      </div>

      <!-- Log entries -->
      <div class="rounded-lg border border-default overflow-hidden">
        <!-- Header row -->
        <div aria-hidden="true" class="hidden grid-cols-[4rem_minmax(0,1fr)_6rem_4rem_3rem] gap-x-4 border-b border-default bg-elevated px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-dimmed md:grid">
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
        <ul v-else role="list" class="divide-y divide-default md:max-h-[calc(100vh-24rem)] md:overflow-y-auto">
          <li
            v-for="entry in filtered"
            :key="`${entry.timestamp}/${entry.id}`"
            class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 px-4 py-3 text-sm transition-colors hover:bg-elevated/50 md:grid-cols-[4rem_minmax(0,1fr)_6rem_4rem_3rem] md:items-center md:gap-x-4 md:py-2"
            :class="entry.status === 'error' ? 'bg-red-500/3' : ''"
          >
            <div class="flex min-w-0 items-start gap-2 md:col-start-2 md:row-start-1 md:items-center">
              <span
                aria-hidden="true"
                class="flex size-5 shrink-0 items-center justify-center rounded bg-elevated text-[10px] font-bold"
                :class="typeColor[entry.type]"
              >{{ typeIcon[entry.type] ?? '?' }}</span>
              <div class="min-w-0 md:flex md:items-baseline md:gap-2">
                <span class="block font-medium wrap-anywhere text-highlighted md:truncate">{{ entry.name }}</span>
                <span v-if="entry.detail" class="block text-xs wrap-anywhere text-error md:truncate">{{ entry.detail }}</span>
              </div>
            </div>

            <span class="inline-flex items-center justify-end gap-1.5 text-xs text-muted md:col-start-5 md:row-start-1">
              <span
                aria-hidden="true"
                class="inline-block size-2 rounded-full"
                :class="entry.status === 'ok' ? 'bg-emerald-500' : 'bg-red-500'"
              />
              <span class="capitalize md:sr-only">{{ entry.status }}</span>
            </span>

            <div class="col-span-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted md:contents">
              <span class="font-mono text-dimmed tabular-nums md:col-start-1 md:row-start-1">
                <span class="sr-only">Time </span>{{ formatTime(entry.timestamp) }}
              </span>
              <span class="min-w-0 wrap-anywhere md:col-start-3 md:row-start-1 md:truncate md:text-right">
                <span class="sr-only">User </span><span>{{ entry.userName ?? '—' }}</span>
              </span>
              <span
                class="font-mono tabular-nums md:col-start-4 md:row-start-1 md:text-right"
                :class="(entry.duration ?? 0) > 1000 ? 'text-amber-500' : 'text-dimmed'"
              >
                <span class="sr-only">Duration </span><span>{{ entry.duration != null ? `${entry.duration}ms` : '—' }}</span>
              </span>
            </div>
          </li>
        </ul>
      </div>
    </main>
  </div>
</template>
