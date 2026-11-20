<script setup lang="ts">
defineProps<{ user?: boolean }>()
</script>

<template>
  <span aria-hidden="true" class="inline-grid shrink-0 place-items-center rounded-full text-white" :class="user ? 'bg-[#69727c]' : 'bg-[#df4748]'">
    <UIcon name="i-simple-icons-discord" class="size-[60%]" />
  </span>
</template>
