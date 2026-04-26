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

export interface SendOptions {
  flags?: MessageCreateOptions['flags']
  files?: MaybeRef<File>[]
  buttons?: ButtonHandlerArgs[]

  components?: any
}

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

function registerButtonCollectors(
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

/**
 * Sends a message and watches the reactive options for changes, editing on update.
 * Returns the message promise. Sets up button collectors automatically.
 */
export function sendReactiveMessage(
  config: MessageSenderConfig,
  content: MaybeRef<string> | undefined,
  opts: SendOptions = {},
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
