<script setup lang="ts">
import ChatAvatar from '../../src/runtime/client/components/ChatAvatar.vue'

const navigation = ref(false)
const members = ref(false)
const expanded = ref(true)
const search = ref('')
const pinned = ref(false)
</script>

<template>
  <main class="flex h-dvh min-h-0 flex-col overflow-hidden bg-chat-sidebar font-chat text-base leading-[1.375] text-chat-white scheme-dark [font-size-adjust:0.478]">
    <div class="flex h-8 shrink-0 items-center justify-center gap-2 text-sm font-medium">
      <ChatAvatar class="size-4 rounded-[4px]" /> nuxt-discord
    </div>
    <div class="relative flex min-h-0 flex-1">
      <nav aria-label="Server navigation" class="hidden w-[4.5rem] shrink-0 flex-col items-center gap-3 py-2 md:flex">
        <NuxtLink to="/" title="Project home" aria-label="Project home" class="grid size-10 place-items-center rounded-xl bg-chat-hover text-chat-white hover:bg-chat-brand"><UIcon name="i-lucide-house" class="size-5" /></NuxtLink>
        <span class="h-px w-8 bg-chat-line" />
        <span aria-label="Current server, nuxt-discord" class="relative grid size-10 place-items-center rounded-xl bg-chat-brand before:absolute before:-left-4 before:h-8 before:w-1 before:rounded-r before:bg-chat-white"><UIcon name="i-lucide-bot" class="size-6" /></span>
      </nav>
      <button v-if="navigation" type="button" aria-label="Close channel navigation" class="absolute inset-0 z-20 bg-black/50 md:hidden" @click="navigation = false" />
      <aside aria-label="Channel navigation" :class="navigation ? 'flex' : 'hidden md:flex'" class="absolute inset-y-0 left-0 z-30 w-64 shrink-0 flex-col rounded-tl-xl border border-white/[.06] bg-chat-sidebar md:static md:w-[clamp(13rem,18vw,19rem)]">
        <div class="flex h-12 shrink-0 items-center justify-between border-b border-white/[.06] px-4 font-semibold">
          nuxt-discord
          <button type="button" class="grid size-7 cursor-pointer place-items-center md:hidden" aria-label="Close channel navigation" @click="navigation = false">
            <UIcon name="i-lucide-x" class="size-4" />
          </button>
        </div>
        <nav aria-label="Channels" class="flex-1 p-2">
          <button type="button" :aria-expanded="expanded" class="mt-3 flex cursor-pointer items-center gap-1 px-1 py-1.5 text-xs font-semibold text-chat-muted" @click="expanded = !expanded">
            <UIcon :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3" />Text Channels
          </button>
          <button v-if="expanded" type="button" aria-current="page" class="flex w-full cursor-pointer items-center gap-2 rounded-md bg-chat-hover px-2 py-1.5 text-left font-medium" @click="navigation = false">
            <UIcon name="i-lucide-hash" class="size-5 text-chat-muted" />command-testing
          </button>
        </nav>
        <div class="m-1 flex items-center gap-2 rounded-lg border border-white/[.06] bg-chat-field p-2">
          <span class="relative"><ChatAvatar user class="size-8" /><span class="absolute right-0 bottom-0 size-3 rounded-full border-2 border-chat-field bg-[#43a66b]" /></span>
          <div class="leading-tight">
            <b class="text-sm">You</b><p class="text-xs text-chat-muted">
              Online
            </p>
          </div>
        </div>
      </aside>
      <section class="flex min-w-0 flex-1 flex-col border-t border-white/[.06] bg-chat-canvas">
        <header class="flex h-12 shrink-0 items-center gap-2 border-b border-white/[.065] px-3 sm:px-4">
          <button type="button" aria-label="Show channels" class="cursor-pointer md:hidden" @click="navigation = true">
            <UIcon name="i-lucide-panel-left" class="size-5" />
          </button>
          <UIcon name="i-lucide-hash" class="size-6 text-chat-faint" /><strong class="font-semibold">command-testing</strong>
          <div class="ml-auto flex items-center gap-4 text-chat-muted">
            <button type="button" aria-label="Pinned messages" :aria-pressed="pinned" class="grid size-6 cursor-pointer place-items-center hover:text-white aria-pressed:text-white" @click="pinned = !pinned">
              <UIcon name="i-lucide-pin" class="size-5" />
            </button>
            <button type="button" aria-label="Show member list" :aria-pressed="members" class="grid size-6 cursor-pointer place-items-center hover:text-white" @click="members = !members">
              <UIcon name="i-lucide-users" class="size-5" />
            </button>
            <label class="hidden h-7 items-center gap-1 rounded-md border border-chat-line bg-chat-sidebar px-2 focus-within:border-chat-muted sm:flex">
              <input v-model="search" type="search" aria-label="Search channel messages" placeholder="Search" class="w-24 bg-transparent text-sm outline-none lg:w-36" @keydown.esc="search = ''"><UIcon name="i-lucide-search" class="size-3.5" />
            </label>
            <NuxtLink to="/" title="Back to project" aria-label="Back to project" class="grid size-6 place-items-center hover:text-white"><UIcon name="i-lucide-house" class="size-5" /></NuxtLink>
          </div>
        </header>
        <div class="relative flex min-h-0 flex-1">
          <slot :search="search" :pinned="pinned" />
          <aside v-if="members" aria-label="Channel members" class="absolute inset-y-0 right-0 z-10 w-52 border-l border-chat-line bg-chat-sidebar p-4 shadow-xl sm:static sm:shrink-0 sm:shadow-none">
            <p class="mb-3 text-xs font-semibold text-chat-muted">
              Online — 2
            </p>
            <div class="mb-3 flex items-center gap-2">
              <ChatAvatar class="size-8" />nuxt-discord
            </div>
            <div class="flex items-center gap-2">
              <ChatAvatar user class="size-8" />You
            </div>
          </aside>
        </div>
      </section>
    </div>
  </main>
</template>
