<script lang="ts" setup>
const route = useRoute()
const { data: page } = await useAsyncData(route.path, () => {
  return queryCollection('content').path(route.path).first()
})

useSeoMeta({
  title: page.value?.title ? `${page.value.title} - nuxt-discord` : 'nuxt-discord',
})
</script>

<template>
  <ContentRenderer v-if="page" :value="page" />
  <div v-else class="py-20 text-center">
    <h1 class="text-2xl font-bold">
      Page not found
    </h1>
    <p class="mt-2 text-muted">
      <NuxtLink to="/getting-started" class="text-primary underline">
        Go to docs
      </NuxtLink>
    </p>
  </div>
</template>
