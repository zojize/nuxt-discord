<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import ChatAvatar from '../../src/runtime/client/components/ChatAvatar.vue'

const drawer = useTemplateRef<HTMLDialogElement>('drawer')
function dismissOnBackdropClick() {
  if (!('closedBy' in HTMLDialogElement.prototype))
    drawer.value?.close()
}

const desktop = useMediaQuery('(min-width: 48rem)')
watch(desktop, (wide) => {
  if (wide && drawer.value?.open)
    drawer.value.close()
})
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
      <aside aria-label="Channel navigation" class="hidden w-[clamp(13rem,18vw,19rem)] shrink-0 rounded-tl-xl border border-white/[.06] bg-chat-sidebar md:block">
        <PlaygroundChannelNav v-model:expanded="expanded" />
      </aside>
      <dialog id="channel-drawer" ref="drawer" closedby="any" aria-label="Channel navigation" class="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-64 max-w-[85vw] border-r border-chat-line bg-chat-sidebar text-chat-white backdrop:bg-black/50" @click.self="dismissOnBackdropClick">
        <PlaygroundChannelNav v-model:expanded="expanded" dismissible @close="drawer?.close()" />
      </dialog>
      <section class="flex min-w-0 flex-1 flex-col border-t border-white/[.06] bg-chat-canvas">
        <header class="flex h-12 shrink-0 items-center gap-1 border-b border-white/[.065] px-1 sm:gap-2 sm:px-4">
          <button type="button" aria-label="Show channels" aria-controls="channel-drawer" aria-haspopup="dialog" class="grid size-11 shrink-0 cursor-pointer place-items-center md:hidden" @click="drawer?.showModal()">
            <UIcon name="i-lucide-panel-left" class="size-5" />
          </button>
          <UIcon name="i-lucide-hash" class="hidden size-6 shrink-0 text-chat-faint sm:block" /><strong class="min-w-0 truncate font-semibold">command-testing</strong>
          <div class="ml-auto flex shrink-0 items-center text-chat-muted sm:gap-4">
            <button type="button" aria-label="Pinned messages" :aria-pressed="pinned" class="grid size-11 cursor-pointer place-items-center hover:text-white sm:size-6 aria-pressed:text-white" @click="pinned = !pinned">
              <UIcon name="i-lucide-pin" class="size-5" />
            </button>
            <button type="button" aria-label="Channel members" aria-controls="channel-members" :aria-expanded="members" class="grid size-11 cursor-pointer place-items-center hover:text-white sm:size-6" @click="members = !members">
              <UIcon name="i-lucide-users" class="size-5" />
            </button>
            <label class="hidden h-7 items-center gap-1 rounded-md border border-chat-line bg-chat-sidebar px-2 focus-within:border-chat-muted sm:flex">
              <input v-model="search" type="search" aria-label="Search channel messages" placeholder="Search" class="w-24 bg-transparent text-sm outline-none lg:w-36" @keydown.esc="search = ''"><UIcon name="i-lucide-search" class="size-3.5" />
            </label>
            <NuxtLink to="/" title="Back to project" aria-label="Back to project" class="grid size-11 place-items-center hover:text-white sm:size-6"><UIcon name="i-lucide-house" class="size-5" /></NuxtLink>
          </div>
        </header>
        <div class="relative flex min-h-0 flex-1">
          <slot :search="search" :pinned="pinned" />
          <aside v-if="members" id="channel-members" aria-label="Channel members" class="absolute top-0 right-0 z-10 w-52 rounded-bl-lg border-b border-l border-chat-line bg-chat-sidebar p-4 shadow-xl lg:static lg:shrink-0 lg:rounded-none lg:border-b-0 lg:shadow-none">
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
