<script setup lang="ts">
definePageMeta({ layout: false })
useSeoMeta({
  title: 'Nuxt Discord · Discord bots for Nuxt',
  description: 'Turn typed functions in your Nuxt app into Discord slash commands. Share server code, test locally, and deploy a bot alongside your app.',
})
</script>

<template>
  <div class="landing">
    <a class="skip" href="#main">Skip to content</a>
    <header class="top">
      <NuxtLink class="wordmark" to="/" aria-label="Nuxt Discord home"><b aria-hidden="true">/d</b> nuxt-discord</NuxtLink>
      <nav aria-label="Main">
        <NuxtLink to="/getting-started">Docs</NuxtLink><a href="https://github.com/zojize/nuxt-discord">GitHub ↗</a>
      </nav>
    </header>
    <main id="main" tabindex="-1">
      <section class="hero">
        <div>
          <h1>Your Nuxt app,<br><em>in Discord.</em></h1>
          <p>Turn a TypeScript function into a slash command. Give your community access to the same data and server logic that power your app.</p>
          <div class="actions">
            <NuxtLink class="action" to="/installation">Get started <span aria-hidden="true">→</span></NuxtLink>
            <NuxtLink class="demo" to="/playground">Try a command</NuxtLink>
          </div>
        </div>
        <CommandDeck />
      </section>
      <section class="guides" aria-labelledby="guides-title">
        <h2 id="guides-title">
          Build your first command
        </h2>
        <div>
          <NuxtLink to="/guide/options"><b>Typed arguments ↗</b><p>Use a function signature to define the options Discord asks for.</p></NuxtLink>
          <NuxtLink to="/guide/responses"><b>Reactive replies ↗</b><p>Update a Vue ref to edit a bot message as its state changes.</p></NuxtLink>
          <NuxtLink to="/example-bot"><b>Example bot reference ↗</b><p>Browse the slash commands and context menus generated from the example bot.</p></NuxtLink>
        </div>
      </section>
    </main>
    <footer>Nuxt Discord <span>MIT licensed</span></footer>
  </div>
</template>

<style scoped>
.landing { overflow-x: clip; background: #101418; color: #eef6f1; min-height: 100svh; font: 1rem/1.55 Inter, system-ui, sans-serif; padding-inline: max(1.25rem, calc((100% - 72rem) / 2)); }
.top, footer, nav, .wordmark { display: flex; align-items: center; gap: 1.5rem; }
.top, footer { justify-content: space-between; padding-block: 1.25rem; border-bottom: 1px solid #34403b; }
.wordmark { white-space: nowrap; gap: .65rem; font: bold 1.05rem ui-monospace, monospace; }
.wordmark b { background: #9cf5bc; color: #132419; border-radius: .5rem; padding: .3em .5em; }
.landing a:focus-visible { outline: 3px solid #9cf5bc; outline-offset: 4px; }
.skip { position: absolute; top: -5rem; } .skip:focus { top: 1rem; background: #101418; }
.hero { display: grid; grid-template-columns: 1.05fr 1fr; gap: clamp(2rem,5vw,6rem); align-items: center; padding-block: clamp(4rem,10vw,9rem); }
h1 { font-weight: 680; font-size: clamp(3.1rem,6.4vw,6.4rem); line-height: .99; letter-spacing: -.07em; }
h1 em { color: #9cf5bc; font-style: normal; }
.hero > div > p { max-width: 32rem; font-size: 1.14rem; margin-block: 1.6rem 2rem; color: #b8c5bf; }
.actions { display: flex; flex-wrap: wrap; gap: .35rem 1.2rem; align-items: center; }
.demo { display: inline-flex; align-items: center; min-height: 44px; white-space: nowrap; color: #ccdad1; text-decoration: underline; text-underline-offset: .22em; }
.action { display: inline-flex; align-items: center; gap: 1.5rem; border-radius: .45rem; background: #9cf5bc; color: #132419; font-weight: 650; padding: .7rem 1.15rem; }
.guides { padding-block: 2rem 4rem; border-top: 1px solid #34403b; }
h2 { font-size: 1.65rem; letter-spacing: -.035em; font-weight: 620; }
.guides > div { display: grid; grid-template-columns: repeat(3,1fr); gap: 2.5rem; margin-top: 1.5rem; }
.guides a:hover b, nav a:hover { text-decoration: underline; } .guides p, footer { color: #afbab5; } .guides p { margin-top: .4rem; }
footer { border-top: 1px solid #34403b; border-bottom: 0; font-size: .85rem; }
@media (max-width: 48rem) { .hero, .guides > div { grid-template-columns: 1fr; } .guides > div { gap: 1.25rem; } }
@media (max-width: 30rem) {
  .top, .top nav { gap: .75rem; }
  .top nav a { display: inline-flex; align-items: center; min-height: 44px; white-space: nowrap; }
  .wordmark { font-size: 1rem; gap: .45rem; }
  .actions { column-gap: 1rem; }
  .action { gap: .75rem; }
}
</style>
