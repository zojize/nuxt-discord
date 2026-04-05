export default defineUserContextMenu('User Info', (interaction) => {
  const user = interaction.targetUser
  return reply.ephemeral([
    `**${user.displayName}**`,
    `ID: ${user.id}`,
    `Bot: ${user.bot ? 'Yes' : 'No'}`,
    `Created: ${user.createdAt.toLocaleDateString()}`,
  ].join('\n'))
})
