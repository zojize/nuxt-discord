<script lang="ts" setup>
import type { WatchEvent } from 'nuxt/schema'
import type { SlashCommand, SlashCommandOption } from '~/src/types'
import { computed, ref, useFetch, useRuntimeConfig, watchEffect } from '#imports'
import { useWebSocket } from '@vueuse/core'
import slashCommands from 'discord/slashCommands'
import TheHeader from '../components/TheHeader.vue'

import '../style.css'
import './slash-commands.css'

/**
 * Copied straight from discord-api-types/v10, importing it directly seems to cause issues
 *
 * @see {@link https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-type}
 */
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

function getOptionTypeLabel(type: ApplicationCommandOptionType) {
  switch (type) {
    case ApplicationCommandOptionType.String:
      return 'text'
    case ApplicationCommandOptionType.Integer:
      return 'integer'
    case ApplicationCommandOptionType.Number:
      return 'number'
    case ApplicationCommandOptionType.Boolean:
      return 'boolean'
    case ApplicationCommandOptionType.User:
      return 'user'
    case ApplicationCommandOptionType.Channel:
      return 'channel'
    case ApplicationCommandOptionType.Role:
      return 'role'
    case ApplicationCommandOptionType.Mentionable:
      return 'mention'
    case ApplicationCommandOptionType.Attachment:
      return 'file'
    default:
      return 'unknown'
  }
}

function getOptionTypeColor(type: ApplicationCommandOptionType) {
  switch (type) {
    case ApplicationCommandOptionType.String:
      return 'primary'
    case ApplicationCommandOptionType.Integer:
    case ApplicationCommandOptionType.Number:
      return 'info'
    case ApplicationCommandOptionType.Boolean:
      return 'success'
    case ApplicationCommandOptionType.User:
    case ApplicationCommandOptionType.Role:
    case ApplicationCommandOptionType.Mentionable:
      return 'secondary'
    case ApplicationCommandOptionType.Channel:
      return 'warning'
    case ApplicationCommandOptionType.Attachment:
      return 'neutral'
    default:
      return 'neutral'
  }
}

// Helper function to get remote ID from command
function getRemoteId(command: any): string | undefined {
  if ('remote' in command && command.remote?.id) {
    return command.remote.id
  }
  return undefined
}

const commands = ref(slashCommands)

const {
  data: diff,
  refresh: refreshDiff,
} = useFetch(
  '/api/discord/slash-command/remote-diff',
  {
    method: 'post',
    body: {
      commands,
    },
    immediate: import.meta.dev,
  },
)

const commandsWithStatus = computed(() => {
  if (!diff.value) {
    return commands.value.map(cmd => ({
      ...cmd,
      status: 'synced' as const,
    }))
  }

  return [
    ...diff.value.conflict.map(cmd => ({
      ...cmd,
      status: 'conflict' as const,
    })),
    ...diff.value.added.map(cmd => ({
      ...cmd,
      status: 'added' as const,
    })),
    ...diff.value.removed.map(cmd => ({
      name: cmd.name,
      description: cmd.description,
      path: 'unknown',
      options: (cmd.options as SlashCommandOption[]),
      status: 'removed' as const,
      remote: cmd,
    })),
    ...diff.value.changed.map(({ remote, local }) => ({
      ...local,
      status: 'changed' as const,
      remote,
    })),
    ...diff.value.synced.map(({ remote, local }) => ({
      ...local,
      status: 'synced' as const,
      remote,
    })),
  ]
})

const allSynced = computed(() => commandsWithStatus.value.every(cmd => cmd.status === 'synced'))
const stats = computed(() => commandsWithStatus.value.reduce((acc, cmd) => {
  if (cmd.status === 'added')
    acc.added++
  else if (cmd.status === 'removed')
    acc.removed++
  else if (cmd.status === 'changed')
    acc.changed++
  else if (cmd.status === 'synced')
    acc.synced++
  else if (cmd.status === 'conflict')
    acc.conflict++
  return acc
}, { added: 0, removed: 0, changed: 0, synced: 0, conflict: 0 }))

const pendingSync = ref(false)
async function syncCommands() {
  try {
    pendingSync.value = true
    await $fetch('/api/discord/slash-command/register', { method: 'POST' })
    await refreshDiff()
  }
  catch (error) {
    // TODO: display error toast
    console.error('Error registering commands:', error)
  }
  finally {
    pendingSync.value = false
  }
}

const runtimeConfig = useRuntimeConfig()

