---
title: Web Dashboard
---

# Web Dashboard

Nuxt Discord includes a built-in web dashboard for managing slash commands. Access it at `/discord/slash-commands` in your application.

## Features

The dashboard shows all registered commands with:

- **Command name and description** — Displayed with monospace formatting
- **Option badges** — Type labels (`str`, `num`, `int`, `bool`, `user`, `role`, `@`, `file`), constraints, and autocomplete indicators
- **Metadata badges** — `nsfw`, `guild`, `no DM`, `restricted` tags
- **Sync status** — Whether each command matches Discord's registry (synced, added, changed, removed, conflict)
- **Registration status** — Whether a command has been registered with a Discord ID
- **File path** — Source file location for quick navigation

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

The dashboard page is rendered client-side only (`ssr: false`) to avoid server-side rendering issues with the Nuxt UI components used in the interface.
