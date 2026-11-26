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

## Deployment

Build for a long-running Node.js server and deploy the entire `.output` directory.

```bash
NITRO_PRESET=node-server bunx nuxt build
```

Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` in the service environment, then start one bot process:

```bash
node .output/server/index.mjs
```

For a local production run with credentials in a file, use `node --env-file=.env .output/server/index.mjs`. Nuxt loads `.env` during development. The built Node process reads the environment it receives at launch.

Wait for `Discord client is ready!` before sending a command. With `autoStart` enabled, a production process exits with an error if it cannot initialize, log in, or recover from a fatal gateway disconnect. Configure your process supervisor to restart failed runs with backoff. If the web app scales to multiple replicas or uses static hosting, run the gateway in a separate, always-on service with a single replica.

If you also want to manage the deployed bot from a browser, enable the dashboard before building and register its Discord callback. [Host a private dashboard](/dashboard#hosting-a-private-dashboard)

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
