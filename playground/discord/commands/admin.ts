/**
 * @description Admin-only command with cooldown
 * @middleware guildOnly
 */
export default () => {
  useMiddleware(cooldown, { seconds: 10 })
  return reply.ephemeral('Admin action executed! (10s cooldown)')
}
