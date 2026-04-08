import type { Interaction } from 'discord.js'
import type { MiddlewareEntry } from '../src/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineMiddleware, MiddlewareError, setMiddlewareContext, useMiddlewareContext } from '../src/runtime/server/utils/defineMiddleware'

describe('middleware', () => {
  beforeEach(() => {
    setMiddlewareContext(null)
  })

  describe('defineMiddleware', () => {
    it('should return a middleware definition with name and fn', () => {
      const mw = defineMiddleware('test', ({ next }) => next())
      expect(mw.name).toBe('test')
      expect(mw.fn).toBeInstanceOf(Function)
    })
  })

  describe('middlewareError', () => {
    it('should have reason and identifier', () => {
      const err = new MiddlewareError('Not allowed', 'ownerOnly')
      expect(err.reason).toBe('Not allowed')
      expect(err.identifier).toBe('ownerOnly')
      expect(err.message).toBe('Not allowed')
      expect(err.name).toBe('MiddlewareError')
      expect(err).toBeInstanceOf(Error)
    })
  })

  describe('useMiddlewareContext', () => {
    it('should throw when called outside of execution', () => {
      expect(() => useMiddlewareContext()).toThrow('outside of a command execution context')
    })

    it('should return the current context', () => {
      setMiddlewareContext({ user: 'alice' })
      expect(useMiddlewareContext()).toEqual({ user: 'alice' })
      setMiddlewareContext(null)
    })
  })

  describe('middleware chain execution', () => {
    function mockInteraction(overrides: Partial<Interaction> = {}): Interaction {
      return {
        user: { id: '123', displayName: 'Test' },
        guildId: '456',
        channelId: '789',
        member: null,
        ...overrides,
      } as unknown as Interaction
    }

    async function runChain(entries: MiddlewareEntry[], interaction?: Interaction): Promise<Record<string, unknown>> {
      const context: Record<string, unknown> = {}
      const runRecursive = async (index: number): Promise<void> => {
        if (index >= entries.length)
          return
        const entry = entries[index]!
        await entry.fn({
          interaction: interaction ?? mockInteraction(),
          type: 'command',
          next: async (ctx) => {
            if (ctx)
              Object.assign(context, ctx)
            await runRecursive(index + 1)
          },
        }, entry.options)
      }
      await runRecursive(0)
      return context
    }

    it('should run middleware in order', async () => {
      const order: string[] = []
      const mw1 = defineMiddleware('first', async ({ next }) => {
        order.push('first')
        await next()
      })
      const mw2 = defineMiddleware('second', async ({ next }) => {
        order.push('second')
        await next()
      })

      await runChain([
        { name: mw1.name, fn: mw1.fn },
        { name: mw2.name, fn: mw2.fn },
      ])
      expect(order).toEqual(['first', 'second'])
    })

    it('should short-circuit on MiddlewareError', async () => {
      const order: string[] = []
      const deny = defineMiddleware('deny', () => {
        order.push('deny')
        throw new MiddlewareError('Denied!', 'deny')
      })
      const neverReached = defineMiddleware('neverReached', async ({ next }) => {
        order.push('neverReached')
        await next()
      })

      await expect(runChain([
        { name: deny.name, fn: deny.fn },
        { name: neverReached.name, fn: neverReached.fn },
      ])).rejects.toThrow(MiddlewareError)
      expect(order).toEqual(['deny'])
    })

    it('should accumulate context from next() calls', async () => {
      const mw1 = defineMiddleware('addUser', async ({ next }) => {
        await next({ user: { id: '123', name: 'Alice' } })
      })
      const mw2 = defineMiddleware('addPerms', async ({ next }) => {
        await next({ permissions: ['admin'] })
      })

      const context = await runChain([
        { name: mw1.name, fn: mw1.fn },
        { name: mw2.name, fn: mw2.fn },
      ])
      expect(context).toEqual({
        user: { id: '123', name: 'Alice' },
        permissions: ['admin'],
      })
    })

    it('should pass options to middleware fn', async () => {
      const optsSpy = vi.fn()
      const mw = defineMiddleware('withOpts', async ({ next }, options) => {
        optsSpy(options)
        await next()
      })

      await runChain([
        { name: mw.name, fn: mw.fn, options: { seconds: 10, scope: 'guild' } },
      ])
      expect(optsSpy).toHaveBeenCalledWith({ seconds: 10, scope: 'guild' })
    })

    it('should not call next if middleware throws', async () => {
      const nextSpy = vi.fn()
      const mw = defineMiddleware('fail', () => {
        throw new MiddlewareError('No access')
      })

      await expect(runChain([
        { name: mw.name, fn: mw.fn },
        {
          name: 'spy',
          fn: async ({ next }) => {
            nextSpy()
            await next()
          },
        },
      ])).rejects.toThrow(MiddlewareError)
      expect(nextSpy).not.toHaveBeenCalled()
    })

    it('should work with empty middleware list', async () => {
      const context = await runChain([])
      expect(context).toEqual({})
    })

    it('should handle async middleware', async () => {
      const mw = defineMiddleware('async', async ({ next }) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        await next({ loaded: true })
      })

      const context = await runChain([{ name: mw.name, fn: mw.fn }])
      expect(context).toEqual({ loaded: true })
    })
  })
})
