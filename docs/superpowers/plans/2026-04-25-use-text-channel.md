# useTextChannel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `useTextChannel(idOrInstance?)` composable that exposes a Discord text channel as a reactive proxy with event-driven refs (name, topic, members, lastMessage) and a `send()` builder mirroring `reply`'s chain.

**Architecture:** The composable resolves a channel from (1) an explicit instance arg, (2) a channel ID arg fetched via the Discord client, or (3) an ambient `currentChannel` set by the framework before invoking handlers (slash commands, context menus, channel-bearing event listeners). Reactive refs are wired to Discord client events filtered by channel ID; event listeners are scoped to the current Vue effect scope so they get cleaned up automatically when the interaction's `interactionTimeout` expires or when a listener handler returns. The `send()` chain reuses `reply`'s message-builder machinery via a small extracted helper, calling `channel.send()` instead of `interaction.reply/editReply/followUp`.

**Tech Stack:** Vue 3 Composition API (effect scopes, refs, watch, toValue, MaybeRefOrGetter), discord.js v14 (Channel, Events, Collection), TypeScript 6, Vitest 4.

---

## File Structure

**New files:**
- `src/runtime/server/utils/useTextChannel.ts` — main composable + module-level `currentChannel` state
- `src/runtime/server/utils/messageSender.ts` — extracted message-builder machinery shared by `reply` and `useTextChannel`
- `test/useTextChannel.test.ts` — unit tests
- `playground/discord/commands/announce.ts` — playground example using `useTextChannel`

**Modified files:**
- `src/runtime/server/utils/reply.ts` — refactor to use `messageSender` helper (preserve all existing behavior, including ephemeral, button chain, modal)
- `src/runtime/server/utils/client.ts` — set `currentChannel` before invoking slash command, context menu, and channel-bearing event listener handlers; clear after
- `src/types.ts` — re-export `useTextChannel`, `setCurrentChannel`, `UseTextChannelReturn` types
- `src/module.ts` — register `useTextChannel` as an auto-import

---

## Task 1: Extract Shared Message Sender Helper

**Files:**
- Create: `src/runtime/server/utils/messageSender.ts`
- Test: covered by existing `test/reply.test.ts` (must continue passing)

The current `reply.ts` has a 145-line `createReplyFunction` with three concerns mixed together: (1) accumulating message options (content, files, buttons), (2) sending via the right interaction method, (3) reactive editing. We need to extract the parts that aren't interaction-specific so `useTextChannel` can reuse them without duplicating the file/button/reactive logic.

The extracted helper accepts a `send` function (called with the final options) and an `edit` function (called when reactive options change). The `reply` composable provides interaction-aware send/edit; `useTextChannel.send` provides channel.send/message.edit.

- [ ] **Step 1: Read the current reply.ts in full to understand the contract**

Run: `cat src/runtime/server/utils/reply.ts | head -270`

Note especially:
- `createReplyFunction(defaultOptions)` recursive structure for chaining
- `getButtonComponent(buttons)` (lines 287-332)
- `deepToRaw` helper (lines 334-363)
- The two branches inside the returned `reply` function (lines 130-217): handler-mode vs immediate-call-with-interaction mode

- [ ] **Step 2: Create the new file with the shared types and helper signature**

```ts
// src/runtime/server/utils/messageSender.ts
import type {
  BaseMessageOptions,
  ButtonComponentData,
  ButtonInteraction,
  InteractionCallbackResponse,
  InteractionCollector,
  InteractionResponse,
  Message,
  MessageCollectorOptionsParams,
  MessageCreateOptions,
} from 'discord.js'
import type { MaybeRef } from 'vue'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js'
import { computed, isProxy, isReactive, isRef, reactive, toRaw, toValue, watch } from 'vue'
import { logger } from '../../logger'

export type File = NonNullable<BaseMessageOptions['files']>[number]
export type ButtonCollectorOptions = Partial<Omit<MessageCollectorOptionsParams<ComponentType.Button>, 'componentType'>>
export type MaybeRefObject<T> = T extends any
  ? { [K in keyof T]: MaybeRef<T[K]> }
  : never
export type DistributiveOmit<T, K extends keyof T> = T extends any
  ? Omit<T, K>
  : never

export type SentMessage = Message | InteractionResponse | InteractionCallbackResponse

export interface MessageSenderConfig {
  /** Sends the message with the final (raw, unwrapped) options. Returns the sent message. */
  send: (opts: MessageCreateOptions) => Promise<SentMessage>
  /** Edits a previously-sent message with the new (raw, unwrapped) options. */
  edit: (msg: SentMessage, opts: MessageCreateOptions) => Promise<SentMessage>
}

export type ButtonHandlerArgs = [
  label: MaybeRef<string>,
  handler: (interaction: ButtonInteraction) => void | Promise<void>,
  options?:
    & Partial<MaybeRefObject<DistributiveOmit<ButtonComponentData, 'label' | 'type'>>>
    & {
      defer?: boolean
      hide?: MaybeRef<boolean>
      collector?: ButtonCollectorOptions
    },
]

export interface AccumulatedOptions {
  flags?: MessageCreateOptions['flags']
  files?: MaybeRef<File>[]
  buttons?: ButtonHandlerArgs[]
}
```

- [ ] **Step 3: Run existing reply tests to confirm baseline**

Run: `bun run test test/reply.test.ts`
Expected: PASS — 20 tests passing (8 reply + 12 modal)

- [ ] **Step 4: Add the `getButtonComponent` and `deepToRaw` exports (cut from reply.ts)**

```ts
// Append to src/runtime/server/utils/messageSender.ts

export function getButtonComponent(buttons: ButtonHandlerArgs[]): NonNullable<BaseMessageOptions['components']> {
  if (buttons.length === 0)
    return []

  let row = new ActionRowBuilder<ButtonBuilder>()
  const rows = [row]

  const it = Iterator.from(buttons)
    .filter(([, , options]) => !(toValue(options?.hide ?? false)))
    .map(([label, , options]) => {
      options ??= {} as NonNullable<typeof options>

      if (toValue(options.style) == null) {
        options.style = ButtonStyle.Primary
      }
      if (options.style === ButtonStyle.Primary) {
        if (!('customId' in options) || options.customId == null) {
          (options as any).customId = `button-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        }
      }

      return new ButtonBuilder(
        Object.fromEntries(
          Object.entries({
            label,
            ...options,
            type: ComponentType.Button,
          }).map(([key, value]) => [key, toValue(value)]),
        ),
      )
    })

  for (let i = 0; i < 5; i++) {
    row.addComponents(...it.take(5))

    if (row.components.length >= 5) {
      row = new ActionRowBuilder()
      rows.push(row)
    }
  }

  if (row.components.length === 0)
    rows.pop()

  return rows
}