let ws: ReturnType<typeof useWebSocket> | undefined

if (import.meta.dev && runtimeConfig.public.discord?.wsUrl) {
  if (!('WebSocket' in window)) {
    console.warn('Could not enable hot reload, your browser does not support WebSocket')
  }
  else {
    ws = useWebSocket(runtimeConfig.public.discord.wsUrl, {
      autoReconnect: true,
      onConnected: () => {
        // eslint-disable-next-line no-console
        console.log('WebSocket connection established for slash command hot reload')
      },
    })

    // always rely on hmr full-update result as the source of truth on dev
    ws?.send(JSON.stringify({ event: 'full-update' }))
  }
}

watchEffect(() => {
  const message = ws?.data.value
  if (!message)
    return

  const data = JSON.parse(message as string) as
    | { event: WatchEvent, path: string, command: SlashCommand | null }
    | { event: 'full-update', commands: SlashCommand[] }

  if (data.event === 'full-update') {
    commands.value = data.commands
  }
  else {
    ws?.send(JSON.stringify({ event: 'full-update' }))
  }
})

const statusColors = {
  synced: 'primary',
  added: 'secondary',
  changed: 'warning',
  removed: 'neutral',
  conflict: 'error',
} as const

const statusClasses = {
  synced: '',
  added: 'ring-0 border border-dashed border-[var(--ui-secondary)]/50 divide-[var(--ui-secondary)]/50 divide-dashed',
  changed: 'ring-0 border border-dashed border-[var(--ui-warning)]/50 divide-[var(--ui-warning)]/50 divide-dashed',
  removed: 'ring-0 border border-dashed border-[var(--ui-neutral)]/50 divide-[var(--ui-neutral)]/50 divide-dashed',
  conflict: 'ring-0 border border-dashed border-[var(--ui-error)]/50 divide-[var(--ui-error)]/50 divide-dashed',
} as const
</script>

