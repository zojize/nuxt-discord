import type { BaseMessageOptions, CommandInteraction, InteractionCallbackResponse, InteractionEditReplyOptions, InteractionReplyOptions, InteractionResponse, Message } from 'discord.js'
import type { MaybeRef } from 'vue'
import type { SlashCommandCustomReturnHandler } from '../../../types'
import { MessageFlags } from 'discord.js'
import { isRef, reactive, watch } from 'vue'

type OmitPreservingCallSignature<T, K extends keyof T = keyof T>
  = Omit<T, K> & (T extends (...args: infer R) => infer S ? (...args: R) => S : unknown)

type File = NonNullable<BaseMessageOptions['files']>[number]

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
  send: ReplyFunction
}

function createReplyFunction(
  { ...defaultOptions }: (InteractionReplyOptions) = {},
): ReplyFunction {
  type Msg = Message | InteractionCallbackResponse | InteractionResponse

  const reply = ((...args) => {
    if (typeof args[0] === 'string' || typeof args[0] === 'undefined' || isRef(args[0]) || typeof args[0] === 'function') {
      const [text, options] = args
      let message: Promise<Msg>

      const replyOptions = reactive({
        content: text,
        ...defaultOptions,
        ...options,
      }) as InteractionReplyOptions

      const handler = (interaction: CommandInteraction) => {
        const method = interaction.replied
          ? 'followUp'
          : interaction.deferred ? 'editReply' : 'reply'
        message = interaction[method](
          replyOptions as InteractionReplyOptions & InteractionEditReplyOptions,
        ).catch(err => err)
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
      get() {
        return (flags: InteractionReplyOptions['flags'] & InteractionEditReplyOptions['flags']) => createReplyFunction({
          ...defaultOptions,
          flags,
        })
      },
    },
    file: {
      get() {
        return (file: File) => createReplyFunction({
          ...defaultOptions,
          files: defaultOptions.files != null ? [...defaultOptions.files, file] : [file],
        })
      },
    },
    files: {
      get() {
        return (files: File[]) => createReplyFunction({
          ...defaultOptions,
          files: defaultOptions.files != null ? [...defaultOptions.files, ...files] : files,
        })
      },
    },
    send: {
      value: reply,
    },
  })

  return reply
}

export const reply: ReplyFunction = createReplyFunction()
