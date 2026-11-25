import { pong } from '~~/lib/replies'
import { useStorage } from '#imports'

/** Read the deployment's configured response. */
export default async () => {
  const storage = useStorage('data')
  await storage.setItem('reply', pong)
  return await storage.getItem<string>('reply') ?? ''
}
