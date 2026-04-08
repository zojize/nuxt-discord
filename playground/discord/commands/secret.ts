/**
 * A secret NSFW command for testing age-restricted content
 * @nsfw
 * @defaultMemberPermissions 8
 * @middleware guildOnly
 */
export default () => {
  return reply.ephemeral('🤫 This is a secret admin-only command!')
}
