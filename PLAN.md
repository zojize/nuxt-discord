# nuxt-discord Revival Plan

## Phase 1: Dependency Upgrades & Bun Migration — DONE

- [x] Migrated pnpm -> Bun, upgraded all deps (Nuxt 4, TS 6, Vite 8, etc.)

## Phase 2: Code Quality & Stability — DONE

- [x] Dead code removal, error toast, TS 6 strict null fixes
- [x] 118 unit tests + knip

## Phase 3: Slash Command Features — DONE

- [x] All option types (User, Role, Mentionable, Attachment)
- [x] JSDoc metadata (@nsfw, @guild <id>, @dm, @defaultMemberPermissions)
- [x] Inline localization (@name.ja, @description.fr)
- [x] File-based localization (discord/locales/*.json)
- [x] Per-command guild IDs
- [x] HMR with local TS + npm imports
- [x] Command test API + Discord-style input bar
- [x] Web dashboard with Nuxt UI 4

## Phase 4: Interaction Parity — DONE

- [x] Event listeners: `discord/listeners/`, `defineListener(event, handler, { once })`
- [x] Context menus: `discord/context-menus/`, `defineUserContextMenu` / `defineMessageContextMenu`
- [x] Context menu name inference: define function arg > JSDoc @name > filename
- [x] Reply composable support for context menus (discriminated union types)
- [x] Auto-registration alongside slash commands

## Phase 5: Web Dashboard — DONE

- [x] Overview page (`/discord`) with stat cards and quick lists
- [x] Slash commands page with sync status, option badges, metadata
- [x] Context menus page grouped by user/message type
- [x] Listeners page with event names and once flags
- [x] Activity log page with real-time WebSocket streaming, stats, filtering
- [x] Header navigation across all pages
- [x] Dark mode toggle via @vueuse/core useColorMode
- [x] `vscode://file` links on all file paths
- [x] Command test bar: floating input, parameter autocomplete, `/` to browse

## Phase 6: Message Components — PARTIAL

- [x] `reply.modal(title, fields, onSubmit)` builder with text inputs (short/paragraph)
- [x] Modal submit handler (inline callback with reply composable support)
- [x] Tests (12 modal builder tests)
- [ ] Select menus (`reply.selectMenu()`)
- [ ] Persistent component handlers via composables

## Phase 7: Middleware — DONE

- [x] `defineMiddleware(name, fn)` with tRPC-inspired `next()` chain
- [x] `useMiddleware()` compiler macro (build-time extracted, runtime returns context)
- [x] `useMiddlewareContext()` for typed context access in commands
- [x] `MiddlewareError` for denial with ephemeral reply
- [x] `@middleware` JSDoc tags on commands and context menus
- [x] Built-in: `guildOnly`, `ownerOnly`, `cooldown`, `requireRole`
- [x] `interactionTimeout` config for scope cleanup
- [x] Nitro hooks: `discord:interaction:before/after/denied`
- [x] Tests (11 middleware tests)

---

## Phase 8: Polish & Ecosystem — NEXT

### 8.1 HMR Integration Tests
- [ ] Separate vitest.config.e2e.ts with @nuxt/test-utils dev mode
- [ ] File mutation + API polling assertions
- [ ] HMR for listeners and context menus (currently commands only)

### 8.2 Nuxt DevTools Integration
- [ ] Custom DevTools tab for bot status, commands, listeners
- [ ] DevTools -> dashboard deep links

### 8.3 Documentation Site
- [x] Getting started guide
- [x] API docs for define* functions, reply composable, middleware
- [ ] Migration guide from Sapphire / discord.js handler
- [ ] Deploy docs site

### 8.4 README & Publishing
- [ ] Comprehensive README with features, quick start, screenshots
- [ ] npm publish workflow
- [ ] GitHub Actions CI (test, lint, type-check)
