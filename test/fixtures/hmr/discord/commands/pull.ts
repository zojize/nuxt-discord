import { pool } from 'virtual:gacha-pool'
import { ref } from 'vue'
import { useStorage } from '#imports'

/** First version */
export default async () => {
  const user = useInteraction()!.user.id
  const label = await useStorage('data').getItem('label')
  return ref(`one/${label}/${getExecutor(user, pool).pull(1)}`)
}
