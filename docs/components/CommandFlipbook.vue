<script setup lang="ts">
import { useDocumentVisibility, useElementVisibility, usePreferredReducedMotion } from '@vueuse/core'
import { computed, ref, watchEffect } from 'vue'
import addSource from '../../playground/discord/commands/add.ts?raw'
import pingSource from '../../playground/discord/commands/ping.ts?raw'
import reverseSource from '../../playground/discord/commands/reverse.ts?raw'
import CommandTranscript from '../../src/runtime/client/components/CommandTranscript.vue'
import { runDemo } from '../utils/demo-commands'

const examples: { name: string, source: string, options: Record<string, string> }[] = [
  { name: 'ping', source: pingSource, options: {} },
  { name: 'add', source: addSource, options: { a: '2', b: '3' } },
  { name: 'reverse', source: reverseSource, options: { input: 'hello' } },
]
const book = ref<HTMLElement>()
const index = ref(0)
const direction = ref(1)
const paused = ref(false)
const hovering = ref(false)
const motion = usePreferredReducedMotion()
const visibility = useDocumentVisibility()
const inView = useElementVisibility(book)
const page = computed(() => examples[index.value]!)
const declaration = computed(() => page.value.source.split('\n').find(line => line.startsWith('export default')) ?? '')
const resultLine = computed(() => page.value.source.split('\n').find(line => line.trimStart().startsWith('return ')) ?? '')
const entry = computed(() => {
  const invocation = { name: page.value.name, options: page.value.options }
  const result = runDemo(invocation)
  return { id: index.value, at: new Date('2026-01-01T12:00:00Z'), invocation, messages: [result.response!], ephemeral: result.ephemeral, state: 'sent' as const }
})

function advance(step: number) {
  direction.value = step
  index.value = (index.value + step + examples.length) % examples.length
}
function turn(step: number) {
  paused.value = true
  advance(step)
}
watchEffect((cleanup) => {
  if (!import.meta.client || paused.value || hovering.value || !inView.value || visibility.value !== 'visible' || motion.value !== 'no-preference')
    return
  const timer = setInterval(advance, 5500, 1)
  cleanup(() => clearInterval(timer))
})
</script>

<template>
  <figure ref="book" aria-label="Example bot command flipbook" aria-roledescription="carousel" class="book" @mouseenter="hovering = true" @mouseleave="hovering = false">
    <figcaption class="flex items-center justify-between gap-2 border-b border-[#3a4841] px-4 py-3">
      <span class="flex min-w-0 items-center gap-2 font-mono text-xs text-[#c7d9ce]"><UIcon name="i-lucide-file-code-2" class="size-4 shrink-0 text-[#9cf5bc]" />discord/commands/{{ page.name }}.ts</span>
      <span class="shrink-0 font-mono text-xs tabular-nums text-[#a7b9ae]">{{ index + 1 }} / {{ examples.length }}</span>
    </figcaption>
    <div class="sheets" :class="{ backward: direction < 0 }">
      <Transition name="turn">
        <div :key="page.name" class="sheet" role="group" :aria-label="`Example ${index + 1} of ${examples.length}: /${page.name}`">
          <pre class="m-0 flex min-h-36 items-center overflow-x-auto px-4 py-4 font-mono text-[.79rem] leading-relaxed wrap-anywhere whitespace-pre-wrap sm:px-5"><code><span class="text-[#b8b6ff]">{{ declaration }}</span>
<span class="text-[#a8eabd]">{{ resultLine }}</span>
{{ page.name === 'add' ? '})' : '}' }}</code></pre>
          <div class="min-h-28 border-t border-chat-line bg-chat-canvas pb-2 font-chat text-base leading-[1.375] text-chat-white [font-size-adjust:0.478]" @focusin="paused = true">
            <CommandTranscript :entries="[entry]" :channel="false" />
          </div>
        </div>
      </Transition>
    </div>
    <div class="flex items-center gap-1 border-t border-[#3a4841] px-3 py-2 text-[#d1ded6]">
      <NuxtLink class="mr-auto rounded p-1.5 text-sm underline-offset-4 hover:underline" :to="`/example-bot#${page.name}`" @focus="paused = true">View command reference ↗</NuxtLink>
      <button type="button" aria-label="Previous example" class="control" @click="turn(-1)">
        <UIcon name="i-lucide-chevron-left" />
      </button>
      <button type="button" :aria-label="paused ? 'Play examples' : 'Pause examples'" class="control motion-reduce:hidden!" @click="paused = !paused">
        <UIcon :name="paused ? 'i-lucide-play' : 'i-lucide-pause'" />
      </button>
      <button type="button" aria-label="Next example" class="control" @click="turn(1)">
        <UIcon name="i-lucide-chevron-right" />
      </button>
    </div>
  </figure>
</template>

<style scoped>
.book { min-width: 0; overflow: hidden; border: 1px solid #506257; border-radius: .85rem; background: #1d2422; box-shadow: 0 3px #17211b, 0 4px #506257, 0 7px #17211b, 0 8px #46574c; }
.sheets { display: grid; overflow: hidden; perspective: 60rem; isolation: isolate; }
.sheet { grid-area: 1 / 1; min-width: 0; background: #1d2422; transform-origin: left center; }
.control { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: .35rem; cursor: pointer; }
.control:hover { background: #344139; }
.book :focus-visible { outline: 2px solid #9cf5bc; outline-offset: 1px; }
@media (prefers-reduced-motion: no-preference) {
  .turn-enter-active, .turn-leave-active { transition: transform 430ms ease, opacity 330ms ease; }
  .turn-enter-from { opacity: 0; transform: rotateY(48deg); }
  .turn-leave-to { opacity: 0; transform: rotateY(-75deg); }
  .backward .turn-enter-from { transform: rotateY(-48deg); }
  .backward .turn-leave-to { transform: rotateY(75deg); }
}
</style>
