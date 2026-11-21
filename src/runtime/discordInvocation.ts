import type { ChatInputCommandInteraction, TextBasedChannel } from 'discord.js'
import type { EffectScope } from 'vue'
import { AsyncLocalStorage } from 'node:async_hooks'
import { getCurrentScope, onScopeDispose } from 'vue'

interface Invocation {
  scope?: EffectScope
  interaction?: ChatInputCommandInteraction
  channel?: TextBasedChannel | null
  middleware?: Record<string, unknown> | null
}

const storage = new AsyncLocalStorage<Invocation>()

export function currentInvocation() {
  const invocation = storage.getStore()
  return invocation?.scope?.active === false ? undefined : invocation
}

export function runInvocation<T>(scope: EffectScope, context: Invocation, fn: () => T): T {
  return storage.run({ ...context, scope }, () => scope.run(fn)!)
}

export function setInvocationFields(fields: Partial<Invocation>) {
  storage.enterWith({ ...currentInvocation(), ...fields })
}

// The active Vue scope ends at an await. The Discord invocation still owns resources
// created by its asynchronous continuations until that invocation is disposed.
export function onInvocationDispose(dispose: () => void) {
  if (getCurrentScope()) {
    onScopeDispose(dispose)
    return
  }
  const scope = storage.getStore()?.scope
  if (scope?.active)
    scope.run(() => onScopeDispose(dispose))
  else if (scope)
    dispose()
}

export function bindInvocation<T extends unknown[], R>(fn: (...args: T) => R) {
  const invocation = currentInvocation()
  return (...args: T) => invocation?.scope
    ? invocation.scope.active && runInvocation(invocation.scope, invocation, () => fn(...args))
    : fn(...args)
}
