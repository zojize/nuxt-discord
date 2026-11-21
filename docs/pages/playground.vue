<script setup lang="ts">
import catalog from '#build/example-bot.json'
import CommandTestBar from '../../src/runtime/client/components/CommandTestBar.vue'
import { demoSuggestions, playableNames, runDemo } from '../utils/demo-commands'

const demoCommands = catalog.commands.filter(command => playableNames.includes(command.name))

definePageMeta({ layout: false })
useHead({
  htmlAttrs: { class: 'playground-page' },
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, interactive-widget=resizes-content' }],
})
useSeoMeta({ title: 'Command playground · Nuxt Discord', description: 'Try Discord-style slash commands in your browser.' })
</script>

<template>
  <PlaygroundChannel v-slot="{ search, pinned }">
    <CommandTestBar channel :search="search" :pinned="pinned" :commands="demoCommands" :execute="runDemo" :suggest="demoSuggestions">
      <div class="shrink-0 px-4 pt-10 pb-3">
        <div class="mb-2 grid size-[4.25rem] place-items-center rounded-full bg-chat-hover">
          <UIcon name="i-lucide-hash" class="size-11 text-chat-text" />
        </div>
        <h1 class="text-[clamp(1.625rem,3vw,2rem)] leading-[1.25] font-bold">
          Welcome to #command-testing!
        </h1>
        <p class="mt-1 text-chat-muted">
          This is the start of the #command-testing channel. Type <kbd>/</kbd> to try a command in your browser. <NuxtLink class="text-chat-link hover:underline" to="/example-bot">Browse the example bot’s command reference.</NuxtLink>
        </p>
      </div>
    </CommandTestBar>
  </PlaygroundChannel>
</template>
