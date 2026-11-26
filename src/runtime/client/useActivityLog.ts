import type { ActivityLogEntry } from '../../types'
import { useDocumentVisibility, useIntervalFn, useWebSocket } from '@vueuse/core'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'

function chronological(a: ActivityLogEntry, b: ActivityLogEntry) {
  return a.timestamp - b.timestamp || a.id - b.id
}

export function useActivityLog(load: (signal: AbortSignal) => Promise<ActivityLogEntry[]>, socketUrl?: string) {
  const history = shallowRef<ActivityLogEntry[]>([])
  const pausedEntries = shallowRef<ActivityLogEntry[]>()
  const paused = computed(() => pausedEntries.value !== undefined)
  const entries = computed(() => pausedEntries.value ?? history.value)
  const visibility = useDocumentVisibility()
  const hasSnapshot = ref(false)
  let clearedThrough: ActivityLogEntry | undefined
  let request: AbortController | undefined

  function merge(incoming: ActivityLogEntry[]) {
    // IDs restart with the bot. The timestamp also distinguishes its next session.
    const key = (entry: ActivityLogEntry) => `${entry.timestamp}/${entry.id}`
    const known = new Set(history.value.map(key))
    const added = incoming.filter((entry) => {
      if ((clearedThrough && chronological(entry, clearedThrough) <= 0) || known.has(key(entry)))
        return false
      known.add(key(entry))
      return true
    })
    if (added.length)
      history.value = [...history.value, ...added].sort(chronological).slice(-500)
  }

  async function refresh() {
    if (request || paused.value || visibility.value !== 'visible')
      return
    const controller = new AbortController()
    request = controller
    try {
      const snapshot = await load(controller.signal)
      if (!controller.signal.aborted) {
        merge(snapshot)
        hasSnapshot.value = true
      }
    }
    catch {
      hasSnapshot.value = false
    }
    finally {
      request = undefined
    }
  }

  const socket = socketUrl && typeof window !== 'undefined' && 'WebSocket' in window
    ? useWebSocket(socketUrl, {
        autoReconnect: true,
        onConnected: refresh,
        onMessage(_, { data }) {
          const update = JSON.parse(data)
          if (update.event === 'activity' && update.entry)
            merge([update.entry])
        },
      })
    : undefined
  const poll = useIntervalFn(refresh, 5000, { immediate: false })
  const active = computed(() => typeof window !== 'undefined' && visibility.value === 'visible' && !paused.value)
  watch(() => active.value && (!hasSnapshot.value || socket?.status.value !== 'OPEN'), (needed) => {
    if (needed)
      poll.resume()
    else
      poll.pause()
  }, { immediate: true })
  watch(active, (visible) => {
    if (visible)
      void refresh()
  }, { immediate: true })
  onScopeDispose(() => request?.abort())

  function togglePause() {
    pausedEntries.value = paused.value ? undefined : history.value
  }

  function clearLog() {
    clearedThrough = history.value.at(-1) ?? clearedThrough
    history.value = []
    if (paused.value)
      pausedEntries.value = []
  }

  return { entries, paused, togglePause, clearLog }
}
