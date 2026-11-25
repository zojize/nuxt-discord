import { ChannelType } from 'discord.js'

/**
 * @name count
 * @description Count the channel members visible to the bot
 */
export default defineSlashCommand(async () => {
  const interaction = useInteraction()

  if (interaction?.channel?.type === ChannelType.GuildText) {
    const members = interaction.channel.members
    return reply.ephemeral(`Members visible to me in #${interaction.channel.name}: ${members.size}`)
  }
  else {
    return reply.ephemeral('Unsupported channel type')
  }
})
