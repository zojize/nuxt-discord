import type { SlashCommand } from '../../types'
import { useWebSocket } from '@vueuse/core'
import { computed, shallowRef, useFetch, useRuntimeConfig, watch } from '#imports'
import { useDashboardCatalog } from './useDashboardCatalog'

export function useCommandRegistry() {
  const catalog = useDashboardCatalog()
  const updatedCommands = shallowRef<SlashCommand[]>()
  const commands = computed(() => updatedCommands.value ?? catalog.commands.value)
  const { data, status, refresh } = useFetch('/api/discord/slash-command/remote-diff', {
    method: 'post',
    body: import.meta.dev ? computed(() => ({ commands: updatedCommands.value })) : undefined,
    server: false,
    watch: false,
  })
  const diff = computed(() => status.value === 'success' ? data.value : undefined)
  const url = useRuntimeConfig().public.discord?.wsUrl
  if (import.meta.dev && import.meta.client && url) {
    const { data: updates } = useWebSocket(url, {
      autoReconnect: true,
      onConnected: socket => socket.send(JSON.stringify({ event: 'full-update' })),
    })
    watch(updates, (message) => {
      if (!message)
        return
      const update = JSON.parse(message)
      if (update.event === 'full-update' && Array.isArray(update.commands)) {
        updatedCommands.value = update.commands
        void refresh()
      }
      else if (update.event === 'registration-updated') {
        void refresh()
      }
    })
  }
  return { commands, diff, status, refresh: () => refresh() }
}
