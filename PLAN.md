# nuxt-discord Revival Plan

## Phase 1: Dependency Upgrades & Bun Migration — DONE

- [x] Migrated pnpm -> Bun, upgraded all deps (Nuxt 4, TS 6, Vite 8, etc.)

## Phase 2: Code Quality & Stability — DONE

- [x] Dead code removal, error toast, TS 6 strict null fixes
- [x] 95 unit tests + knip

## Phase 3: Slash Command Features — DONE

- [x] All option types (User, Role, Mentionable, Attachment)
- [x] JSDoc metadata (@nsfw, @guild <id>, @dm, @defaultMemberPermissions)
- [x] Inline localization (@name.ja, @description.fr)
- [x] File-based localization (discord/locales/*.json)
- [x] Per-command guild IDs
- [x] HMR with local TS + npm imports
- [x] Command test API + Discord-style input bar
- [x] Web dashboard with Nuxt UI 4

## Phase 4: Interaction Parity with Sapphire — DONE

- [x] Event listeners: `discord/listeners/`, `defineListener(event, handler, { once })`, all discord.js Events
- [x] Context menu commands: `discord/context-menus/`, `defineUserContextMenu` / `defineMessageContextMenu`
- [x] Context menu name inference: define function arg > JSDoc @name > filename
- [x] Context menu reply composable support (discriminated union types)
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
- [x] Nuxt green + Discord blurple dual-brand aesthetic

---

## Phase 6: Message Components & Advanced Interactions — NEXT

Goal: support modals, select menus, and persistent component handlers.

### 6.1 Modal Support
- [ ] `reply.modal(title, fields)` builder API
- [ ] Modal submit handler (inline callback or file-based)
- [ ] Text input fields with validation (short, paragraph, required, placeholder, min/max length)
- [ ] Tests

### 6.2 Select Menus
- [ ] `reply.selectMenu(options)` builder for string select
- [ ] User/Role/Channel/Mentionable select variants
- [ ] Multi-select support with min/max values
- [ ] Select interaction handler
- [ ] Tests

### 6.3 Persistent Component Handlers
- [ ] `discord/components/` directory for file-based component handlers
- [ ] `defineButton(customId, handler)` / `defineSelectMenu(customId, handler)` API
- [ ] Custom ID pattern matching (e.g. `ticket-{id}`)
- [ ] Collector timeout management
- [ ] Tests

---

## Phase 7: Preconditions & Error Handling

### 7.1 Preconditions / Guards
- [ ] `definePrecondition(name, check)` API
- [ ] File-based preconditions in `discord/preconditions/`
- [ ] Built-in: cooldown, permissions, channel type
- [ ] Composable: `@precondition cooldown:5s` JSDoc tag
- [ ] Apply to commands, context menus, and component handlers
- [ ] Tests

### 7.2 Structured Error Handling
- [ ] Per-interaction error events (commandSuccess, commandDenied, commandError)
- [ ] `UserError` class with identifier, message, and context
- [ ] Nitro hooks: `discord:command:success`, `discord:command:error`, `discord:command:denied`
- [ ] Dashboard: error entries in activity log with stack traces
- [ ] Tests

---

## Phase 8: Polish & Ecosystem

### 8.1 HMR Integration Tests
- [ ] Separate vitest.config.e2e.ts with @nuxt/test-utils dev mode
- [ ] File mutation + API polling assertions
- [ ] HMR for listeners and context menus (currently commands only)

### 8.2 Nuxt DevTools Integration
- [ ] Custom DevTools tab for bot status, commands, listeners
- [ ] DevTools → dashboard deep links

### 8.3 Documentation Site
- [ ] Getting started guide
- [ ] API reference for all define* functions and composables
- [ ] Migration guide from Sapphire / discord.js handler
- [ ] Deploy docs site

### 8.4 README & Publishing
- [ ] Comprehensive README with features, quick start, screenshots
- [ ] npm publish workflow
- [ ] GitHub Actions CI (test, lint, type-check)
