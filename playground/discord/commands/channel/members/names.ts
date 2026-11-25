import { Buffer } from 'node:buffer'
import { ChannelType } from 'discord.js'

/**
 * @name names
 * @description List the channel members visible to the bot
 */
export default defineSlashCommand(async () => {
  const interaction = useInteraction()

  if (interaction?.channel?.type === ChannelType.GuildText) {
    const members = interaction.channel.members
    const names = members.map(member => member.displayName)
    const heading = `Members visible to me in #${interaction.channel.name}`
    const content = `${heading}: ${names.join(', ')}`
    if (content.length <= 2000)
      return reply.ephemeral(content, { allowedMentions: { parse: [] } })
    return reply.ephemeral.file({ attachment: Buffer.from(names.join('\n')), name: 'members.txt' }).send(heading)
  }
  else {
    return reply.ephemeral('Unsupported channel type')
  }
})
