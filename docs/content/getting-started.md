---
title: Introduction
---

# Nuxt Discord

A Nuxt module for building Discord bots with slash commands, featuring hot module replacement, automatic command registration, and a web dashboard.

## Why Nuxt Discord?

- **Zero boilerplate** — Define commands as plain functions with JSDoc. Types, names, and descriptions are inferred automatically.
- **File-based routing** — Directory structure maps directly to Discord's subcommand hierarchy.
- **Hot reload** — Edit a command file, see it update instantly. No bot restart needed.
- **Full type safety** — All Discord option types supported with TypeScript inference.
- **Built-in dashboard** — View, manage, and sync commands from a web UI at `/discord/slash-commands`.
- **Localization** — i18n via simple JSON files matching Discord's locale codes.
- **Guild commands** — Register per-guild for instant updates during development.

## Quick Example

```ts
// discord/commands/ping.ts

/** Responds with pong */
export default () => 'pong!'
```

That's a complete, working slash command. The module handles registration, type inference, and response formatting.

## Next Steps

- [Installation](/installation) — Add nuxt-discord to your project
- [Commands](/guide/commands) — Learn command authoring patterns
- [Option Types](/guide/options) — All supported parameter types
