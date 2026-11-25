/**
 * @name Save Message
 * @guild 100000000000000002
 */
export default defineMessageContextMenu(async (interaction) => {
  await interaction.reply(interaction.targetMessage.url)
})
