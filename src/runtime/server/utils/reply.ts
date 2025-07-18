import type {
  BaseMessageOptions,
  ButtonComponentData,
  ButtonInteraction,
  CommandInteraction,
  InteractionCallbackResponse,
  InteractionCollector,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageCollectorOptionsParams,
} from 'discord.js'
import type { MaybeRef } from 'vue'
import type { SlashCommandCustomReturnHandler } from '../../../types'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js'
import { computed, isRef, reactive, toValue, watch } from 'vue'

type OmitPreservingCallSignature<T, K extends keyof T = keyof T>
  = Omit<T, K> & (T extends (...args: infer R) => infer S ? (...args: R) => S : unknown)
type File = NonNullable<BaseMessageOptions['files']>[number]
type ButtonCollectorOptions = Partial<Omit<MessageCollectorOptionsParams<ComponentType.Button>, 'componentType'>>
type MaybeRefObject<T> = T extends any
  ? { [K in keyof T]: MaybeRef<T[K]> }
  : never
type DistributiveOmit<T, K extends keyof T> = T extends any
  ? Omit<T, K>
  : never

type ReplyFunction = SlashCommandCustomReturnHandler & {
  (text?: MaybeRef<string>, options?: InteractionReplyOptions):
    SlashCommandCustomReturnHandler & {
      [Symbol.iterator]: () => {
        next: (...args: ReadonlyArray<any>) => IteratorResult<
          ReplyFunction,
          Message | InteractionResponse | InteractionCallbackResponse
        >
      }
    }

  [Symbol.iterator]: () => {
    next: (...args: ReadonlyArray<any>) => IteratorResult<
      never,
      Promise<Message | InteractionResponse | InteractionCallbackResponse>
    >
  }

  ephemeral: OmitPreservingCallSignature<ReplyFunction, 'ephemeral'>
  flags: (flags: MaybeRef<InteractionReplyOptions['flags']>) => ReplyFunction
  file: (file: MaybeRef<File>) => ReplyFunction
  files: (files: MaybeRef<File[]>) => ReplyFunction
  button: {
    (
      label: MaybeRef<string>,
      handler: (interaction: ButtonInteraction) => void | Promise<void>,
      options?:
        & Partial<MaybeRefObject<DistributiveOmit<ButtonComponentData, 'label' | 'type'>>>
        & {
          defer?: boolean
          hide?: MaybeRef<boolean>
          collector?: ButtonCollectorOptions
        },
    ): ReplyFunction
    // TODO: support reply.button.link/primary like interface
  }
  send: ReplyFunction
}

