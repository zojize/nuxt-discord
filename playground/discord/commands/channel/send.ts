import { ChannelType } from 'discord.js'

/**
 * @name send
 * @description Sends a message to the channel
 * @param text The text to send
 */
export default defineSlashCommand(async (text: string) => {
  const interaction = useInteraction()

  if (interaction?.channel?.type === ChannelType.GuildText) {
    await interaction.channel.send(text)
    return reply.ephemeral(`Message '${text}' sent to ${interaction.channel.name}!`)
  }
  else {
    return reply.ephemeral('Unsupported channel type')
  }
})
