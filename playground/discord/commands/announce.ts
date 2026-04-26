import { ref } from 'vue'

/**
 * @description Announce something to the current channel and show channel info
 */
export default (message: string) => {
  const channel = useTextChannel()
  const status = ref('Announcing...')
  channel.send(status)

  setTimeout(() => {
    status.value = `**${message}**\n\n_(channel: ${channel.name.value}, members visible: ${channel.members.value.size})_`
  }, 500)

  return reply.ephemeral(`Announced to #${channel.name.value}`)
}