<template>
  <UApp>
    <TheHeader />
    <div class="mx-auto mb-16 px-6 container">
      <!-- Title Section -->
      <div class="my-6">
        <h1 class="text-3xl text-gray-900 font-bold mb-2 dark:text-white">
          Discord Slash Commands
        </h1>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Manage and view your registered Discord slash commands
        </p>
      </div>

      <!-- Commands Count Badge -->
      <div class="mb-6 flex w-full items-center justify-between">
        <div class="flex gap-2 items-center">
          <UBadge
            :label="`${stats.synced} ${stats.synced === 1 ? 'command' : 'commands'} synced`"
            variant="subtle"
            color="primary"
            size="lg"
          />
          <UBadge
            v-if="stats.conflict > 0"
            :label="`${stats.conflict} conflict${stats.conflict === 1 ? '' : 's'}`"
            variant="outline"
            color="error"
            size="lg"
          />
          <UBadge
            v-if="stats.added > 0"
            :label="`${stats.added} added`"
            variant="outline"
            color="secondary"
            size="lg"
          />
          <UBadge
            v-if="stats.changed > 0"
            :label="`${stats.changed} changed`"
            variant="outline"
            color="warning"
            size="lg"
          />
          <UBadge
            v-if="stats.removed > 0"
            :label="`${stats.removed} removed`"
            variant="outline"
            color="neutral"
            size="lg"
          />
        </div>

        <!-- <UButton icon="i-lucide-circle" @click="test" /> -->
        <UButton
          v-if="!allSynced"
          :icon="pendingSync ? 'i-lucide-refresh-ccw' : 'i-lucide-cloud-upload'"
          variant="outline"
          color="secondary"
          class="hover:cursor-pointer disabled:hover:cursor-not-allowed"
          :disabled="stats.conflict > 0"
          :title="stats.conflict > 0 ? 'Resolve conflicts before syncing' : 'Register out of sync commands'"
          :ui="{ leadingIcon: pendingSync ? 'animate-spin' : '' }"
          @click="syncCommands"
        >
          Sync
        </UButton>
      </div>

      <!-- Commands List -->
      <div v-if="commandsWithStatus.length > 0" class="flex flex-col gap-4">
        <UCard
          v-for="command in commandsWithStatus.sort((a, b) => a.name.localeCompare(b.name))"
          :key="command.name"
          class="transition-shadow duration-200 overflow-hidden"
          :class="statusClasses[command.status]"
          :ui="{ body: 'pt-2' }"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex gap-3 items-center">
                <UIcon name="i-heroicons-command-line" class="text-primary-500 h-5 w-5" />
                <div>
                  <h3
                    class="text-lg text-gray-700 font-semibold dark:text-gray-200"
                    :class="command.status === 'conflict' && 'text-[var(--ui-error)]!'"
                  >
                    /{{ command.name }}
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    {{ command.description }}
                  </p>
                  <UBadge
                    v-if="command.options.length > 0"
                    :label="`${command.options.length} option${command.options.length === 1 ? '' : 's'}`"
                    variant="soft"
                    color="neutral"
                    size="sm"
                  />
                </div>
              </div>

              <div class="flex gap-2 items-center">
                <UBadge
                  :label="command.status"
                  :color="statusColors[command.status]"
                  size="sm"
                  variant="soft"
                />
              </div>
            </div>
          </template>

          <!-- Command Options -->
          <div v-if="command.options.length > 0" class="mt-4">
            <h4 class="text-sm text-gray-700 font-medium mb-3 dark:text-gray-300">
              Command Options:
            </h4>
            <div class="gap-3 grid lg:grid-cols-3 sm:grid-cols-2">
              <UCard
                v-for="option in command.options"
                :key="option.name"
                variant="soft"
                class="transition-shadow duration-200 overflow-hidden"
              >
                <div class="mb-1 flex flex-wrap gap-2 items-center">
                  <span class="text-lg text-gray-900 dark:text-white">
                    {{ option.name + (!option.required ? '?' : '') }}
                  </span>
                  <UBadge
                    :label="getOptionTypeLabel(option.type)"
                    variant="soft"
                    :color="getOptionTypeColor(option.type)"
                    size="sm"
                  />
                  <UBadge
                    v-if="option.required"
                    label="required"
                    variant="soft"
                    color="error"
                    size="sm"
                  />
                  <!-- Restriction badges -->
                  <UBadge
                    v-if="'min' in option && option.min !== undefined"
                    :label="`min: ${option.min}`"
                    variant="outline"
                    color="neutral"
                    size="sm"
                  />
                  <UBadge
                    v-if="'max' in option && option.max !== undefined"
                    :label="`max: ${option.max}`"
                    variant="outline"
                    color="neutral"
                    size="sm"
                  />
                  <UBadge
                    v-if="'minLength' in option && option.minLength !== undefined"
                    :label="`min: ${option.minLength}`"
                    variant="outline"
                    color="neutral"
                    size="sm"
                  />
                  <UBadge
                    v-if="'maxLength' in option && option.maxLength !== undefined"
                    :label="`max: ${option.maxLength}`"
                    variant="outline"
                    color="neutral"
                    size="sm"
                  />
                  <!-- Choices dropdown -->
                  <UDropdownMenu
                    v-if="'choices' in option && option.choices && option.choices.length > 0"
                    :items="option.choices.map(choice => ({ label: choice.name }))"
                    :popper="{ placement: 'bottom-start' }"
                  >
                    <UBadge
                      v-if="'choices' in option && option.choices && option.choices.length > 0"
                      :label="`${option.choices.length} choices`"
                      variant="outline"
                      color="info"
                      size="sm"
                      class="hover:cursor-pointer"
                    />
                  </UDropdownMenu>
                </div>

                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ option.description }}
                </p>
              </UCard>
            </div>
          </div>
          <div v-else class="mt-4">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              No parameters defined for this command
            </p>
          </div>

          <!-- Command Path -->
          <template #footer>
            <div class="space-y-1">
              <div class="text-xs text-gray-500 flex gap-2 items-center dark:text-gray-400">
                <UIcon name="i-heroicons-folder" class="h-4 w-4" />
                <span>{{ command.path }}</span>
              </div>
              <div v-if="getRemoteId(command)" class="text-xs text-gray-500 flex gap-2 items-center dark:text-gray-400">
                <UIcon name="i-heroicons-cloud" class="h-4 w-4" />
                <span>Command ID: {{ getRemoteId(command) }}</span>
              </div>
            </div>
          </template>
        </UCard>
      </div>

      <!-- No Command -->
      <UCard v-else class="py-12 text-center">
        <div class="flex flex-col gap-4 items-center">
          <UIcon name="i-heroicons-command-line" class="text-gray-400 h-12 w-12" />
          <div>
            <h3 class="text-lg text-gray-900 font-medium mb-2 dark:text-white">
              No commands found
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              Create your first slash command to get started
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </UApp>
</template>