// https://github.com/vuejs/core/issues/5303#issuecomment-1543596383
export function deepToRaw<T extends Record<string, any>>(sourceObj: T): T {
  const cycleDetector = new WeakSet()
  const objectIterator = (input: any): any => {
    if (cycleDetector.has(input)) {
      return input
    }
    if (Array.isArray(input)) {
      cycleDetector.add(input)
      return input.map(item => objectIterator(item))
    }
    if (isRef(input) || isReactive(input) || isProxy(input)) {
      cycleDetector.add(input)
      return objectIterator(isRef(input) ? toValue(input) : toRaw(input))
    }
    if (input && typeof input === 'object') {
      cycleDetector.add(input)
      const copy = Object.fromEntries(
        Object.entries(input)
          .map(([key, value]) => [key, objectIterator(value)]),
      )
      Object.setPrototypeOf(copy, Object.getPrototypeOf(input))
      return copy
    }
    return input
  }

  return objectIterator(sourceObj)
}

export function registerButtonCollectors(
  msg: SentMessage,
  buttons: ButtonHandlerArgs[],
  existingCollectors: InteractionCollector<ButtonInteraction>[],
): InteractionCollector<ButtonInteraction>[] {
  for (const collector of existingCollectors)
    collector.stop()
  const newCollectors: InteractionCollector<ButtonInteraction>[] = []
  for (const [, buttonHandler, options] of buttons) {
    let collectorOptions: ButtonCollectorOptions | undefined
    if (options && 'collector' in options && options.collector)
      collectorOptions = options.collector
    let collector: InteractionCollector<ButtonInteraction>
    if ('resource' in msg) {
      collector = msg.resource!.message!.createMessageComponentCollector({
        componentType: ComponentType.Button,
        ...collectorOptions,
      })
    }
    else {
      collector = (msg as Message).createMessageComponentCollector({
        componentType: ComponentType.Button,
        ...collectorOptions,
      })
    }
    newCollectors.push(collector)
    collector.on('collect', async (buttonInteraction) => {
      if (options?.defer ?? true)
        buttonInteraction.deferUpdate()
      await buttonHandler(buttonInteraction)
    })
  }
  return newCollectors
}
```

- [ ] **Step 5: Add the `sendReactiveMessage` core helper that ties it all together**

```ts
// Append to src/runtime/server/utils/messageSender.ts

export interface SendOptions {
  flags?: MessageCreateOptions['flags']
  files?: MaybeRef<File>[]
}

/**
 * Sends a message and watches the reactive options for changes, editing on update.
 * Returns the message promise. Sets up button collectors automatically.
 */
