<script lang="ts" setup>
import { useDark } from '@vueuse/core'

import './TheHeader.css'

const dark = useDark()
</script>

<template>
  <header class="bg-default/75 border-default border-b flex h-16 w-full top-0 justify-center sticky z-10 backdrop-blur">
    <div class="mx-auto px-6 container flex items-center justify-between">
      <ULink to="/discord/slash-commands" :active="false">
        <h1 class="text-2xl font-bold">
          <span class="text-primary"> Nuxt </span>
          <span class="text-secondary"> Discord </span>
        </h1>
      </ULink>

      <div class="flex gap-4 items-center justify-center">
        <USwitch v-model="dark" unchecked-icon="i-lucide-sun" checked-icon="i-lucide-moon" size="xl" />
        <ULink to="http://github.com/zojize/nuxt-discord" target="_blank" external class="flex items-center">
          <UIcon name="i-simple-icons:github" size="1.25rem" />
        </ULink>
      </div>
    </div>
  </header>
</template>