function createReplyFunction(
  {
    buttons,
    ...defaultOptions
  }: (InteractionReplyOptions & {
    buttons?: Parameters<ReplyFunction['button']>[]
  }) = {},
): ReplyFunction {
  type Msg = Message | InteractionCallbackResponse | InteractionResponse

  const reply = ((...args) => {
    const buttonComponents = computed(() => getButtonComponent(buttons ?? []))
    let buttonInteractionCollectors: InteractionCollector<ButtonInteraction>[] = []
    function registerButtonCollectors(msg: Msg) {
      for (const collector of buttonInteractionCollectors) {
        collector.stop()
      }
      buttonInteractionCollectors = []

      for (const [_, handler, options] of buttons ?? []) {
        let collectorOptions: ButtonCollectorOptions | undefined
        if (options && 'collector' in options && options.collector) {
          collectorOptions = options.collector
        }
        if ('resource' in msg) {
          buttonInteractionCollectors.push(msg.resource!.message!.createMessageComponentCollector({
            componentType: ComponentType.Button,
            ...collectorOptions,
          }))
        }
        else {
          buttonInteractionCollectors.push(msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            ...collectorOptions,
          }))
        }
        buttonInteractionCollectors[buttonInteractionCollectors.length - 1]
          .on('collect', async (buttonInteraction) => {
            if (options?.defer ?? true)
              buttonInteraction.deferUpdate()
            await handler(buttonInteraction)
          })
      }
    }

    if (typeof args[0] === 'string' || typeof args[0] === 'undefined' || isRef(args[0])) {
      const [text, options] = args
      let message: Promise<Msg>

      const replyOptions = reactive({
        content: text,
        ...buttonComponents.value.length > 0 ? { components: buttonComponents } : {},
        ...defaultOptions,
        ...options,
      }) as InteractionReplyOptions

      const handler = (interaction: CommandInteraction) => {
        const method = interaction.replied
          ? 'followUp'
          : interaction.deferred ? 'editReply' : 'reply'
        message = interaction[method](
          replyOptions as InteractionReplyOptions & InteractionEditReplyOptions,
        )
          .then((msg: Msg) => {
            registerButtonCollectors(msg)
            return msg
          })
          .catch(err => err)
        return message
      }

      Object.defineProperty(handler, Symbol.iterator, {
        value: () => ({
          next: () => (
            message !== undefined
              ? {
                  done: true,
                  value: message,
                }
              : {
                  done: false,
                  value: handler,
                }
          ),
        }),
      })

      watch(replyOptions, async (options) => {
        const msg = await message
        if ('edit' in msg)
          msg.edit(options as InteractionEditReplyOptions)
        else
          msg.resource?.message?.edit(options as InteractionEditReplyOptions)
        registerButtonCollectors(msg)
      }, { deep: true, flush: 'sync' })

      return handler
    }
    else {
      const interaction = args[0]
      const method = interaction.replied
        ? 'followUp'
        : interaction.deferred ? 'editReply' : 'reply'
      const options = reactive(defaultOptions) as InteractionReplyOptions
      const messagePromise = interaction[method](options as InteractionReplyOptions & InteractionEditReplyOptions)
        .catch(err => err)

      watch(options, async (opts) => {
        const message = await messagePromise
        if (!message)
          return
        if ('edit' in message)
          message.edit(opts as InteractionEditReplyOptions)
        else
          message.resource?.message?.edit(opts as InteractionEditReplyOptions)
        registerButtonCollectors(message)
      }, { deep: true, flush: 'sync' })

      return {
        [Symbol.iterator]: () => ({
          next: () => (
            {
              done: true,
              value: messagePromise,
            }
          ),
        }),
      }
    }
  }) as ReplyFunction

  Object.defineProperties(reply, {
    ephemeral: {
      get() {
        return createReplyFunction({
          ...defaultOptions,
          flags: defaultOptions.flags == null
            ? MessageFlags.Ephemeral
            : typeof defaultOptions.flags === 'string'
              ? [defaultOptions.flags, 'Ephemeral']
              : Array.isArray(defaultOptions.flags)
                ? [...defaultOptions.flags, 'Ephemeral']
                : typeof defaultOptions.flags === 'number' || typeof defaultOptions.flags === 'bigint'
                  ? defaultOptions.flags | MessageFlags.Ephemeral
                  // I give up refining this type...
                  : MessageFlags.Ephemeral,
        })
      },
    },
    flags: {
      value: (flags: InteractionReplyOptions['flags'] & InteractionEditReplyOptions['flags']) => createReplyFunction({
        ...defaultOptions,
        flags,
      }),
    },
    file: {
      value: (file: File) => createReplyFunction({
        ...defaultOptions,
        files: defaultOptions.files != null ? [...defaultOptions.files, file] : [file],
      }),
    },
    files: {
      value: (files: File[]) => createReplyFunction({
        ...defaultOptions,
        files: defaultOptions.files != null ? [...defaultOptions.files, ...files] : files,
      }),
    },
    send: {
      value: reply,
    },
    button: {
      value: (...args: Parameters<ReplyFunction['button']>) => {
        return createReplyFunction({
          ...defaultOptions,
          buttons: [
            ...(buttons ?? []),
            args,
          ],
        })
      },
    },
  })

  return reply
}

export const reply: ReplyFunction = createReplyFunction()

function getButtonComponent(buttons: Parameters<ReplyFunction['button']>[]): NonNullable<BaseMessageOptions['components']> {
  if (buttons.length === 0)
    return []

  let row = new ActionRowBuilder<ButtonBuilder>()
  const rows = [row]

  const it = Iterator.from(buttons)
    .filter(([, , options]) => !(toValue(options?.hide) ?? false))
    .map(([label, , options]) => {
      if (options == null) {
        options = {} as NonNullable<typeof options>
      }

      if (toValue(options.style) == null) {
        options.style = ButtonStyle.Primary
      }
      if (options.style === ButtonStyle.Primary) {
        if (!('customId' in options) || options.customId == null) {
          (options as any).customId = `${Date.now()}`
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
    row.addComponents(...Array.from(it.take(5)))

    if (row.components.length >= 5) {
      row = new ActionRowBuilder()
      rows.push(row)
    }
  }

  if (row.components.length === 0)
    rows.pop()

  return rows
}
