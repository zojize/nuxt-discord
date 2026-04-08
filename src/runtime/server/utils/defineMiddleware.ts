import type { Interaction } from 'discord.js'
import type { SlashCommandRuntime, SlashCommandSubcommandRuntime } from '../../../types'

export interface MiddlewareOpts {
  interaction: Interaction
  command?: SlashCommandRuntime | SlashCommandSubcommandRuntime
  type: 'command' | 'context-menu'
  next: <T extends Record<string, unknown> = Record<string, never>>(ctx?: T) => Promise<void>
}

export type MiddlewareFn = (opts: MiddlewareOpts, options?: Record<string, unknown>) => void | Promise<void>

export interface MiddlewareDefinition {
  name: string
  fn: MiddlewareFn
}

export class MiddlewareError extends Error {
  constructor(
    public reason: string,
    public identifier?: string,
  ) {
    super(reason)
    this.name = 'MiddlewareError'
  }
}

export function defineMiddleware(name: string, fn: MiddlewareFn): MiddlewareDefinition {
  return { name, fn }
}

let currentMiddlewareContext: Record<string, unknown> | null = null

export function setMiddlewareContext(ctx: Record<string, unknown> | null) {
  currentMiddlewareContext = ctx
}

export function useMiddlewareContext<T extends Record<string, unknown> = Record<string, unknown>>(): T {
  if (!currentMiddlewareContext)
    throw new Error('useMiddlewareContext() called outside of a command execution context')
  return currentMiddlewareContext as T
}

/**
 * Compiler macro — stripped at build time by the transform plugin.
 * At build time: registers the middleware on the command's metadata.
 * At runtime: returns the accumulated middleware context.
 *
 * Usage: `useMiddleware(myMiddleware)` or `useMiddleware(cooldown, { seconds: 5 })`
 */
export function useMiddleware<T extends MiddlewareDefinition>(_middleware: T, _options?: Record<string, unknown>): Record<string, unknown> {
  return currentMiddlewareContext ?? {}
}
