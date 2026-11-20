import { ref } from 'vue'

export default defineSlashCommand(() => {
  const gif = ref('begin.gif')
  const opened = ref(false)
  return reply.file(gif).button('Open', () => {
    gif.value = 'open.gif'
    opened.value = true
  }, { hide: opened }).send('Gacha')
})
