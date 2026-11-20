<script setup lang="ts">
import CommandTestBar from '../../src/runtime/client/components/CommandTestBar.vue'

definePageMeta({ layout: false })
useSeoMeta({ title: 'Command playground · Nuxt Discord', description: 'Try Discord-style slash commands in your browser.' })

const commands = [
  { name: 'ping', description: 'Check the connection', options: [] },
  {
    name: 'add',
    description: 'Add two numbers',
    options: ['a', 'b'].map(name => ({ name, description: name === 'a' ? 'First number' : 'Second number', required: true, type: 10 })),
  },
  {
    name: 'greet',
    description: 'Say hello',
    options: [{ name: 'name', description: 'Who to greet', required: false, type: 3 }],
  },
]

function execute({ name, options }: { name: string, options: Record<string, string> }) {
  switch (name) {
    case 'ping': return { ok: true, response: 'pong!' }
    case 'greet': return { ok: true, response: `Hello, ${options.name || 'friend'}!` }
    case 'add': {
      const a = Number(options.a)
      const b = Number(options.b)
      if (!Number.isFinite(a) || !Number.isFinite(b))
        return { ok: false, error: 'Enter a number for each option.' }
      return { ok: true, response: String(a + b) }
    }
    default: return { ok: false, error: 'Unknown command' }
  }
}
</script>

<template>
  <PlaygroundChannel v-slot="{ search, pinned }">
    <CommandTestBar channel :search="search" :pinned="pinned" :commands="commands" :execute="execute">
      <div class="shrink-0 px-4 pt-10 pb-3">
        <div class="mb-2 grid size-[4.25rem] place-items-center rounded-full bg-chat-hover">
          <UIcon name="i-lucide-hash" class="size-11 text-chat-white" />
        </div>
        <h1 class="text-[clamp(1.625rem,3vw,2rem)] leading-[1.25] font-bold">
          Welcome to #command-testing!
        </h1>
        <p class="mt-1 text-chat-muted">
          This is the start of the #command-testing channel. Type <kbd>/</kbd> to try a command in your browser.
        </p>
      </div>
    </CommandTestBar>
  </PlaygroundChannel>
</template>
