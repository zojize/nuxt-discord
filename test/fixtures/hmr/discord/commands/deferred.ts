/** A private result after an explicit public acknowledgement. */
export default defineSlashCommand(async () => {
  await useInteraction()!.deferReply()
  return reply.ephemeral('Private result')
})
