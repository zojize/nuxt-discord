import { cooldown } from './server/utils/middleware/cooldown'
import { guildOnly } from './server/utils/middleware/guildOnly'
import { ownerOnly } from './server/utils/middleware/ownerOnly'
import { requireRole } from './server/utils/middleware/requireRole'

const builtins = { cooldown, guildOnly, ownerOnly, requireRole }

export function resolveMiddlewareTags(names: string[] = [], path: string) {
  return names.map((name) => {
    if (!Object.hasOwn(builtins, name))
      throw new Error(`Unknown @middleware "${name}" in ${path}. Use a built-in name or pass your middleware to useMiddleware().`)
    return builtins[name as keyof typeof builtins]
  })
}
