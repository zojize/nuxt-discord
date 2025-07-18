import { computed, ref } from 'vue'

/**
 * @name counter
 * @description A simple counter command that counts button presses
 */
export default function counter() {
  const count = ref(0)
  const message = computed(() => `Count: ${count.value}`)

  return reply.button(
    '+1',
    () => void (count.value += 1),
    // hide the button when count reaches 5
    { hide: computed(() => count.value >= 5) },
  ).send(message)
}
