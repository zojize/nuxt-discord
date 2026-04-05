---
title: Web Dashboard
---

# Web Dashboard

Nuxt Discord includes a built-in web dashboard for managing your bot. Access it at `/discord` in your application.

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

### Context Menus (`/discord/context-menus`)

Lists all user and message context menus, grouped by type.

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
