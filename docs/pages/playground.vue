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
  <main class="channel">
    <header><b><span aria-hidden="true">#</span> command-testing</b><NuxtLink to="/">Back to nuxt-discord</NuxtLink></header>
    <section class="welcome">
      <span aria-hidden="true">#</span>
      <h1>Welcome to #command-testing!</h1>
      <p>Type <kbd>/</kbd> below to try a command. Replies stay in this browser.</p>
    </section>
    <CommandTestBar :commands="commands" :execute="execute" />
  </main>
</template>

<style scoped>
.channel { min-height: 100dvh; background: #1b1b1f; color: #efeff1; font: 16px/1.4 "gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif; }
header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; border-bottom: 1px solid #35353a; padding: 12px max(16px, calc((100vw - 72rem)/2 + 24px)); }
header b { white-space: nowrap; }
header b span, header a, .welcome p { color: #c7c6cd; }
header a { font-size: 14px; text-decoration: underline; }
.welcome { max-width: 72rem; margin-inline: auto; padding: clamp(2rem,12vh,8rem) 24px 7rem; }
.welcome > span { display: inline-grid; width: 64px; height: 64px; place-items: center; border-radius: 50%; background: #343439; font-size: 42px; font-weight: 650; }
h1 { margin-block: 12px 6px; font-size: clamp(24px,4vw,32px); font-weight: 700; }
kbd { border-radius: 4px; padding-inline: 5px; background: #343439; }
</style>
