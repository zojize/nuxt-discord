import { ChannelType } from 'discord.js'

/**
 * @name names
 * @description Gets the names of all members in the channel
 */
export default defineSlashCommand(async () => {
  const interaction = useInteraction()

  if (interaction?.channel?.type === ChannelType.GuildText) {
    const members = interaction.channel.members
    const memberNames = members.map(member => member.displayName).join(', ')
    return reply.ephemeral(`Members of ${interaction.channel.name}: ${memberNames}`)
  }
  else {
    return reply.ephemeral('Unsupported channel type')
  }
})
