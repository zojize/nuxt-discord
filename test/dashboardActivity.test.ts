import type { ActivityLogEntry } from '../src/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, onScopeDispose, ref } from 'vue'
import { useActivityLog } from '../src/runtime/client/useActivityLog'

const visibility = ref<DocumentVisibilityState>('visible')
const status = ref('OPEN')
let emitActivity: (entry: ActivityLogEntry) => void

vi.mock('@vueuse/core', () => ({
  useDocumentVisibility: () => visibility,
  useWebSocket(_url: string, options: { onMessage: (socket: unknown, message: { data: string }) => void }) {
    emitActivity = entry => options.onMessage(null, { data: JSON.stringify({ event: 'activity', entry }) })
    return { status }
  },
  useIntervalFn(fn: () => void, delay: number) {
    let interval: ReturnType<typeof setInterval>
    const pause = () => clearInterval(interval)
    onScopeDispose(pause)
    return {
      pause,
      resume() {
        pause()
        interval = setInterval(fn, delay)
      },
    }
  },
}))

function event(id: number, timestamp = id): ActivityLogEntry {
  return { id, timestamp, type: 'command', name: 'ping', status: 'ok' }
}

describe('dashboard activity', () => {
  let scope = effectScope()
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { WebSocket: class {} })
    visibility.value = 'visible'
    status.value = 'OPEN'
    scope = effectScope()
  })
  afterEach(() => {
    scope.stop()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('merges a late snapshot with live events, freezes the view, and keeps cleared entries out of later snapshots', async () => {
    const initial = Promise.withResolvers<ActivityLogEntry[]>()
    const load = vi.fn().mockReturnValueOnce(initial.promise).mockResolvedValue([event(1), event(2), event(3)])
    const log = scope.run(() => useActivityLog(load, 'ws://example.test'))!
    emitActivity(event(2))
    initial.resolve([event(1), event(2)])
    await nextTick()
    expect(log.entries.value).toEqual([event(1), event(2)])
    log.togglePause()
    emitActivity(event(3))
    expect(log.entries.value).toEqual([event(1), event(2)])
    log.togglePause()
    expect(log.entries.value).toEqual([event(1), event(2), event(3)])
    log.clearLog()
    log.togglePause()
    await nextTick()
    log.togglePause()
    await nextTick()
    await Promise.resolve()
    emitActivity(event(3))
    expect(log.entries.value).toEqual([])
    emitActivity(event(1, 10))
    expect(log.entries.value).toEqual([event(1, 10)])
  })

  it('polls without a socket, waits for pending requests, and resumes when the tab is visible', async () => {
    const initial = Promise.withResolvers<ActivityLogEntry[]>()
    const load = vi.fn().mockReturnValueOnce(initial.promise).mockResolvedValue([event(2)])
    const log = scope.run(() => useActivityLog(load))!
    await vi.advanceTimersByTimeAsync(15000)
    expect(load).toHaveBeenCalledTimes(1)
    initial.resolve([event(1)])
    await vi.advanceTimersByTimeAsync(5000)
    expect(log.entries.value).toEqual([event(1), event(2)])
    visibility.value = 'hidden'
    await vi.advanceTimersByTimeAsync(15000)
    expect(load).toHaveBeenCalledTimes(2)
    visibility.value = 'visible'
    await nextTick()
    expect(load).toHaveBeenCalledTimes(3)
    log.togglePause()
    await vi.advanceTimersByTimeAsync(15000)
    expect(load).toHaveBeenCalledTimes(3)
    log.togglePause()
    await nextTick()
    expect(load).toHaveBeenCalledTimes(4)
    scope.stop()
    await vi.advanceTimersByTimeAsync(15000)
    expect(load).toHaveBeenCalledTimes(4)
  })

  it('uses the activity API while a development socket is offline, and stops polling when connected', async () => {
    const load = vi.fn().mockResolvedValue([event(1)])
    scope.run(() => useActivityLog(load, 'ws://example.test'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(load).toHaveBeenCalledTimes(1)
    status.value = 'CLOSED'
    await vi.advanceTimersByTimeAsync(5000)
    expect(load).toHaveBeenCalledTimes(2)
    status.value = 'OPEN'
    await vi.advanceTimersByTimeAsync(10000)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
