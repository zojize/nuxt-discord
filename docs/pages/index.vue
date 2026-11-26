<script setup lang="ts">
import { appearanceSelect } from '../../src/runtime/client/components/appearance-select'
import ProjectLogo from '../../src/runtime/client/components/ProjectLogo.vue'

definePageMeta({ layout: false })
useHead({ htmlAttrs: { class: 'landing-page' } })
useSeoMeta({
  title: 'Nuxt Discord · Discord bots for Nuxt',
  description: 'Turn typed functions in your Nuxt app into Discord slash commands. Share server code, test locally, and deploy a bot alongside your app.',
})

const guides = [
  { title: 'Typed arguments ↗', description: 'Use a function signature to define the options Discord asks for.', to: '/guide/options' },
  { title: 'Reactive replies ↗', description: 'Update a Vue ref to edit a bot message as its state changes.', to: '/guide/responses' },
  { title: 'Example bot reference ↗', description: 'Browse the slash commands and context menus generated from the example bot.', to: '/example-bot' },
]
</script>

<template>
  <UContainer class="landing min-h-svh max-w-[74.5rem] overflow-x-clip bg-(--landing-canvas) px-5!">
    <a class="absolute -top-20 z-10 bg-(--landing-canvas) focus:top-4" href="#main">Skip to content</a>
    <header class="flex flex-wrap items-center justify-between gap-6 border-b border-(--landing-rule) py-5">
      <ULink raw to="/" aria-label="Nuxt Discord home" class="wordmark">
        <ProjectLogo width="40" height="40" aria-hidden="true" class="size-10 shrink-0 max-[23rem]:size-8" /> nuxt-discord
      </ULink>
      <nav aria-label="Main" class="ms-auto flex items-center gap-[inherit]">
        <ULink raw to="/getting-started">
          Docs
        </ULink>
        <VersionMenu />
        <ULink raw to="https://github.com/zojize/nuxt-discord" aria-label="GitHub" class="inline-flex items-center justify-center">
          <span class="max-[30rem]:hidden">GitHub ↗</span>
          <UIcon name="i-simple-icons-github" class="hidden size-5 max-[30rem]:inline-block" />
        </ULink>
        <UColorModeSelect v-bind="appearanceSelect" />
      </nav>
    </header>

    <main id="main" tabindex="-1">
      <UTheme
        :ui="{
          container: { base: () => '' },
          pageFeature: {
            root: 'group outline-(--landing-accent) outline-offset-4',
            title: () => 'font-bold group-hover:underline',
            description: () => 'mt-[.4rem] text-(--landing-muted)',
          },
        }"
      >
        <UPageHero
          as="section" orientation="horizontal"
          description="Turn a TypeScript function into a slash command. Give your community access to the same data and server logic that power your app."
          :ui="{
            root: () => '',
            container: () => 'grid items-center gap-[clamp(2rem,5vw,6rem)] py-[clamp(4rem,10vw,9rem)] [@media(width>48rem)]:grid-cols-[1.05fr_1fr]',
            title: () => 'text-[clamp(3.1rem,6.4vw,6.4rem)] leading-[.99] font-[680] tracking-[-.07em]',
            description: () => 'mt-[1.6rem] max-w-lg text-[1.14rem] text-(--landing-muted)',
            footer: 'mt-8',
            links: 'items-center gap-x-[1.2rem] gap-y-[.35rem] [@media(max-width:30rem)]:gap-x-4',
          }"
        >
          <template #title>
            Your Nuxt app,<br><em class="text-(--landing-accent) not-italic">in Discord.</em>
          </template>
          <template #links>
            <UButton to="/installation" label="Get started" size="xl" class="start gap-6 rounded-[.45rem] px-[1.15rem] py-[.7rem] leading-[inherit] font-[650] hover:bg-primary active:bg-primary forced-colors:outline [@media(max-width:30rem)]:gap-3">
              <template #trailing>
                <span aria-hidden="true">→</span>
              </template>
            </UButton>
            <ULink raw to="/playground" class="inline-flex min-h-11 items-center whitespace-nowrap text-(--landing-link) underline underline-offset-[.22em]">
              Try a command
            </ULink>
          </template>
          <CommandDeck />
        </UPageHero>

        <UPageSection
          aria-labelledby="guides-title" :features="guides" class="border-t border-(--landing-rule)"
          :ui="{
            container: () => 'pt-8 pb-16',
            title: () => 'text-[1.65rem] font-[620] tracking-[-.035em]',
            body: 'mt-6',
            features: () => 'grid gap-5 [@media(width>48rem)]:grid-cols-3 [@media(width>48rem)]:gap-10',
          }"
        >
          <template #title>
            <span id="guides-title">Build your first command</span>
          </template>
        </UPageSection>
      </UTheme>
    </main>

    <footer class="flex items-center justify-between border-t border-(--landing-rule) py-5 text-[.85rem] text-(--landing-muted)">
      Nuxt Discord <span>MIT licensed</span>
    </footer>
  </UContainer>
</template>

<style scoped>
.landing { color: var(--landing-text); font: 1rem/1.55 Inter, system-ui, sans-serif; }
.start { --ui-primary: var(--landing-accent); --ui-text-inverted: var(--landing-on-accent); }
.wordmark { display: flex; align-items: center; gap: .65rem; white-space: nowrap; font: bold 1.05rem ui-monospace, monospace; }
.landing a:focus-visible, nav :deep(.version-trigger:focus-visible) { outline: 3px solid var(--landing-accent); outline-offset: 4px; }
nav :deep(.version-trigger) { color: inherit; font: inherit; background-color: transparent; }
nav a:hover, nav :deep(.version-trigger:hover) { text-decoration: underline; }
@media (max-width: 30rem) {
  header { gap: .45rem; }
  nav a { display: inline-flex; align-items: center; min-height: 44px; white-space: nowrap; }
  .wordmark { font-size: 1rem; gap: .45rem; }
}
@media (max-width: 23rem) {
  header { margin-inline: -.5rem; gap: .25rem; }
  nav a { justify-content: center; min-width: 2.5rem; }
  .wordmark { font-size: .94rem; }
}
</style>
