<script lang="ts" setup>
import type { WatchEvent } from 'nuxt/schema'
import type { SlashCommand, SlashCommandOption } from '../../../types'
import slashCommands from '#build/discord/slashCommands'
import { computed, ref, useFetch, useRuntimeConfig, useToast, watchEffect } from '#imports'
import { useWebSocket } from '@vueuse/core'
import TheHeader from '../components/TheHeader.vue'

enum ApplicationCommandOptionType {
  Subcommand = 1,
  SubcommandGroup = 2,
  String = 3,
  Integer = 4,
  Boolean = 5,
  User = 6,
  Channel = 7,
  Role = 8,
  Mentionable = 9,
  Number = 10,
  Attachment = 11,
}

const typeConfig: Record<number, { label: string, color: string }> = {
  [ApplicationCommandOptionType.String]: { label: 'str', color: 'primary' },
  [ApplicationCommandOptionType.Integer]: { label: 'int', color: 'info' },
  [ApplicationCommandOptionType.Number]: { label: 'num', color: 'info' },
  [ApplicationCommandOptionType.Boolean]: { label: 'bool', color: 'success' },
  [ApplicationCommandOptionType.User]: { label: 'user', color: 'secondary' },
  [ApplicationCommandOptionType.Channel]: { label: 'chan', color: 'warning' },
  [ApplicationCommandOptionType.Role]: { label: 'role', color: 'secondary' },
  [ApplicationCommandOptionType.Mentionable]: { label: '@', color: 'secondary' },
  [ApplicationCommandOptionType.Attachment]: { label: 'file', color: 'neutral' },
}

function getRemoteId(command: any): string | undefined {
  if ('remote' in command && command.remote?.id)
    return command.remote.id
}

const commands = ref(slashCommands)

const {
  data: diff,
  refresh: refreshDiff,
} = useFetch(
  '/api/discord/slash-command/remote-diff',
  { method: 'post', immediate: import.meta.dev },
)

const commandsWithStatus = computed(() => {
  if (!diff.value) {
    return commands.value.map(cmd => ({
      ...cmd,
      status: 'synced' as const,
    }))
  }

  return [
    ...diff.value.conflict.map(cmd => ({ ...cmd, status: 'conflict' as const })),
    ...diff.value.added.map(cmd => ({ ...cmd, status: 'added' as const })),
    ...diff.value.removed.map(cmd => ({
      name: cmd.name,
      description: cmd.description,
      path: 'unknown',
      options: (cmd.options as SlashCommandOption[]) ?? [],
      status: 'removed' as const,
      remote: cmd,
    })),
    ...diff.value.changed.map(({ remote, local }) => ({ ...local, status: 'changed' as const, remote })),
    ...diff.value.synced.map(({ remote, local }) => ({ ...local, status: 'synced' as const, remote })),
  ]
})

const sortedCommands = computed(() =>
  [...commandsWithStatus.value].sort((a, b) => a.name.localeCompare(b.name)),
)

const allSynced = computed(() => commandsWithStatus.value.every(cmd => cmd.status === 'synced'))
const stats = computed(() => commandsWithStatus.value.reduce((acc, cmd) => {
  acc[cmd.status]++
  return acc
}, { added: 0, removed: 0, changed: 0, synced: 0, conflict: 0 }))

const runtimeConfig = useRuntimeConfig()

let ws: ReturnType<typeof useWebSocket> | undefined
if (import.meta.dev && runtimeConfig.public.discord?.wsUrl) {
  if ('WebSocket' in window) {
    ws = useWebSocket(runtimeConfig.public.discord.wsUrl, {
      autoReconnect: true,
      onConnected: (ws) => {
        ws.send(JSON.stringify({ event: 'full-update' }))
      },
    })
  }
}

const toast = useToast()
const pendingSync = ref(false)
async function syncCommands() {
  try {
    pendingSync.value = true
    await $fetch('/api/discord/slash-command/register', { method: 'POST' })
    await refreshDiff()
    ws?.send(JSON.stringify({ event: 'full-update' }))
    toast.add({ title: 'Commands synced', color: 'success' })
  }
  catch (error) {
    toast.add({ title: 'Sync failed', description: String(error), color: 'error' })
  }
  finally {
    pendingSync.value = false
  }
}

watchEffect(() => {
  const message = ws?.data.value
  if (!message)
    return
  const data = JSON.parse(message as string) as
    | { event: WatchEvent, path: string, command: SlashCommand | null }
    | { event: 'full-update', commands: SlashCommand[] }
  if (data.event === 'full-update')
    commands.value = data.commands
  else
    ws?.send(JSON.stringify({ event: 'full-update' }))
})

const statusMeta = {
  synced: { color: 'primary', classes: '' },
  added: { color: 'success', classes: 'border-dashed border-emerald-500/40' },
  changed: { color: 'warning', classes: 'border-dashed border-amber-500/40' },
  removed: { color: 'neutral', classes: 'border-dashed border-neutral-400/40 opacity-60' },
  conflict: { color: 'error', classes: 'border-dashed border-red-500/40' },
} as const

function constraintBadges(option: SlashCommandOption) {
  const badges: string[] = []
  if ('min' in option && option.min !== undefined)
    badges.push(`>=${option.min}`)
  if ('max' in option && option.max !== undefined)
    badges.push(`<=${option.max}`)
  if ('minLength' in option && option.minLength !== undefined)
    badges.push(`len>=${option.minLength}`)
  if ('maxLength' in option && option.maxLength !== undefined)
    badges.push(`len<=${option.maxLength}`)
  if ('choices' in option && option.choices?.length)
    badges.push(`${option.choices.length} choices`)
  return badges
}
</script>

