<script setup lang="ts">
import { computed } from 'vue'
import CommandTranscript from '../../src/runtime/client/components/CommandTranscript.vue'
import { runDemo } from '../utils/demo-commands'

const props = defineProps<{ name: string, source: string, options: Record<string, string> }>()
const excerpt = computed(() => {
  const lines = props.source.trimEnd().split('\n')
  return {
    declaration: lines.find(line => line.startsWith('export default')),
    result: lines.find(line => line.trimStart().startsWith('return ')),
    close: lines.at(-1),
  }
})
const entry = computed(() => {
  const invocation = { name: props.name, options: props.options }
  const result = runDemo(invocation)
  return { id: 0, at: new Date('2026-01-01T12:00:00Z'), invocation, messages: [result.response!], ephemeral: result.ephemeral, state: 'sent' as const }
})
</script>

<template>
  <section class="example-card rounded-xl border bg-[#1d2422] text-[#e1ebe6]" :data-command="name" :aria-label="`/${name} example`">
    <div class="card-header flex items-center gap-2 rounded-t-xl border-b px-4 py-3 font-mono text-xs">
      <UIcon name="i-lucide-file-code-2" class="size-4 shrink-0" />discord/commands/{{ name }}.ts
    </div>
    <pre class="m-0 flex min-h-36 items-center px-4 py-4 font-mono text-[.79rem] leading-relaxed wrap-anywhere whitespace-pre-wrap sm:px-5"><code class="flex min-w-0 flex-col"><span class="text-[#c5c1ff]">{{ excerpt.declaration }}</span><span class="text-[#a8eabd]">{{ excerpt.result }}</span><span>{{ excerpt.close }}</span></code></pre>
    <div class="min-h-32 rounded-b-xl border-t border-chat-line bg-chat-canvas pt-px pb-3 font-chat text-base leading-[1.375] text-chat-white [font-size-adjust:0.478]">
      <CommandTranscript :entries="[entry]" :channel="false" />
    </div>
  </section>
</template>

<style scoped>
.example-card {
  --edge: #668875;
  --paper: #283930;
  --ink: #b3e3c6;
  border-color: var(--edge);
  box-shadow: 0 2px 2px #0005, 0 12px 24px -12px #000b;
}
.example-card[data-command="add"] { --edge: #84799e; --paper: #342e43; --ink: #d8c9ec; }
.example-card[data-command="reverse"] { --edge: #978769; --paper: #3b352c; --ink: #e7d5b5; }
.card-header { background: var(--paper); border-color: var(--edge); color: var(--ink); }
</style>
