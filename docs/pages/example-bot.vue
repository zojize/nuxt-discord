<script setup lang="ts">
import catalog from '#build/example-bot.json'

useSeoMeta({ title: 'Example bot command reference · Nuxt Discord', description: 'Browse the slash commands, arguments and context menus generated from the example Discord bot.' })
</script>

<template>
  <article>
    <h1 class="text-3xl leading-tight font-semibold tracking-tight text-highlighted sm:text-4xl">
      Example bot command reference
    </h1>
    <p class="mt-3 max-w-prose leading-7 text-toned">
      Generated from the example bot’s TypeScript files. Browse its {{ catalog.commands.length }} slash commands and {{ catalog.menus.length }} context menus, or <NuxtLink class="text-primary underline underline-offset-4" to="/playground">try a command in the browser playground</NuxtLink>.
    </p>
    <nav aria-label="Example slash commands" class="not-prose my-6 flex flex-wrap gap-2">
      <a v-for="cmd in catalog.commands" :key="cmd.name" :href="`#${cmd.name.replaceAll(' ', '-')}`" class="rounded border border-default px-2 py-1 font-mono text-sm hover:bg-elevated">/{{ cmd.name }}</a>
    </nav>
    <section v-for="cmd in catalog.commands" :id="cmd.name.replaceAll(' ', '-')" :key="cmd.name" class="scroll-mt-20 border-t border-default py-6">
      <h2 class="font-mono text-xl font-semibold text-highlighted">
        /{{ cmd.name }}
      </h2>
      <p class="mt-1 leading-6">
        {{ cmd.description }}
      </p>
      <dl v-if="cmd.options.length" class="mt-4 space-y-3 border-l-2 border-default pl-4">
        <div v-for="opt in cmd.options" :key="opt.name">
          <dt class="flex flex-wrap items-baseline gap-x-2">
            <code class="font-semibold text-highlighted">{{ opt.name }}</code> <span class="text-sm text-muted">{{ opt.typeName }} · {{ opt.required ? 'Required' : 'Optional' }}</span>
          </dt>
          <dd class="mt-0.5 text-sm leading-6 text-toned">
            {{ opt.description }}
            <span v-if="'min' in opt"> · Minimum {{ opt.min }}</span><span v-if="'max' in opt"> · Maximum {{ opt.max }}</span>
            <span v-if="'minLength' in opt"> · Min. length {{ opt.minLength }}</span><span v-if="'maxLength' in opt"> · Max. length {{ opt.maxLength }}</span>
            <span v-if="'choices' in opt && opt.choices"> · Choices {{ opt.choices.map(c => c.name).join(', ') }}</span>
            <span v-if="opt.hasAutocomplete"> · Autocomplete</span>
          </dd>
        </div>
      </dl>
      <p v-if="cmd.middleware.length" class="mt-3 text-sm text-muted">
        Middleware <code>{{ cmd.middleware.join(', ') }}</code>
      </p>
      <a class="mt-3 inline-block max-w-full text-sm wrap-anywhere text-primary underline-offset-4 hover:underline" :href="`https://github.com/zojize/nuxt-discord/blob/${catalog.revision}/playground/${cmd.source}`">{{ cmd.source }}</a>
    </section>
    <section v-if="catalog.menus.length" class="border-t border-default py-6">
      <h2 class="text-xl font-semibold text-highlighted">
        Context menus
      </h2>
      <ul class="mt-3 list-disc space-y-1 pl-5">
        <li v-for="menu in catalog.menus" :key="menu.name">
          {{ menu.name }} · Right-click a {{ menu.type }}
        </li>
      </ul>
    </section>
  </article>
</template>