export function sendReactiveMessage(
  config: MessageSenderConfig,
  content: MaybeRef<string> | undefined,
  opts: SendOptions & { buttons?: ButtonHandlerArgs[] },
): Promise<SentMessage> {
  const buttons = opts.buttons ?? []
  const buttonComponents = computed(() => getButtonComponent(buttons))
  let collectors: InteractionCollector<ButtonInteraction>[] = []

  const messageOptions = reactive({
    content,
    ...buttonComponents.value.length > 0 ? { components: buttonComponents } : {},
    ...(opts.flags != null ? { flags: opts.flags } : {}),
    ...(opts.files != null ? { files: opts.files } : {}),
  }) as MessageCreateOptions

  const messagePromise: Promise<SentMessage> = config
    .send(deepToRaw(messageOptions) as MessageCreateOptions)
    .then((msg) => {
      collectors = registerButtonCollectors(msg, buttons, collectors)
      return msg
    })
    .catch((err) => {
      logger.error(err)
      return err
    })

  watch(messageOptions, async (newOpts) => {
    const msg = await messagePromise
    const edited = await config.edit(msg, deepToRaw(newOpts) as MessageCreateOptions)
    collectors = registerButtonCollectors(edited, buttons, collectors)
  }, { deep: true, flush: 'sync' })

  return messagePromise
}
```

- [ ] **Step 6: Run reply tests again to confirm baseline still holds**

Run: `bun run test test/reply.test.ts`
Expected: PASS — 20 tests still passing (we haven't touched reply.ts yet)

- [ ] **Step 7: Run lint and typecheck**

Run: `bun run lint --fix 2>&1 | tail -3 && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep -v 'docs/\|test/fixtures/' | head -5`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/runtime/server/utils/messageSender.ts
git commit -m "$(cat <<'EOF'
refactor: extract shared message sender helper from reply

Pull the reactive option accumulation, button collector registration,
deepToRaw unwrap, and watch-on-edit logic out of reply.ts into a new
messageSender.ts. reply.ts will adopt this in the next commit and
useTextChannel will use it for channel.send().

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `currentChannel` Module State

**Files:**
- Modify: `src/runtime/server/utils/client.ts:75-78` (add alongside `currentInteraction`)
- Test: `test/useTextChannel.test.ts` (will be created in Task 4)

We need a module-level mutable singleton that holds "the channel the framework knows is in scope right now," mirroring the existing `currentInteraction` pattern. The framework sets this before invoking each handler, clears it after. `useTextChannel(undefined)` reads from here.

- [ ] **Step 1: Locate the existing currentInteraction declaration**

Run: `grep -n "currentInteraction" src/runtime/server/utils/client.ts`
Expected output:
```
75:let currentInteraction: ChatInputCommandInteraction | null = null
76:export function useInteraction(): ChatInputCommandInteraction | null {
```
(plus any other uses)

- [ ] **Step 2: Add `currentChannel` declaration and accessors**

Modify `src/runtime/server/utils/client.ts` — add right below the `useInteraction` function (around line 78):

```ts
let currentChannel: import('discord.js').TextBasedChannel | null = null

export function setCurrentChannel(ch: import('discord.js').TextBasedChannel | null) {
  currentChannel = ch
}

export function getCurrentChannel(): import('discord.js').TextBasedChannel | null {
  return currentChannel
}
```

- [ ] **Step 3: Run typecheck**

Run: `bunx tsc --noEmit --project tsconfig.json 2>&1 | grep -v 'docs/\|test/fixtures/' | head -5`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/runtime/server/utils/client.ts
git commit -m "$(cat <<'EOF'
feat: add currentChannel module state alongside currentInteraction

Adds a module-level mutable holder for the "current text channel" that
the framework can set before invoking handlers. Mirrors the existing
currentInteraction pattern. useTextChannel will read from this when no
explicit channel is passed.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire `currentChannel` Setting into Handler Invocations

**Files:**
- Modify: `src/runtime/server/utils/client.ts` — `#handleSlashCommand`, `#handleContextMenu`, `registerListeners`

We set `currentChannel` before each handler runs and clear it after. Three call sites:
1. **Slash command** (`#handleSlashCommand`) — `interaction.channel`
2. **Context menu** (`#handleContextMenu`) — `interaction.channel`
3. **Event listener** (`registerListeners`) — extracted via a per-event accessor map

- [ ] **Step 1: Find #handleSlashCommand's scope.run block**

Run: `grep -n "scope.run" src/runtime/server/utils/client.ts`
Expected: lines like `scope.run(() => {` around 472 and `scope.run(() => (scope = effectScope()))` around 460.

- [ ] **Step 2: Modify `#handleSlashCommand` to set/clear currentChannel around the scope.run that calls execute**

Locate this block (around lines 471-477):
```ts
let result!: SlashCommandReturnType
scope.run(() => {
  currentInteraction = interaction
  setMiddlewareContext(middlewareContext)
  result = command.execute!(...args)
  currentInteraction = null
  setMiddlewareContext(null)
})
```

Change to:
```ts
let result!: SlashCommandReturnType
scope.run(() => {
  currentInteraction = interaction
  currentChannel = (interaction.channel as TextBasedChannel) ?? null
  setMiddlewareContext(middlewareContext)
  result = command.execute!(...args)
  currentInteraction = null
  currentChannel = null
  setMiddlewareContext(null)
})
```

You'll need `TextBasedChannel` imported. Check the existing imports at the top of the file and add to the type-only `discord.js` import:

```ts
import type { ..., TextBasedChannel, ... } from 'discord.js'
```

- [ ] **Step 3: Modify `#handleContextMenu` to set/clear currentChannel**

Find the try block in `#handleContextMenu` (around line 287). Wrap the menu.execute calls:

```ts
try {
  currentChannel = (interaction.channel as TextBasedChannel) ?? null
  const result: unknown = menu.type === 'user' && interaction.isUserContextMenuCommand()
    ? await menu.execute(interaction)
    : menu.type === 'message' && interaction.isMessageContextMenuCommand()
      ? await menu.execute(interaction)
      : undefined
      // ... existing reply-builder handling ...
  this.#logActivity({ ...activityBase, status: 'ok', duration: Date.now() - start })
}
catch (error) {
  // ... existing error handling ...
}
finally {
  currentChannel = null
}
```

- [ ] **Step 4: Define an event-channel accessor map at module level (near currentChannel)**

Add right after the `getCurrentChannel` export added in Task 2:

```ts
import type { Message, MessageReaction, ThreadChannel, Typing, VoiceState } from 'discord.js'

/**
 * Map of Discord event names to a function that extracts the relevant TextBasedChannel
 * from the event's first argument. Used by registerListeners to set currentChannel before
 * invoking the handler so useTextChannel() works inside listeners.
 */
const LISTENER_CHANNEL_ACCESSORS: Record<string, (...args: any[]) => import('discord.js').TextBasedChannel | null> = {
  messageCreate: (msg: Message) => msg.channel ?? null,
  messageUpdate: (_old: Message, newMsg: Message) => newMsg.channel ?? null,
  messageDelete: (msg: Message) => msg.channel ?? null,
  messageReactionAdd: (reaction: MessageReaction) => reaction.message.channel ?? null,
  messageReactionRemove: (reaction: MessageReaction) => reaction.message.channel ?? null,
  typingStart: (typing: Typing) => (typing.channel as import('discord.js').TextBasedChannel) ?? null,
  channelCreate: (ch: any) => (ch && 'send' in ch ? ch as import('discord.js').TextBasedChannel : null),
  channelUpdate: (_old: any, newCh: any) => (newCh && 'send' in newCh ? newCh as import('discord.js').TextBasedChannel : null),
  channelDelete: (ch: any) => (ch && 'send' in ch ? ch as import('discord.js').TextBasedChannel : null),
  threadCreate: (thread: ThreadChannel) => thread,
  threadUpdate: (_old: ThreadChannel, newThread: ThreadChannel) => newThread,
  threadDelete: (thread: ThreadChannel) => thread,
  voiceStateUpdate: (_old: VoiceState, newState: VoiceState) =>
    (newState.channel && 'send' in newState.channel ? newState.channel as import('discord.js').TextBasedChannel : null),
}
```

- [ ] **Step 5: Modify `registerListeners` to wrap handlers with currentChannel setup**

Locate the current implementation (around lines 138-162) and replace the inner handler:

```ts
  public registerListeners(listeners: ListenerDefinition[]) {
    if (!this.#client) {
      logger.warn('Cannot register listeners before client is started')
      return
    }
    for (const listener of listeners) {
      const accessor = LISTENER_CHANNEL_ACCESSORS[listener.event]
      const handler = async (...args: unknown[]) => {
        const previousChannel = currentChannel
        if (accessor) {
          try {
            currentChannel = accessor(...args) ?? null
          }
          catch {
            currentChannel = null
          }
        }
        try {
          await (listener.execute as (...a: unknown[]) => void | Promise<void>)(...args)
        }
        catch (error) {
          logger.error(`Listener error [${listener.event}]:`, error)
        }
        finally {
          currentChannel = previousChannel
        }
      }
      if (listener.once) {
        this.#client.once(listener.event, handler)
      }
      else {
        this.#client.on(listener.event, handler)
      }
    }
    if (listeners.length > 0) {
      logger.log(`Registered ${listeners.length} event listener(s)`)
    }
  }
```

- [ ] **Step 6: Run all tests to confirm nothing broke**

Run: `bun run test`
Expected: PASS — 118 tests still passing

- [ ] **Step 7: Run lint and typecheck**

Run: `bun run lint --fix 2>&1 | tail -3 && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep -v 'docs/\|test/fixtures/' | head -5`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/runtime/server/utils/client.ts
git commit -m "$(cat <<'EOF'
feat: set currentChannel before invoking command, context menu, and listener handlers

Slash commands and context menus now expose interaction.channel as the
ambient currentChannel. Event listeners get a per-event channel accessor
map (messageCreate -> message.channel, etc.) and the handler wrapper
sets/clears currentChannel around the user's listener function. Enables
useTextChannel() to work without explicit args inside any handler.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement `useTextChannel` — Resolution and Static Properties

**Files:**
- Create: `src/runtime/server/utils/useTextChannel.ts`
- Create: `test/useTextChannel.test.ts`

Start with channel resolution and the static (non-reactive) properties. Reactive refs and `send` come in subsequent tasks. TDD: write the failing tests first, then the implementation.

- [ ] **Step 1: Write the failing test for channel resolution**

```ts
// test/useTextChannel.test.ts
import type { TextBasedChannel } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setCurrentChannel } from '../src/runtime/server/utils/client'
import { useTextChannel } from '../src/runtime/server/utils/useTextChannel'

vi.mock('nitropack/runtime', () => ({
  useNitroApp: vi.fn(() => ({ hooks: { callHook: vi.fn(), hook: vi.fn() } })),
  useRuntimeConfig: vi.fn(() => ({ discord: { interactionTimeout: 0 } })),
}))

function mockTextChannel(overrides: Partial<TextBasedChannel> = {}): TextBasedChannel {
  const fakeMessage = { id: 'msg-1', edit: vi.fn(() => Promise.resolve(fakeMessage)) }
  return {
    id: 'channel-1',
    type: 0,
    guildId: 'guild-1',
    createdAt: new Date(0),
    name: 'general',
    topic: null,
    nsfw: false,
    parent: null,
    lastMessage: null,
    members: new Map(),
    send: vi.fn(() => Promise.resolve(fakeMessage)),
    isTextBased: () => true,
    ...overrides,
  } as unknown as TextBasedChannel
}

describe('useTextChannel', () => {
  beforeEach(() => {
    setCurrentChannel(null)
  })

  describe('resolution', () => {
    it('uses the explicit instance when passed a channel object', () => {
      const ch = mockTextChannel({ id: 'explicit-1' })
      const result = useTextChannel(ch)
      expect(result.id).toBe('explicit-1')
    })

    it('uses currentChannel when no arg is passed', () => {
      const ch = mockTextChannel({ id: 'ambient-1' })
      setCurrentChannel(ch)
      const result = useTextChannel()
      expect(result.id).toBe('ambient-1')
    })

    it('throws a clear error when no channel is available', () => {
      setCurrentChannel(null)
      expect(() => useTextChannel()).toThrow(/no current channel/i)
    })

    it('throws when the resolved channel is not text-based', () => {
      const ch = { id: 'voice', isTextBased: () => false } as any
      expect(() => useTextChannel(ch)).toThrow(/not a text channel/i)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test test/useTextChannel.test.ts`
Expected: FAIL — module not found, useTextChannel doesn't exist

- [ ] **Step 3: Create useTextChannel.ts with resolution + static props**

```ts
// src/runtime/server/utils/useTextChannel.ts
import type { TextBasedChannel } from 'discord.js'
import { getCurrentChannel } from './client'

export interface UseTextChannelReturn {
  // Static identifiers
  id: string
  type: number
  guildId: string | null
  createdAt: Date | null
  /** The underlying discord.js channel — escape hatch */
  raw: TextBasedChannel
}

export function useTextChannel(idOrInstance?: string | TextBasedChannel): UseTextChannelReturn {
  let channel: TextBasedChannel | null = null

  if (idOrInstance && typeof idOrInstance !== 'string') {
    channel = idOrInstance
  }
  else if (typeof idOrInstance === 'string') {
    // String ID resolution requires the discord.js Client. Implemented in a later task.
    throw new TypeError('useTextChannel(channelId) — string ID resolution is not yet implemented')
  }
  else {
    channel = getCurrentChannel()
  }

  if (!channel)
    throw new Error('useTextChannel: no current channel available. Pass a channel ID or instance, or call from inside a handler that has channel context.')

  if (typeof (channel as any).isTextBased === 'function' && !(channel as any).isTextBased())
    throw new Error('useTextChannel: resolved channel is not a text channel.')

  return {
    id: channel.id,
    type: (channel as any).type ?? 0,
    guildId: (channel as any).guildId ?? null,
    createdAt: (channel as any).createdAt ?? null,
    raw: channel,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test test/useTextChannel.test.ts`
Expected: PASS — 4 resolution tests pass

- [ ] **Step 5: Run full test suite to confirm nothing else broke**

Run: `bun run test`
Expected: PASS — 122 tests (118 previous + 4 new)

- [ ] **Step 6: Run lint and typecheck**

Run: `bun run lint --fix 2>&1 | tail -3 && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep -v 'docs/\|test/fixtures/' | head -5`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/runtime/server/utils/useTextChannel.ts test/useTextChannel.test.ts
git commit -m "$(cat <<'EOF'
feat(channel): implement useTextChannel resolution and static props

Resolves the channel from explicit instance, currentChannel ambient
state, or throws with a clear message. Returns id/type/guildId/
createdAt/raw — all static for now. Reactive refs and send come next.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add Reactive Refs (name, topic, nsfw, parent)

**Files:**
- Modify: `src/runtime/server/utils/useTextChannel.ts`
- Modify: `test/useTextChannel.test.ts`

Reactive refs are wired via the discord.js client's `Events.ChannelUpdate` event. We register a listener filtered by `channel.id` that updates the refs when Discord notifies us. The listener is registered on the active EffectScope; if there isn't one, we use `onScopeDispose` to unregister it manually.

- [ ] **Step 1: Write the failing test for reactive name updates**

Add to `test/useTextChannel.test.ts`:

```ts
import { EventEmitter } from 'node:events'
import { effectScope } from 'vue'

// Mock discord.js Events
const Events = { ChannelUpdate: 'channelUpdate' }

function mockClient(): EventEmitter & { on: any, off: any } {
  const emitter = new EventEmitter()
  return emitter as any
}

function mockTextChannelWithClient(overrides: Partial<any> = {}) {
  const client = mockClient()
  const ch = mockTextChannel({
    ...overrides,
    client,
  } as any)
  return { channel: ch, client }
}

describe('reactive properties', () => {
  it('exposes name as a reactive ref that updates on ChannelUpdate', async () => {
    const scope = effectScope()
    scope.run(() => {
      const { channel, client } = mockTextChannelWithClient({ name: 'old-name' })
      const ch = useTextChannel(channel)
      expect(ch.name.value).toBe('old-name')

      // Simulate Discord emitting a ChannelUpdate for THIS channel
      const updatedChannel = { ...channel, name: 'new-name' }
      client.emit('channelUpdate', channel, updatedChannel)

      expect(ch.name.value).toBe('new-name')
    })
    scope.stop()
  })

  it('does not update name when ChannelUpdate fires for a different channel', () => {
    const scope = effectScope()
    scope.run(() => {
      const { channel, client } = mockTextChannelWithClient({ id: 'ch-1', name: 'one' })
      const ch = useTextChannel(channel)
      const otherChannel = { id: 'ch-2', name: 'two' }
      client.emit('channelUpdate', otherChannel, { ...otherChannel, name: 'two-renamed' })
      expect(ch.name.value).toBe('one')
    })
    scope.stop()
  })

  it('exposes topic, nsfw, parent as reactive refs', () => {
    const scope = effectScope()
    scope.run(() => {
      const { channel } = mockTextChannelWithClient({
        topic: 'old topic',
        nsfw: false,
        parent: null,
      } as any)
      const ch = useTextChannel(channel)
      expect(ch.topic.value).toBe('old topic')
      expect(ch.nsfw.value).toBe(false)
      expect(ch.parent.value).toBe(null)
    })
    scope.stop()
  })

  it('removes the channelUpdate listener when scope is disposed', () => {
    const scope = effectScope()
    let channelRef!: ReturnType<typeof useTextChannel>
    let emitter!: EventEmitter
    scope.run(() => {
      const { channel, client } = mockTextChannelWithClient({ name: 'before' })
      emitter = client
      channelRef = useTextChannel(channel)
    })
    expect(emitter.listenerCount('channelUpdate')).toBeGreaterThan(0)
    scope.stop()
    expect(emitter.listenerCount('channelUpdate')).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test test/useTextChannel.test.ts -t "reactive properties"`
Expected: FAIL — `ch.name.value` is undefined (current return doesn't have refs)

- [ ] **Step 3: Update UseTextChannelReturn and useTextChannel implementation**

Replace `src/runtime/server/utils/useTextChannel.ts` body with:

```ts
import type { CategoryChannel, TextBasedChannel } from 'discord.js'
import type { Ref } from 'vue'
import { Events } from 'discord.js'
import { getCurrentScope, onScopeDispose, ref } from 'vue'
import { getCurrentChannel } from './client'

export interface UseTextChannelReturn {
  // Static identifiers
  id: string
  type: number
  guildId: string | null
  createdAt: Date | null

  // Reactive — driven by Discord client events
  name: Ref<string>
  topic: Ref<string | null>
  nsfw: Ref<boolean>
  parent: Ref<CategoryChannel | null>

  /** The underlying discord.js channel — escape hatch */
  raw: TextBasedChannel
}

export function useTextChannel(idOrInstance?: string | TextBasedChannel): UseTextChannelReturn {
  let channel: TextBasedChannel | null = null

  if (idOrInstance && typeof idOrInstance !== 'string') {
    channel = idOrInstance
  }
  else if (typeof idOrInstance === 'string') {
    throw new TypeError('useTextChannel(channelId) — string ID resolution is not yet implemented')
  }
  else {
    channel = getCurrentChannel()
  }

  if (!channel)
    throw new Error('useTextChannel: no current channel available. Pass a channel ID or instance, or call from inside a handler that has channel context.')

  if (typeof (channel as any).isTextBased === 'function' && !(channel as any).isTextBased())
    throw new Error('useTextChannel: resolved channel is not a text channel.')

  const ch = channel as any

  // Reactive refs initialised from the channel's current state
  const name = ref<string>(ch.name ?? '')
  const topic = ref<string | null>(ch.topic ?? null)
  const nsfw = ref<boolean>(ch.nsfw ?? false)
  const parent = ref<CategoryChannel | null>(ch.parent ?? null)

  // Subscribe to discord.js client events filtered by channel id
  const client = ch.client as { on: Function, off: Function } | undefined
  if (client) {
    const onUpdate = (_oldCh: any, newCh: any) => {
      if (!newCh || newCh.id !== ch.id)
        return
      name.value = newCh.name ?? name.value
      topic.value = newCh.topic ?? null
      nsfw.value = newCh.nsfw ?? false
      parent.value = newCh.parent ?? null
    }
    client.on(Events.ChannelUpdate, onUpdate)

    // Auto-cleanup when the current Vue scope disposes
    if (getCurrentScope()) {
      onScopeDispose(() => client.off(Events.ChannelUpdate, onUpdate))
    }
  }

  return {
    id: ch.id,
    type: ch.type ?? 0,
    guildId: ch.guildId ?? null,
    createdAt: ch.createdAt ?? null,
    name,
    topic,
    nsfw,
    parent,
    raw: channel,
  }
}
```

- [ ] **Step 4: Run reactive tests to verify they pass**

Run: `bun run test test/useTextChannel.test.ts`
Expected: PASS — all tests pass (resolution + reactive properties)

- [ ] **Step 5: Run full test suite**

Run: `bun run test`
Expected: PASS — 126 tests (118 + 8 new useTextChannel tests)

- [ ] **Step 6: Run lint and typecheck**

Run: `bun run lint --fix 2>&1 | tail -3 && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep -v 'docs/\|test/fixtures/' | head -5`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/runtime/server/utils/useTextChannel.ts test/useTextChannel.test.ts
git commit -m "$(cat <<'EOF'
feat(channel): add reactive name/topic/nsfw/parent refs

Refs are initialised from the channel's current state and updated when
the Discord client fires Events.ChannelUpdate for this channel id.
Listener is auto-removed via onScopeDispose so it dies with the
interactionTimeout effect scope.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add Reactive `members` Ref (event-backed)

**Files:**
- Modify: `src/runtime/server/utils/useTextChannel.ts`
- Modify: `test/useTextChannel.test.ts`

The `members` Collection on a guild text channel is computed from guild membership + permission overrides. We listen to `GuildMemberAdd`, `GuildMemberRemove`, and `GuildMemberUpdate` filtered by guildId, plus `ChannelUpdate` (because permission override changes can change visibility). On any of these, we re-snapshot `channel.members` into the ref.

- [ ] **Step 1: Write the failing test for members reactivity**

Add to the `reactive properties` describe block:

```ts
it('exposes members as a reactive ref that updates on member events', () => {
  const scope = effectScope()
  scope.run(() => {
    const initialMembers = new Map([['user-1', { id: 'user-1', user: { username: 'alice' } }]])
    const { channel, client } = mockTextChannelWithClient({
      guildId: 'guild-1',
      members: initialMembers,
    } as any)
    const ch = useTextChannel(channel)
    expect(ch.members.value.size).toBe(1)

    // Simulate a member join — channel.members updates underlying, then event fires
    const updatedMembers = new Map([
      ['user-1', { id: 'user-1' }],
      ['user-2', { id: 'user-2', user: { username: 'bob' } }],
    ])
    ;(channel as any).members = updatedMembers
    client.emit('guildMemberAdd', { guild: { id: 'guild-1' }, id: 'user-2' })

    expect(ch.members.value.size).toBe(2)
  })
  scope.stop()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test test/useTextChannel.test.ts -t "members"`
Expected: FAIL — `members` does not exist on the return type

- [ ] **Step 3: Implement members ref**

In `src/runtime/server/utils/useTextChannel.ts`, add to the `UseTextChannelReturn` interface (after `parent`):

```ts
members: Ref<Map<string, any>>
```

In the implementation (after the `parent` ref):

```ts
const members = ref<Map<string, any>>(new Map(ch.members ?? []))
```

Add `Events.GuildMemberAdd`, `Events.GuildMemberRemove`, `Events.GuildMemberUpdate` listeners after the existing ChannelUpdate listener:

```ts
if (client) {
  // ... existing onUpdate listener registration above ...

  const refreshMembers = () => {
    members.value = new Map(ch.members ?? [])
  }

  const onMemberAdd = (member: any) => {
    if (member?.guild?.id === ch.guildId)
      refreshMembers()
  }
  const onMemberRemove = onMemberAdd
  const onMemberUpdate = (_oldMember: any, newMember: any) => {
    if (newMember?.guild?.id === ch.guildId)
      refreshMembers()
  }

  client.on(Events.GuildMemberAdd, onMemberAdd)
  client.on(Events.GuildMemberRemove, onMemberRemove)
  client.on(Events.GuildMemberUpdate, onMemberUpdate)

  // Augment the existing onUpdate to also refresh members (perm overrides changed)
  // Move the existing onUpdate listener registration to use this combined cleanup:

  if (getCurrentScope()) {
    onScopeDispose(() => {
      client.off(Events.ChannelUpdate, onUpdate)
      client.off(Events.GuildMemberAdd, onMemberAdd)
      client.off(Events.GuildMemberRemove, onMemberRemove)
      client.off(Events.GuildMemberUpdate, onMemberUpdate)
    })
  }
}
```

Update the existing `onUpdate` to also call `refreshMembers()` at the end so permission-override changes refresh the members snapshot:

```ts
function onUpdate(_oldCh: any, newCh: any) {
  if (!newCh || newCh.id !== ch.id)
    return
  name.value = newCh.name ?? name.value
  topic.value = newCh.topic ?? null
  nsfw.value = newCh.nsfw ?? false
  parent.value = newCh.parent ?? null
  members.value = new Map(ch.members ?? [])
}
```

Add `members` to the returned object.

- [ ] **Step 4: Run tests**

Run: `bun run test test/useTextChannel.test.ts`
Expected: PASS — all tests including members test

- [ ] **Step 5: Run full test suite**

Run: `bun run test`
Expected: PASS — 127 tests

- [ ] **Step 6: Run lint and typecheck**

Run: `bun run lint --fix 2>&1 | tail -3 && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep -v 'docs/\|test/fixtures/' | head -5`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/runtime/server/utils/useTextChannel.ts test/useTextChannel.test.ts
git commit -m "$(cat <<'EOF'
feat(channel): add reactive members ref backed by guild member events

Listens to GuildMemberAdd/Remove/Update filtered by the channel's
guildId and re-snapshots channel.members. ChannelUpdate also refreshes
members because permission-override changes can change visibility.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add Reactive `lastMessage` Ref

**Files:**
- Modify: `src/runtime/server/utils/useTextChannel.ts`
- Modify: `test/useTextChannel.test.ts`

`lastMessage` updates on `Events.MessageCreate` filtered by channel id.

- [ ] **Step 1: Write the failing test**

Add to the `reactive properties` describe:

```ts
it('exposes lastMessage as a reactive ref that updates on MessageCreate', () => {
  const scope = effectScope()
  scope.run(() => {
    const { channel, client } = mockTextChannelWithClient({ id: 'ch-1', lastMessage: null })
    const ch = useTextChannel(channel)
    expect(ch.lastMessage.value).toBe(null)

    const newMsg = { id: 'msg-1', content: 'hi', channelId: 'ch-1', channel: { id: 'ch-1' } }
    client.emit('messageCreate', newMsg)

    expect(ch.lastMessage.value).toBe(newMsg)
  })
  scope.stop()
})

it('does not update lastMessage on MessageCreate for a different channel', () => {
  const scope = effectScope()
  scope.run(() => {
    const { channel, client } = mockTextChannelWithClient({ id: 'ch-1', lastMessage: null })
    const ch = useTextChannel(channel)
    client.emit('messageCreate', { id: 'msg-x', channelId: 'ch-2', channel: { id: 'ch-2' } })
    expect(ch.lastMessage.value).toBe(null)
  })
  scope.stop()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test test/useTextChannel.test.ts -t "lastMessage"`
Expected: FAIL — `lastMessage` doesn't exist

- [ ] **Step 3: Implement lastMessage ref**

In `UseTextChannelReturn`:

```ts
lastMessage: Ref<any | null>
```

In the implementation (after `members` ref):

```ts
const lastMessage = ref<any | null>(ch.lastMessage ?? null)
```

Add a MessageCreate listener (alongside the others, before the `onScopeDispose`):

```ts
function onMessageCreate(msg: any) {
  if (msg?.channelId === ch.id || msg?.channel?.id === ch.id)
    lastMessage.value = msg
}
client.on(Events.MessageCreate, onMessageCreate)
```

Add to the dispose cleanup:

```ts
client.off(Events.MessageCreate, onMessageCreate)
```

Add `lastMessage` to the returned object.

- [ ] **Step 4: Run tests**

Run: `bun run test test/useTextChannel.test.ts`
Expected: PASS — all tests including new lastMessage tests

- [ ] **Step 5: Run full test suite**

Run: `bun run test`
Expected: PASS — 129 tests

- [ ] **Step 6: Run lint and typecheck**

Run: `bun run lint --fix 2>&1 | tail -3 && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep -v 'docs/\|test/fixtures/' | head -5`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/runtime/server/utils/useTextChannel.ts test/useTextChannel.test.ts
git commit -m "$(cat <<'EOF'
feat(channel): add reactive lastMessage ref via MessageCreate event

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add `send()` Method to useTextChannel

**Files:**
- Modify: `src/runtime/server/utils/useTextChannel.ts`
- Modify: `test/useTextChannel.test.ts`

`send` mirrors `reply`'s contract: accepts string or `MaybeRef<string>`, supports an options object, returns a handle with `.message`/`.edit`/`.delete`. Uses the `messageSender` helper from Task 1.

- [ ] **Step 1: Write the failing test**

Add a new describe block to `test/useTextChannel.test.ts`:

```ts
describe('send', () => {
  it('sends a string message to the channel and returns a handle', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const { channel } = mockTextChannelWithClient()
      const ch = useTextChannel(channel)
      const handle = ch.send('hello channel')
      expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({ content: 'hello channel' }))
      const msg = await handle.message
      expect(msg).toBeDefined()
    })
    scope.stop()
  })

  it('edits the message when a reactive ref changes', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const fakeMessage = { id: 'msg-1', edit: vi.fn(() => Promise.resolve({ id: 'msg-1' })) }
      const { channel } = mockTextChannelWithClient()
      ;(channel.send as any).mockReturnValue(Promise.resolve(fakeMessage))

      const ch = useTextChannel(channel)
      const text = ref('initial')
      const handle = ch.send(text)
      await handle.message

      text.value = 'updated'
      // Wait a tick for the watch to fire
      await new Promise(r => setTimeout(r, 10))
      expect(fakeMessage.edit).toHaveBeenCalledWith(expect.objectContaining({ content: 'updated' }))
    })
    scope.stop()
  })

  it('exposes edit and delete methods on the handle', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const fakeMessage = {
        id: 'msg-1',
        edit: vi.fn(() => Promise.resolve({ id: 'msg-1' })),
        delete: vi.fn(() => Promise.resolve()),
      }
      const { channel } = mockTextChannelWithClient()
      ;(channel.send as any).mockReturnValue(Promise.resolve(fakeMessage))

      const ch = useTextChannel(channel)
      const handle = ch.send('first')
      await handle.message

      await handle.edit('second')
      expect(fakeMessage.edit).toHaveBeenCalledWith(expect.objectContaining({ content: 'second' }))

      await handle.delete()
      expect(fakeMessage.delete).toHaveBeenCalled()
    })
    scope.stop()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test test/useTextChannel.test.ts -t "send"`
Expected: FAIL — `send` is not a function

- [ ] **Step 3: Implement send via messageSender helper**

Add the import at the top of `src/runtime/server/utils/useTextChannel.ts`:

```ts
import type { MessageCreateOptions } from 'discord.js'
import type { MaybeRef } from 'vue'
import type { SentMessage } from './messageSender'
import { sendReactiveMessage } from './messageSender'
```

Add to `UseTextChannelReturn` interface:

```ts
  send: (
    content: MaybeRef<string>,
    options?: { files?: MaybeRef<File>[] },
  ) => SendHandle
}

export interface SendHandle {
  message: Promise<SentMessage>
  edit: (content: MaybeRef<string>) => Promise<void>
  delete: () => Promise<void>
}
```

(The `File` type — import it from `messageSender`: `import type { File } from './messageSender'`.)

Add to the implementation, before the return statement:

```ts
function send(content: MaybeRef<string>, options?: { files?: MaybeRef<File>[] }): SendHandle {
  const message = sendReactiveMessage(
    {
      send: opts => (channel as any).send(opts) as Promise<SentMessage>,
      edit: async (msg, opts) => {
        const target = 'edit' in msg ? msg : (msg as any).resource?.message
        return target.edit(opts) as Promise<SentMessage>
      },
    },
    content,
    { files: options?.files },
  )

  return {
    message,
    edit: async (newContent: MaybeRef<string>) => {
      const msg = await message
      const target = 'edit' in msg ? msg : (msg as any).resource?.message
      const { toValue } = await import('vue')
      await target.edit({ content: toValue(newContent) })
    },
    delete: async () => {
      const msg = await message
      const target = 'delete' in msg ? msg : (msg as any).resource?.message
      await target.delete()
    },
  }
}
```

Add `send` to the returned object.

- [ ] **Step 4: Run tests**

Run: `bun run test test/useTextChannel.test.ts -t "send"`
Expected: PASS — all 3 send tests pass

- [ ] **Step 5: Run full test suite**

Run: `bun run test`
Expected: PASS — 132 tests

- [ ] **Step 6: Run lint and typecheck**

Run: `bun run lint --fix 2>&1 | tail -3 && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep -v 'docs/\|test/fixtures/' | head -5`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/runtime/server/utils/useTextChannel.ts test/useTextChannel.test.ts
git commit -m "$(cat <<'EOF'
feat(channel): add send() method using shared messageSender helper

send() accepts MaybeRef<string> + optional files, returns a handle with
message promise, edit, and delete. Reactive content updates auto-edit
the message via the same watch mechanism reply uses.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Auto-Import + Type Exports

**Files:**
- Modify: `src/module.ts`
- Modify: `src/types.ts`

Make `useTextChannel` available without import in user code (same pattern as `defineSlashCommand`, `useMiddleware`, etc.).

- [ ] **Step 1: Find the auto-import block in module.ts**

Run: `grep -n "useMiddleware'" src/module.ts`
Expected: lines around 67-70 showing `useMiddleware` registration

- [ ] **Step 2: Add useTextChannel auto-import**

In `src/module.ts`, append to the `addImports` array (before the closing `])`):

```ts
      {
        name: 'useTextChannel',
        as: 'useTextChannel',
        from: ctx.resolve.module('runtime/server/utils/useTextChannel'),
      },
```

- [ ] **Step 3: Re-export the type from types.ts**

In `src/types.ts`, find the existing re-exports (around the `ContextMenuDefinition` export) and add:

```ts
export type { SendHandle, UseTextChannelReturn } from './runtime/server/utils/useTextChannel'
```

- [ ] **Step 4: Run tests + typecheck**

Run: `bun run test && bun run lint --fix && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep -v 'docs/\|test/fixtures/' | head -5`
Expected: 132 tests pass, no errors

- [ ] **Step 5: Commit**

```bash
git add src/module.ts src/types.ts
git commit -m "$(cat <<'EOF'
feat(channel): auto-import useTextChannel and export types

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Refactor reply.ts to Use Shared messageSender

**Files:**
- Modify: `src/runtime/server/utils/reply.ts`

Now that `useTextChannel.send` uses `messageSender`, refactor `reply` to do the same. Goal: eliminate the duplicate file/button/reactive logic. The reply-specific bits (ephemeral, the reply-vs-editReply-vs-followUp method picker, the iterator protocol, modal) stay.

This refactor is **behavior-preserving**. Test coverage in `test/reply.test.ts` (20 tests) is the safety net.

- [ ] **Step 1: Run reply tests to confirm baseline**

Run: `bun run test test/reply.test.ts`
Expected: PASS — 20 tests

- [ ] **Step 2: Read reply.ts in full to understand all branches**

Run: `wc -l src/runtime/server/utils/reply.ts && grep -n "function\|export" src/runtime/server/utils/reply.ts`

Identify the inner `createReplyFunction` function and the two branches inside the returned reply (lines 130-217).

- [ ] **Step 3: Replace the body of `createReplyFunction` to call `sendReactiveMessage`**

In `src/runtime/server/utils/reply.ts`, change the imports:

```ts
import type { ButtonHandlerArgs, File } from './messageSender'
import { sendReactiveMessage } from './messageSender'
```

Remove the inline `getButtonComponent` definition at the bottom and the inline `deepToRaw` definition (they live in messageSender.ts now). Re-export `deepToRaw` from messageSender for backwards compat:

```ts
export { deepToRaw } from './messageSender'
```

Replace the body of the inner `reply` function (the part with the two `if (typeof args[0] === 'string'...)` branches) with:

```ts
const reply = ((...args) => {
  const { buttons = [], ...restOptions } = defaultOptions

  if (typeof args[0] === 'string' || typeof args[0] === 'undefined' || isRef(args[0])) {
    const [text, options] = args

    const handler = (interaction: CommandInteraction) => {
      const message = sendReactiveMessage(
        {
          send: (opts) => {
            const method = interaction.replied
              ? 'followUp'
              : interaction.deferred ? 'editReply' : 'reply'
            return interaction[method](opts as any) as Promise<any>
          },
          edit: async (msg, opts) => {
            const target = 'resource' in msg ? msg.resource!.message! : msg
            return target.edit(opts as any) as Promise<any>
          },
        },
        text,
        {
          buttons,
          flags: restOptions.flags,
          files: restOptions.files,
          ...options,
        },
      )
      return message
    }

    Object.defineProperty(handler, Symbol.iterator, {
      value: () => {
        let messageRef: Promise<any> | undefined
        const wrappedHandler = ((i: CommandInteraction) => {
          messageRef = handler(i)
          return messageRef
        }) as any
        return {
          next: () => (
            messageRef !== undefined
              ? { done: true, value: messageRef }
              : { done: false, value: wrappedHandler }
          ),
        }
      },
    })

    return handler
  }
  else {
    const interaction = args[0]
    const method = interaction.replied
      ? 'followUp'
      : interaction.deferred ? 'editReply' : 'reply'
    const messagePromise = sendReactiveMessage(
      {
        send: opts => interaction[method](opts as any) as Promise<any>,
        edit: async (msg, opts) => {
          const target = 'resource' in msg ? msg.resource!.message! : msg
          return target.edit(opts as any) as Promise<any>
        },
      },
      undefined,
      { buttons, flags: restOptions.flags, files: restOptions.files },
    )

    return {
      [Symbol.iterator]: () => ({
        next: () => ({ done: true, value: messagePromise }),
      }),
    }
  }
}) as ReplyFunction
```

- [ ] **Step 4: Run reply tests to verify behavior preserved**

Run: `bun run test test/reply.test.ts`
Expected: PASS — 20 tests still passing

If any fail, the refactor lost behavior. Read the failure carefully and adjust the refactor — the messageSender's send/edit lambdas are the most likely culprits.

- [ ] **Step 5: Run full test suite**

Run: `bun run test`
Expected: PASS — 132 tests

- [ ] **Step 6: Run lint, typecheck, knip**

Run: `bun run lint --fix 2>&1 | tail -3 && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep -v 'docs/\|test/fixtures/' | head -5 && bun run knip 2>&1 | tail -3`
Expected: no errors, no unused exports

- [ ] **Step 7: Commit**

```bash
git add src/runtime/server/utils/reply.ts
git commit -m "$(cat <<'EOF'
refactor(reply): use shared messageSender helper

Behavior-preserving refactor: reply.ts now delegates the reactive
options accumulation, button collector wiring, and watch-on-edit logic
to messageSender. Reply-specific bits (ephemeral, method picker,
iterator protocol, modal) stay. All 20 reply tests still pass.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Playground Example

**Files:**
- Create: `playground/discord/commands/announce.ts`

A real command that exercises useTextChannel — broadcast to the current channel and show off reactive properties.

- [ ] **Step 1: Create the command**

```ts
// playground/discord/commands/announce.ts
import { ref } from 'vue'

/**
 * @description Announce something to the current channel and show channel info
 */
export default (message: string) => {
  const channel = useTextChannel()
  const status = ref('Announcing...')
  channel.send(status)

  setTimeout(() => {
    status.value = `**${message}**\n\n_(channel: ${channel.name.value}, members visible: ${channel.members.value.size})_`
  }, 500)

  return reply.ephemeral(`Announced to #${channel.name.value}`)
}
```

- [ ] **Step 2: Verify the playground prepares without errors**

Run: `bun run dev:prepare 2>&1 | tail -10`
Expected: no errors. The playground TypeScript should resolve `useTextChannel` via auto-imports.

- [ ] **Step 3: Commit**

```bash
git add playground/discord/commands/announce.ts
git commit -m "$(cat <<'EOF'
feat(playground): add /announce command demonstrating useTextChannel

Sends a reactive message to the channel that updates after a delay,
reads channel.name and channel.members, and confirms via ephemeral
reply.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Documentation

**Files:**
- Create: `docs/content/guide/use-text-channel.md`
- Modify: `docs/content/guide/responses.md` (cross-reference `useTextChannel` for non-interaction sends)
- Modify: `PLAN.md` (mark useTextChannel done)
- Modify: `README.md` (add to features list)

- [ ] **Step 1: Create the guide**

```md
---
title: useTextChannel
---

# useTextChannel

A composable wrapper over a Discord text channel. Exposes reactive properties (driven by Discord events) and a `send()` method mirroring `reply`'s API for sending non-interaction channel messages.

## Basic usage

```ts
export default () => {
  const channel = useTextChannel()
  channel.send('Hello channel!')
  return reply('Sent!')
}
```

`useTextChannel()` with no args reads from the ambient channel context — the channel of the current slash command, context menu, or channel-bearing event listener (`messageCreate`, `typingStart`, `channelUpdate`, etc.).

## Resolving a specific channel

```ts
const announcements = useTextChannel(myChannelInstance)
// String IDs require client.channels.fetch — not yet implemented
```

## Reactive properties

These refs auto-update when Discord fires the relevant events:

| Ref | Updated by |
| --- | --- |
| `channel.name` | `Events.ChannelUpdate` |
| `channel.topic` | `Events.ChannelUpdate` |
| `channel.nsfw` | `Events.ChannelUpdate` |
| `channel.parent` | `Events.ChannelUpdate` |
| `channel.members` | `GuildMemberAdd/Remove/Update` + `ChannelUpdate` (perm overrides) |
| `channel.lastMessage` | `Events.MessageCreate` |

```ts
import { watch } from 'vue'

export default () => {
  const ch = useTextChannel()
  watch(ch.name, (newName) => {
    console.log(`channel renamed to ${newName}`)
  })
  return reply(`Currently in #${ch.name.value}`)
}
```

## Static properties

`channel.id`, `channel.type`, `channel.guildId`, `channel.createdAt` — never change during the channel's life. `channel.raw` is the underlying discord.js Channel for escape-hatch usage.

## Sending messages

`channel.send(content, options?)` mirrors `reply`'s contract:

- Accepts `string` or `MaybeRef<string>` (auto-edits when the ref changes)
- Returns a handle: `{ message, edit, delete }`
- Supports `files` in the options object

```ts
const handle = channel.send('First message')
await handle.edit('Edited!')
await handle.delete()
```

Reactive content:

```ts
const status = ref('Loading...')
channel.send(status)
status.value = 'Done!' // message edits automatically
```

## Inside event listeners

```ts
// discord/listeners/messageCreate.ts
export default defineListener('messageCreate', (msg) => {
  if (msg.author.bot)
    return
  if (msg.content === '!ping') {
    const ch = useTextChannel() // uses msg.channel
    ch.send('Pong!')
  }
})
```

## Lifecycle and cleanup

The Discord event listeners registered by reactive refs are tied to the current Vue effect scope. In slash commands and context menus, that scope is disposed by the `interactionTimeout` (default: 15 minutes). In event listeners, it's disposed when the handler returns. This means `useTextChannel`'s overhead vanishes automatically — no manual cleanup needed.
```

- [ ] **Step 2: Cross-link from responses.md**

Find the section in `docs/content/guide/responses.md` that talks about messages and add (near the top, after the intro):

```md
> Need to send a non-interaction message to a channel (no 15-minute lifetime, no ephemeral)? See [useTextChannel](./use-text-channel).
```

- [ ] **Step 3: Update PLAN.md**

In the existing `PLAN.md`, find the most relevant phase. Add a new bullet (or new section after Phase 7):

```md
## Phase 9: Channel Composable — DONE

- [x] `useTextChannel(idOrInstance?)` composable
- [x] Reactive refs: `name`, `topic`, `nsfw`, `parent`, `members`, `lastMessage`
- [x] Static props: `id`, `type`, `guildId`, `createdAt`, `raw`
- [x] `send()` method mirroring reply's API (reactive content, files, edit/delete handle)
- [x] Ambient channel context set in slash commands, context menus, and channel-bearing event listeners
- [x] Shared messageSender helper extracted (reply now uses it)
- [x] Tests + playground example
```

Update test count in Phase 2 from `118 unit tests` to whatever the final count is (132 if all tasks pass).

- [ ] **Step 4: Update README.md features list**

In `README.md`, find the features list and add a bullet:

```md
- **Channel Composable** - `useTextChannel` exposes a Discord text channel as a reactive proxy with event-driven refs and a `send()` method
```

- [ ] **Step 5: Run lint to clean up any markdown issues**

Run: `bun run lint --fix 2>&1 | tail -3`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add docs/content/guide/use-text-channel.md docs/content/guide/responses.md PLAN.md README.md
git commit -m "$(cat <<'EOF'
docs(channel): add useTextChannel guide, update responses, plan, README

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

After execution, the engineer should verify:

1. **All tests pass:** `bun run test` shows 132+ passing tests (118 baseline + ~14 new useTextChannel tests).
2. **Lint clean:** `bun run lint`
3. **Typecheck clean:** `bunx tsc --noEmit --project tsconfig.json 2>&1 | grep -v 'docs/\|test/fixtures/' | head -5` returns nothing.
4. **Knip clean:** `bun run knip` shows no unused exports.
5. **`reply` behavior unchanged:** all 20 reply tests still pass after the messageSender refactor.
6. **`useTextChannel()` works without args** in slash commands, context menus, and `messageCreate` listeners.
7. **`useTextChannel(channel)` works** with an explicit channel instance.
8. **Playground `/announce` runs** end-to-end if a Discord token is configured.

## Notes for the Engineer

- **String channel ID resolution is intentionally deferred.** `useTextChannel('123')` throws with a clear error. Adding it requires `client.channels.fetch()` which is async and complicates the composable signature. We'll add it later if there's demand — for now, users can pass `client.channels.cache.get('123')` directly.
- **Voice channels and threads are out of scope** for this iteration. `useTextChannel` rejects non-text channels via the `isTextBased()` check.
- **The messageSender refactor in Task 10 is the riskiest step.** If reply tests start failing, don't try to "fix forward" — revert that single commit, leave reply.ts duplicating the logic, and ship `useTextChannel` first. The refactor can land in a follow-up.
- **The `Map` type for `members`** is a simplification over discord.js's `Collection`. If users complain about losing Collection methods, change `Ref<Map<string, any>>` to `Ref<Collection<string, GuildMember>>` and import `Collection` from discord.js.