<template>
  <div class="bg-default min-h-screen">
    <TheHeader />

    <main class="mx-auto px-6 py-8 max-w-6xl">
      <!-- Title bar -->
      <div class="mb-8 flex items-start justify-between">
        <div>
          <h1 class="text-2xl tracking-tight font-bold">
            Slash Commands
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ commandsWithStatus.length }} command{{ commandsWithStatus.length === 1 ? '' : 's' }} registered
          </p>
        </div>
        <UButton
          v-if="!allSynced"
          label="Sync to Discord"
          color="primary"
          variant="solid"
          size="sm"
          class="cursor-pointer"
          :loading="pendingSync"
          :disabled="stats.conflict > 0"
          @click="syncCommands"
        />
      </div>

      <!-- Status pills -->
      <div v-if="!allSynced" class="mb-6 flex flex-wrap gap-2">
        <template v-for="(count, key) in stats" :key="key">
          <UBadge
            v-if="count > 0"
            :color="statusMeta[key].color"
            variant="subtle"
            size="sm"
          >
            {{ count }} {{ key }}
          </UBadge>
        </template>
      </div>

      <USeparator class="mb-8" />

      <!-- Commands -->
      <div v-if="sortedCommands.length > 0" class="space-y-3">
        <UCard
          v-for="command in sortedCommands"
          :key="command.name"
          variant="outline"
          :class="statusMeta[command.status].classes"
          :ui="command.options.length === 0 ? { body: 'hidden' } : {}"
        >
          <template #header>
            <div class="flex gap-4 items-start justify-between">
              <div class="flex-1 min-w-0">
                <div class="flex flex-wrap gap-2 items-center">
                  <code class="text-highlighted text-base font-semibold">/{{ command.name }}</code>
                  <UBadge
                    :color="statusMeta[command.status].color"
                    variant="subtle"
                    size="xs"
                    :label="command.status"
                  />
                  <UBadge v-if="'nsfw' in command && command.nsfw" label="nsfw" color="error" variant="soft" size="xs" />
                  <UBadge v-if="'guilds' in command && command.guilds" :label="command.guilds === true ? 'guild' : `guild: ${Array.isArray(command.guilds) ? command.guilds.length : 1}`" color="warning" variant="soft" size="xs" />
                  <UBadge v-if="'contexts' in command && command.contexts?.length === 1" label="no DM" color="neutral" variant="outline" size="xs" />
                  <UBadge v-if="'defaultMemberPermissions' in command && command.defaultMemberPermissions" label="restricted" color="warning" variant="outline" size="xs" :title="`permissions: ${command.defaultMemberPermissions}`" />
                </div>
                <p class="text-muted text-sm mt-1">
                  {{ command.description }}
                </p>
              </div>

              <div class="pt-0.5 flex shrink-0 flex-wrap gap-1.5 items-center">
                <UBadge
                  v-if="'subcommands' in command && (command.subcommands?.length ?? 0) > 0"
                  :label="`${command.subcommands!.length} sub`"
                  color="info" variant="soft" size="xs"
                />
                <UBadge
                  v-if="getRemoteId(command)"
                  label="registered" color="success" variant="soft" size="xs"
                  :title="`ID: ${getRemoteId(command)}`"
                />
              </div>
            </div>
          </template>

          <!-- Options (body hidden via ui prop when empty) -->
          <div v-if="command.options.length > 0" class="flex flex-wrap gap-2">
            <div
              v-for="option in command.options"
              :key="option.name"
              :title="option.description || option.name"
              class="border-default bg-elevated text-xs px-2.5 py-1.5 border rounded-md flex gap-1.5 items-center cursor-default"
            >
              <span class="font-medium">{{ option.name }}</span>
              <span v-if="!option.required" class="text-dimmed">?</span>
              <UBadge
                :label="typeConfig[option.type]?.label ?? '?'"
                :color="(typeConfig[option.type]?.color ?? 'neutral') as any"
                variant="subtle" size="xs"
              />
              <UBadge
                v-for="c in constraintBadges(option)" :key="c"
                :label="c" color="neutral" variant="outline" size="xs"
              />
              <UBadge
                v-if="option.hasAutocomplete"
                label="auto" color="info" variant="outline" size="xs"
              />
            </div>
          </div>

          <template #footer>
            <div class="text-dimmed text-xs flex items-center justify-between">
              <span class="font-mono truncate">{{ command.path.split('/discord/commands/').pop() }}</span>
              <span v-if="getRemoteId(command)" class="font-mono shrink-0">{{ getRemoteId(command) }}</span>
            </div>
          </template>
        </UCard>
      </div>

      <!-- Empty state -->
      <div v-else class="py-20 text-center flex flex-col items-center justify-center">
        <div class="bg-elevated mb-4 rounded-2xl flex size-16 items-center justify-center">
          <span class="text-2xl">/</span>
        </div>
        <h3 class="text-lg font-semibold">
          No commands yet
        </h3>
        <p class="text-muted text-sm mt-1 max-w-sm">
          Create a file in <code class="bg-elevated text-xs px-1.5 py-0.5 rounded">discord/commands/</code> to get started.
        </p>
      </div>
    </main>
  </div>
</template>
