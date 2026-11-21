/** Reply publicly, then privately. */
export default async function* () {
  yield 'First'
  yield reply.ephemeral('Private follow-up')
}
