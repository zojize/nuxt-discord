import { ChannelType } from 'discord.js'

/**
 * @name count
 * @description Gets the number of members in the channel
 */
export default defineSlashCommand(async () => {
  const interaction = useInteraction()

  if (interaction?.channel?.type === ChannelType.GuildText) {
    const members = interaction.channel.members
    return reply.ephemeral(`There are ${members.size} members in ${interaction.channel.name}.`)
  }
  else {
    return reply.ephemeral('Unsupported channel type')
  }
})
