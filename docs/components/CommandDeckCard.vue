<script setup lang="ts">
import { computed } from 'vue'
import CommandTranscript from '../../src/runtime/client/components/CommandTranscript.vue'
import { runDemo } from '../utils/demo-commands'

const props = defineProps<{ name: string, highlightedCode: string, options: Record<string, string> }>()
const entry = computed(() => {
  const invocation = { name: props.name, options: props.options }
  const result = runDemo(invocation)
  return { id: 0, at: new Date('2026-01-01T12:00:00Z'), invocation, messages: [result.response!], ephemeral: result.ephemeral, state: 'sent' as const }
})
</script>

<template>
  <section class="example-card rounded-xl border bg-(--code-bg) text-(--code-text)" :data-command="name" :aria-label="`/${name} example`">
    <div class="card-header flex items-center gap-2 rounded-t-xl border-b px-4 py-3 font-mono text-xs">
      <UIcon name="i-lucide-file-code-2" class="size-4 shrink-0" />discord/commands/{{ name }}.ts
    </div>
    <!-- Shiki escapes the example source and generates this markup at build time. -->
    <div class="excerpt flex min-h-36 items-center px-4 py-4 font-mono text-[.79rem] leading-relaxed sm:px-5" v-html="highlightedCode" />
    <div class="min-h-32 rounded-b-xl border-t border-chat-line bg-chat-canvas pt-px pb-3 font-chat text-base leading-[1.375] text-chat-text [font-size-adjust:0.478]">
      <CommandTranscript :entries="[entry]" :channel="false" />
    </div>
  </section>
</template>

<style scoped>
.example-card {
  --edge: #668875;
  --paper: var(--card-green);
  border-color: var(--edge);
  box-shadow: 0 2px 2px #0002, 0 12px 24px -12px #0006;
}
.example-card[data-command="add"] { --edge: #84799e; --paper: var(--card-purple); }
.example-card[data-command="reverse"] { --edge: #978769; --paper: var(--card-gold); }
.card-header { background: var(--paper); border-color: var(--edge); color: var(--code-text); }
.excerpt :deep(pre) { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.excerpt :deep(span[style]) { color: light-dark(var(--shiki-light), var(--shiki-dark)); }
</style>
