# nuxt-discord Revival Plan

## Phase 1: Dependency Upgrades & Bun Migration — DONE

- [x] Migrated pnpm -> Bun, upgraded all deps (Nuxt 4, TS 6, Vite 8, etc.)

## Phase 2: Code Quality & Stability — DONE

- [x] Dead code removal, error toast, TS 6 strict null fixes
- [x] 81 unit tests + 12 integration tests + knip

## Phase 3: Slash Command Features — DONE

- [x] All option types (User, Role, Mentionable, Attachment)
- [x] JSDoc metadata (@nsfw, @guild <id>, @dm, @defaultMemberPermissions)
- [x] Inline localization (@name.ja, @description.fr)
- [x] File-based localization (discord/locales/*.json)
- [x] Per-command guild IDs
- [x] HMR with local TS + npm imports
- [x] Command test API + Discord-style input bar
- [x] Web dashboard with Nuxt UI 4

---

## Phase 4: Interaction Parity with Sapphire — IN PROGRESS

Goal: support all Discord interaction types, not just slash commands.

### 4.1 Event Listeners
- [ ] `discord/listeners/` directory for file-based event handlers
- [ ] `defineListener(event, handler)` API
- [ ] Support all discord.js `Events` (guildMemberAdd, messageCreate, etc.)
- [ ] HMR for listeners in dev mode
- [ ] Tests

### 4.2 Context Menu Commands
- [ ] `discord/commands/*.context.ts` for user/message context menus
- [ ] `defineContextMenu('user' | 'message', handler)` API
- [ ] Auto-registration alongside slash commands
- [ ] Tests

### 4.3 Message Components
- [ ] Modal support: `reply.modal(title, fields)` builder
- [ ] Select menu support: `reply.selectMenu(options)` builder
- [ ] Component interaction handlers (file-based or inline)
- [ ] Tests

### 4.4 Preconditions / Guards
- [ ] `definePrecondition(name, check)` API
- [ ] File-based preconditions in `discord/preconditions/`
- [ ] Built-in: cooldown, permissions, channel type, custom
- [ ] Composable: `@precondition cooldown:5s` JSDoc tag
- [ ] Tests

### 4.5 Structured Error Handling
- [ ] Per-command-type error events (commandSuccess, commandDenied, commandError)
- [ ] `UserError` class with context
- [ ] Error hooks: `discord:command:success`, `discord:command:error`, `discord:command:denied`

---

## Phase 5: Polish & Ecosystem

### 5.1 HMR Integration Tests
- [ ] Separate vitest.config.e2e.ts
- [ ] @nuxt/test-utils dev mode setup
- [ ] File mutation + API polling assertions

### 5.2 Nuxt DevTools Integration
- [ ] Custom DevTools tab for bot status, commands, listeners

### 5.3 Web Dashboard Enhancements
- [ ] Listener management view
- [ ] Context menu command display
- [ ] Live event log viewer
