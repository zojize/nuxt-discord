import { vi } from 'vitest'

const mockNitroApp = {
  hooks: {
    hook: vi.fn(),
    callHook: vi.fn(),
  },
}

export const useNitroApp = vi.fn(() => mockNitroApp)
