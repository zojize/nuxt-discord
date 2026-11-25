import type { Attachment } from 'discord.js'

/**
 * Upload a file and display its details
 * @param file The file to inspect
 * @dm false
 */
export default (file: Attachment) => {
  const size = file.size < 1024
    ? `${file.size} ${file.size === 1 ? 'byte' : 'bytes'}`
    : `${(file.size / 1024).toFixed(1)} KB`
  return reply.ephemeral([
    `**${file.name}**`,
    `Size: ${size}`,
    `Type: ${file.contentType ?? 'unknown'}`,
  ].join('\n'), { allowedMentions: { parse: [] } })
}
