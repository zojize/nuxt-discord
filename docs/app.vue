<script setup lang="ts">
const { baseURL } = useRuntimeConfig().app
useHead({
  meta: [{ name: 'color-scheme', content: 'light dark' }],
  link: [
    { rel: 'icon', type: 'image/x-icon', sizes: '16x16 32x32', href: `${baseURL}favicon.ico` },
    { rel: 'icon', type: 'image/svg+xml', sizes: 'any', href: `${baseURL}favicon.svg` },
  ],
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
