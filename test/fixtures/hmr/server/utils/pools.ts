import { Executor } from 'pool-engine'

const executors = new Map<string, Executor>()

export function getExecutor(user: string, pool: string) {
  const key = JSON.stringify([user, pool])
  if (!executors.has(key))
    executors.set(key, new Executor())
  return executors.get(key)!
}
