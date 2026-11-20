<script setup lang="ts">
import ChatAvatar from '../../src/runtime/client/components/ChatAvatar.vue'

defineProps<{ dismissible?: boolean }>()
defineEmits<{ close: [] }>()
const expanded = defineModel<boolean>('expanded', { required: true })
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex h-12 shrink-0 items-center justify-between border-b border-white/[.06] px-4 font-semibold">
      nuxt-discord
      <button v-if="dismissible" type="button" class="grid size-11 cursor-pointer place-items-center" aria-label="Close channel navigation" @click="$emit('close')">
        <UIcon name="i-lucide-x" class="size-4" />
      </button>
    </div>
    <nav aria-label="Channels" class="flex-1 p-2">
      <button type="button" :aria-expanded="expanded" class="mt-3 flex cursor-pointer items-center gap-1 px-1 py-1.5 text-xs font-semibold text-chat-muted" @click="expanded = !expanded">
        <UIcon :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3" />Text Channels
      </button>
      <button v-if="expanded" type="button" aria-current="page" class="flex w-full cursor-pointer items-center gap-2 rounded-md bg-chat-hover px-2 py-1.5 text-left font-medium" @click="$emit('close')">
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
  </div>
</template>
