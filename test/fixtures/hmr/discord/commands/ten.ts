import { pool } from 'virtual:gacha-pool'

export default () => String(getExecutor(useInteraction()!.user.id, pool).pull(10))
