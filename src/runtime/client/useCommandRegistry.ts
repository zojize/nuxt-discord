import { useWebSocket } from '@vueuse/core'
import slashCommands from '#build/discord/slashCommands'
import { computed, shallowRef, useFetch, useRuntimeConfig, watch } from '#imports'

export function useCommandRegistry() {
  const commands = shallowRef(slashCommands)
  const { data, status, refresh } = useFetch('/api/discord/slash-command/remote-diff', {
    method: 'post',
    body: computed(() => ({ commands: commands.value })),
    immediate: import.meta.dev,
    watch: false,
  })
  const diff = computed(() => status.value === 'success' ? data.value : undefined)
  const url = useRuntimeConfig().public.discord?.wsUrl
  if (import.meta.client && url) {
    const { data: updates } = useWebSocket(url, {
      autoReconnect: true,
      onConnected: socket => socket.send(JSON.stringify({ event: 'full-update' })),
    })
    watch(updates, (message) => {
      if (!message)
        return
      const update = JSON.parse(message)
      if (update.event === 'full-update' && Array.isArray(update.commands)) {
        commands.value = update.commands
        void refresh()
      }
      else if (update.event === 'registration-updated') {
        void refresh()
      }
    })
  }
  return { commands, diff, status, refresh }
}
