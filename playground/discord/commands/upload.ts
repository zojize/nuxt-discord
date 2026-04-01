import type { Attachment } from 'discord.js'

/**
 * Upload a file and display its details
 * @param file The file to inspect
 * @dm false
 */
export default (file: Attachment) => {
  return [
    `**${file.name}**`,
    `Size: ${(file.size / 1024).toFixed(1)} KB`,
    `Type: ${file.contentType ?? 'unknown'}`,
    `URL: ${file.url}`,
  ].join('\n')
}
