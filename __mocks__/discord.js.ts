import { EventEmitter } from 'node:events'
import { vi } from 'vitest'

const RESTClient = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
  setToken: vi.fn(function (this: any) { return this }),
}

export const REST = vi.fn(() => RESTClient)

const emitter = new EventEmitter()
Reflect.defineProperty(emitter, 'login', {
  value: vi.fn(() => Promise.resolve(emitter)),
})
Reflect.defineProperty(emitter, 'destroy', {
  value: vi.fn(() => Promise.resolve()),
})
Reflect.defineProperty(emitter, 'user', {
  value: { tag: 'Vitest' },
})
vi.spyOn(emitter, 'on')

export const Client = vi.fn(() => emitter)

export { ApplicationCommandOptionType, Events, Routes, SlashCommandBuilder } from 'discord.js'
