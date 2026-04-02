---
title: Installation
---

# Installation

## Prerequisites

- [Nuxt](https://nuxt.com/) 4.x
- [Discord.js](https://discord.js.org/) 14.x
- A [Discord application](https://discord.com/developers/applications) with a bot token

## Setup

Install the module and discord.js:

```bash
bun add nuxt-discord discord.js
```

Add the module to your `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['nuxt-discord'],
})
```

Create a `.env` file with your bot credentials:

```bash
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
```

Create your first command:

```ts
// discord/commands/ping.ts

/** A simple ping command */
export default () => 'pong!'
```

Start the dev server:

```bash
bun run dev
```

Your bot will connect and the `/ping` command will be available. Visit `http://localhost:3000/discord/slash-commands` to see the web dashboard.

## Project Structure

```
your-project/
├── discord/
│   ├── commands/       # Slash command files
│   │   └── ping.ts
│   └── locales/        # i18n translations (optional)
│       ├── ja.json
│       └── fr.json
├── nuxt.config.ts
└── .env
```
