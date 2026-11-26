<script setup lang="ts">
import { version } from '../../package.json'

const tag = `v${version}`
const items = [{
  label: 'Release Notes',
  to: `https://github.com/zojize/nuxt-discord/releases/tag/${tag}`,
  target: '_blank',
  rel: 'noopener noreferrer',
}]
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      :label="tag"
      trailing-icon="i-lucide-chevron-down"
      color="neutral"
      variant="ghost"
      size="sm"
      class="version-trigger min-h-11 cursor-pointer gap-0.5 px-1 sm:gap-1 sm:px-2"
      :ui="{ trailingIcon: 'size-3.5' }"
    />
  </UDropdownMenu>
</template>
