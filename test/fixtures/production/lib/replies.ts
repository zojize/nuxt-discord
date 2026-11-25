import process from 'node:process'

// Models an SDK configured when the command's dependency is imported.
const replyText = process.env.FIXTURE_RUNTIME_REPLY
if (!replyText)
  throw new Error('The reply service requires deployment-time configuration')

export const pong = replyText
