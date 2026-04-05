/**
 * @name Save Message
 */
export default defineMessageContextMenu(async (interaction) => {
  await interaction.reply(interaction.targetMessage.url)
})
