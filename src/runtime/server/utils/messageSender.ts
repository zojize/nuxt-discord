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
import { randomUUID } from 'node:crypto'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js'
import { computed, getCurrentScope, isRef, onScopeDispose, reactive, toRaw, toValue, watch } from 'vue'
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

export interface SendOptions {
  flags?: MessageCreateOptions['flags']
  files?: MaybeRef<readonly MaybeRef<File>[]>
  buttons?: ButtonHandlerArgs[]

  components?: any
}

export function getButtonComponent(buttons: ButtonHandlerArgs[]): NonNullable<BaseMessageOptions['components']> {
  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  for (const [label, , options] of buttons) {
    if (toValue(options?.hide))
      continue
    if (!rows.length || rows.at(-1)!.components.length === 5) {
      if (rows.length === 5)
        break
      rows.push(new ActionRowBuilder<ButtonBuilder>())
    }
    const { hide: _hide, collector: _collector, defer: _defer, ...fields } = options ?? {}
    const data = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, toValue(value)]))
    const style = toValue(options?.style) ?? ButtonStyle.Primary
    if (style === ButtonStyle.Link || style === ButtonStyle.Premium)
      delete data.customId
    else
      data.customId ??= randomUUID()
    rows.at(-1)!.addComponents(new ButtonBuilder({ ...data, style, label: toValue(label), type: ComponentType.Button }))
  }
  return rows
}

// https://github.com/vuejs/core/issues/5303#issuecomment-1543596383

export function deepToRaw<T extends Record<string, any>>(sourceObj: T): T {
  const copies = new WeakMap<object, any>()
  function unwrap(value: any): any {
    if (isRef(value))
      return unwrap(value.value)
    if (!value || typeof value !== 'object')
      return value
    const raw = toRaw(value)
    const prototype = Object.getPrototypeOf(raw)
    if (!Array.isArray(raw) && prototype !== Object.prototype && prototype !== null)
      return raw // Discord builders, buffers and streams must retain their internal state.
    if (copies.has(raw))
      return copies.get(raw)
    const copy: any = Array.isArray(raw) ? [] : Object.create(prototype)
    copies.set(raw, copy)
    for (const key of Object.keys(value))
      copy[key] = unwrap(value[key])
    return copy
  }

  return unwrap(sourceObj)
}

function registerButtonCollectors(
  msg: SentMessage,
  buttons: ButtonHandlerArgs[],
): InteractionCollector<ButtonInteraction>[] {
  const newCollectors: InteractionCollector<ButtonInteraction>[] = []
  for (const [, buttonHandler, options] of buttons) {
    if (!options || !('customId' in options))
      continue
    const { filter, ...collectorOptions } = options.collector ?? {}
    const target = 'resource' in msg ? msg.resource!.message! : msg
    const collector = target.createMessageComponentCollector({
      ...collectorOptions,
      componentType: ComponentType.Button,
      filter: (click, ...args) => click.customId === toValue(options.customId)
        && !toValue(options.hide) && (filter?.(click, ...args) ?? true),
    })
    newCollectors.push(collector)
    collector.on('collect', async (buttonInteraction) => {
      if (options.defer ?? true)
        await buttonInteraction.deferUpdate()
      await buttonHandler(buttonInteraction)
    })
  }
  return newCollectors
}

/**
 * Sends a message and watches the reactive options for changes, editing on update.
 * Returns the message promise. Sets up button collectors automatically.
 */
export function sendReactiveMessage(
  config: MessageSenderConfig,
  content: MaybeRef<string> | undefined,
  opts: SendOptions = {},
): Promise<SentMessage> {
  const buttons: ButtonHandlerArgs[] = (opts.buttons ?? []).map(([label, handler, options]) => [
    label,
    handler,
    { customId: randomUUID(), ...options },
  ])
  const buttonComponents = computed(() => getButtonComponent(buttons))
  let collectors: InteractionCollector<ButtonInteraction>[] = []

  const messageOptions = reactive({
    content,
    ...(buttons.length ? { components: buttonComponents } : {}),
    ...(opts.flags != null ? { flags: opts.flags } : {}),
    ...(opts.files != null ? { files: opts.files } : {}),
  }) as MessageCreateOptions

  let active = true
  let pending = false
  let editing = false
  const snapshot = computed(() => deepToRaw(messageOptions))
  const stop = watch(snapshot, () => {
    pending = true
    void flushEdits()
  })

  function dispose() {
    active = false
    pending = false
    stop()
    for (const collector of collectors)
      collector.stop()
  }
  if (getCurrentScope())
    onScopeDispose(dispose)

  const messagePromise = config.send(snapshot.value).then((msg) => {
    if (active)
      collectors = registerButtonCollectors(msg, buttons)
    return msg
  }).catch((error) => {
    dispose()
    throw error
  })

  async function flushEdits() {
    if (editing || !active)
      return
    editing = true
    try {
      // The caller receives an initial send failure via messagePromise.
      const msg = await messagePromise.catch(() => null)
      while (pending) {
        if (!active || !msg)
          return
        pending = false
        try {
          await config.edit(msg, snapshot.value)
        }
        catch (error) {
          logger.error(error)
        }
      }
    }
    finally {
      editing = false
    }
  }

  return messagePromise
}
