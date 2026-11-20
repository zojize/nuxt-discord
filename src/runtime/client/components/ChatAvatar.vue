<script setup lang="ts">
defineProps<{ user?: boolean }>()
</script>

<template>
  <span aria-hidden="true" class="inline-grid shrink-0 place-items-center rounded-full text-white" :class="user ? 'bg-[#9363bb]' : 'bg-chat-brand'">
    <UIcon :name="user ? 'i-lucide-smile' : 'i-lucide-bot'" class="size-[66%]" />
  </span>
</template>
