<script setup lang="ts">
import { useColorMode } from '#imports'

const mode = useColorMode()
const icons: Record<string, string> = { system: 'i-lucide-monitor', light: 'i-lucide-sun', dark: 'i-lucide-moon' }
</script>

<template>
  <label v-if="!mode.forced" class="relative inline-grid size-11 shrink-0 place-items-center rounded-md hover:bg-current/10 focus-within:outline-2 focus-within:outline-offset-[-3px]" title="Appearance">
    <UIcon :name="icons[mode.preference] || 'i-lucide-monitor'" class="size-[1.125rem]" />
    <select v-model="mode.preference" aria-label="Appearance" class="absolute inset-0 size-full cursor-pointer opacity-0">
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>
</template>
