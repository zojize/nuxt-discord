---
title: Web Dashboard
---

# Web Dashboard

Run the Nuxt dev server and open `/discord` to manage your development bot.

## Hosting a private dashboard

Set `discord.dashboard: true` in `nuxt.config.ts` and build a Node server. The dashboard uses the bot running in that server process. Enabling it makes the Nuxt application a dedicated administrator site. Use a separate origin for any public website.

Set `DISCORD_DASHBOARD_ORIGIN` to the exact browser origin, including its port, without a trailing slash. Use HTTPS or a loopback HTTP address reached through an SSH tunnel. Bind Nitro to loopback for an SSH tunnel or local reverse proxy. A proxy must preserve the original Host header.

In the bot application's Discord Developer Portal, open **OAuth2 → Redirects**. Register the dashboard origin followed by `/__discord-auth/callback`. For example, a dashboard on `http://127.0.0.1:3434` uses `http://127.0.0.1:3434/__discord-auth/callback`. Start the server with the bot’s `DISCORD_CLIENT_ID` and `DISCORD_TOKEN`, then open `/discord` and choose **Sign in with Discord**.

| Discord application access | Dashboard permissions |
| --- | --- |
| Personal owner, team owner, accepted team admin or developer | View the dashboard, run commands in the tester, and sync commands to Discord |
| Accepted read-only team member | View the dashboard, activity, and registry differences |

Manage collaborators in the application's developer team. The dashboard checks current permissions with Discord before executing a command or syncing. Sign out from the dashboard header to end your session.

## Pages

### Overview (`/discord`)

A dashboard home page showing at a glance:

- **Stat cards** — Counts for slash commands, context menus, and event listeners with sync status
- **Quick lists** — Commands (top 8), context menus by type, and listeners with event names

### Slash Commands (`/discord/slash-commands`)

Detailed command management with:

- **Option badges** — Type labels (`str`, `num`, `int`, `bool`, `user`, `role`, `@`, `file`), constraints, and autocomplete indicators
- **Metadata badges** — `nsfw`, `guild`, `no DM`, `restricted` tags
- **Sync status** — Whether each command matches Discord's registry
- **Command test bar** — A floating input to test commands directly from the browser

The tester runs commands and middleware in the running bot using a simulated direct message from a preview user. It records text, follow-ups, and private replies. Buttons, modal submissions, real Discord users and roles, file transfers, and changes that happen after a command finishes need a Discord interaction. Command code can still perform its own database writes or external calls.

### Context Menus (`/discord/context-menus`)

Lists all user and message context menus, grouped by type.

### Listeners (`/discord/listeners`)

Lists all event listeners with their event names and `once` flags.

### Activity Log (`/discord/activity`)

Live interaction history with:

- **Real-time streaming** — Shows incoming interactions over a development WebSocket or by polling the hosted bot
- **Stats** — Total interactions, commands, context menus, errors, average duration
- **Filtering** — Filter by type (commands, context menus, errors)
- **Pause/Resume** — Pause the stream to inspect entries

## File Links

In development, file paths on the slash commands, context menus, and listeners pages link directly to your editor via `vscode://file` URLs.

## Sync Status

Commands are compared against Discord's remote command registry:

| Status | Meaning |
| --- | --- |
| **synced** | Local and remote match |
| **added** | Exists locally but not on Discord |
| **changed** | Local differs from remote |
| **removed** | Exists on Discord but not locally |
| **conflict** | Multiple local commands with the same name |

## Syncing Commands

Click **Sync to Discord** to register all commands. The button is disabled if there are conflicts that need resolving first.

During development with HMR enabled, the dashboard updates in real-time as you edit command files.

## Client-Only Rendering

All dashboard pages are rendered client-side only (`ssr: false`) to avoid server-side rendering issues with the Nuxt UI components used in the interface.
