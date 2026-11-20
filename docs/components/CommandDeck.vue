<script setup lang="ts">
import { useDocumentVisibility, useElementVisibility, useFocusWithin, usePreferredReducedMotion } from '@vueuse/core'
import { ref, watchEffect } from 'vue'
import addSource from '../../playground/discord/commands/add.ts?raw'
import pingSource from '../../playground/discord/commands/ping.ts?raw'
import reverseSource from '../../playground/discord/commands/reverse.ts?raw'

const cards: { name: string, source: string, options: Record<string, string> }[] = [
  { name: 'ping', source: pingSource, options: {} },
  { name: 'add', source: addSource, options: { a: '2', b: '3' } },
  { name: 'reverse', source: reverseSource, options: { input: 'hello' } },
]
const deck = ref<HTMLElement>()
const front = ref(0)
const hasShuffled = ref(false)
const { focused } = useFocusWithin(deck)
const motion = usePreferredReducedMotion()
const visibility = useDocumentVisibility()
const inView = useElementVisibility(deck)

function depth(index: number) {
  return (index - front.value + cards.length) % cards.length
}

function shuffle() {
  hasShuffled.value = true
  front.value = (front.value + 1) % cards.length
}

watchEffect((cleanup) => {
  if (!import.meta.client || focused.value || !inView.value || visibility.value !== 'visible' || motion.value !== 'no-preference')
    return
  const timer = setInterval(shuffle, 5500)
  cleanup(() => clearInterval(timer))
})
</script>

<template>
  <figure ref="deck" aria-label="Example bot command deck" class="isolate min-w-0">
    <div class="stack" :class="{ shuffled: hasShuffled }">
      <CommandDeckCard
        v-for="(card, i) in cards" :key="card.name" :name="card.name" :source="card.source" :options="card.options"
        class="card" :data-depth="depth(i)" :inert="i !== front" :aria-hidden="i !== front ? true : undefined"
      />
    </div>
    <figcaption class="mx-3 mt-6 sm:mx-6">
      <NuxtLink :to="`/example-bot#${cards[front]!.name}`" class="inline-block rounded px-1 py-2 text-sm text-[#c5d5cd] underline-offset-4 hover:underline">View command reference ↗</NuxtLink>
    </figcaption>
  </figure>
</template>

<style scoped>
.stack {
  --lift-x: -10%;
  display: grid;
  padding: 2.25rem clamp(1.15rem, 3vw, 2rem) .75rem;
}
.card {
  --front: translate(0, 0) rotate(-1.5deg);
  --middle: translate(2%, -4%) rotate(4deg) scale(.98);
  --back: translate(-2%, -7%) rotate(-6deg) scale(.96);
  grid-area: 1 / 1;
  z-index: 3;
  min-width: 0;
  transform-origin: 50% 70%;
  transform: var(--front);
}
.card[data-depth="1"] { z-index: 2; transform: var(--middle); }
.card[data-depth="2"] { z-index: 1; transform: var(--back); }
figure :focus-visible { outline: 2px solid #9cf5bc; outline-offset: 3px; }
@media (max-width: 48rem) {
  .stack { --lift-x: -2%; }
}
@media (prefers-reduced-motion: no-preference) {
  .card { transition: transform 1100ms cubic-bezier(.35, 0, .2, 1); }
  .shuffled .card[data-depth="2"] {
    animation: tuck-under 1100ms ease-in-out, pass-behind 1100ms ease-in-out;
  }
  @keyframes tuck-under {
    from { transform: var(--front); }
    42% { transform: translate(var(--lift-x), -11%) rotate(-7deg) scale(1.015); }
    to { transform: var(--back); }
  }
  /* Change layers while the outgoing face is invisible, including on narrow screens. */
  @keyframes pass-behind {
    0%, 12% { opacity: 1; z-index: 4; }
    50% { opacity: 0; z-index: 4; }
    51% { opacity: 0; z-index: 1; }
    90%, 100% { opacity: 1; z-index: 1; }
  }
}
</style>
