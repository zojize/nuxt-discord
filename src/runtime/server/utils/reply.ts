import type {
  BaseMessageOptions,
  ButtonComponentData,
  ButtonInteraction,
  CommandInteraction,
  ComponentType,
  InteractionCallbackResponse,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageCollectorOptionsParams,
  MessageCreateOptions,
  ModalSubmitInteraction,
} from 'discord.js'
import type { MaybeRef } from 'vue'
import type { SlashCommandCustomReturnHandler } from '../../../types'
import { ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'
import { computed, isRef, toValue } from 'vue'
import { interactionSender } from '../../acknowledgement'
import { logger } from '../../logger'
import { sendReactiveMessage } from './messageSender'

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
  modal: (
    title: string,
    fields: Record<string, ModalFieldOptions | 'short' | 'paragraph'>,
    onSubmit: (values: Record<string, string>, interaction: ModalSubmitInteraction) => unknown,
    options?: { timeout?: number },
  ) => SlashCommandCustomReturnHandler
}

export interface ModalFieldOptions {
  style?: 'short' | 'paragraph'
  label?: string
  placeholder?: string
  required?: boolean
  value?: string
  minLength?: number
  maxLength?: number
}

function createReplyFunction(
  defaultOptions: (Omit<InteractionReplyOptions, 'files'> & {
    files?: MaybeRef<MaybeRef<File>[]>
    buttons?: Parameters<ReplyFunction['button']>[]
  }) = {},
): ReplyFunction {
  type Msg = Message | InteractionCallbackResponse | InteractionResponse

  const reply = ((...args) => {
    const { buttons, ...restOptions } = defaultOptions

    if (typeof args[0] === 'string' || typeof args[0] === 'undefined' || isRef(args[0])) {
      const [text, options] = args
      let message: Promise<Msg> | undefined

      const handler = (interaction: CommandInteraction) => {
        message = sendReactiveMessage(
          interactionSender(interaction),
          text,
          {
            buttons: buttons ?? [],
            flags: restOptions.flags as MessageCreateOptions['flags'],
            files: restOptions.files,
            ...(options ?? {}),
          } as Parameters<typeof sendReactiveMessage>[2],
        ) as Promise<Msg>
        return message
      }

      Object.defineProperty(handler, Symbol.iterator, {
        value: () => ({
          next: () => (
            message !== undefined
              ? { done: true, value: message }
              : { done: false, value: handler }
          ),
        }),
      })

      return handler
    }
    else {
      const interaction = args[0] as CommandInteraction
      const messagePromise = sendReactiveMessage(
        interactionSender(interaction),
        undefined,
        {
          buttons: buttons ?? [],
          flags: restOptions.flags as MessageCreateOptions['flags'],
          files: restOptions.files,
        } as Parameters<typeof sendReactiveMessage>[2],
      ) as Promise<Msg>

      return {
        [Symbol.iterator]: () => ({
          next: () => ({ done: true, value: messagePromise }),
        }),
      }
    }
  }) as ReplyFunction

  function withFiles(files: MaybeRef<MaybeRef<File>[]>) {
    const previous = defaultOptions.files
    return createReplyFunction({
      ...defaultOptions,
      files: previous ? computed(() => [...toValue(previous), ...toValue(files)]) : files,
    })
  }

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
    file: { value: (file: MaybeRef<File>) => withFiles([file]) },
    files: { value: withFiles },
    send: {
      value: reply,
    },
    button: {
      value: (...args: Parameters<ReplyFunction['button']>) => {
        return createReplyFunction({
          ...defaultOptions,
          buttons: [
            ...defaultOptions.buttons ?? [],
            args,
          ],
        })
      },
    },
    modal: {
      value: createModalHandler,
    },
  })

  return reply
}

export const reply: ReplyFunction = createReplyFunction()

function createModalHandler(
  title: string,
  fields: Record<string, ModalFieldOptions | 'short' | 'paragraph'>,
  onSubmit: (values: Record<string, string>, interaction: ModalSubmitInteraction) => unknown,
  options?: { timeout?: number },
): SlashCommandCustomReturnHandler {
  const customId = `modal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const timeout = options?.timeout ?? 300_000 // 5 minutes default

  const rows = Object.entries(fields).map(([key, field]) => {
    const opts: ModalFieldOptions = typeof field === 'string' ? { style: field } : field
    const input = new TextInputBuilder({
      custom_id: key,
      label: opts.label ?? key.charAt(0).toUpperCase() + key.slice(1),
      style: opts.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short,
      required: opts.required ?? true,
      placeholder: opts.placeholder,
      value: opts.value,
      min_length: opts.minLength,
      max_length: opts.maxLength,
    })

    return new ActionRowBuilder<TextInputBuilder>({ components: [input] })
  })

  const modal = new ModalBuilder({
    custom_id: customId,
    title,
    components: rows.map(r => r.toJSON()),
  })

  return async function (interaction) {
    await interaction.showModal(modal)

    try {
      const submission = await interaction.awaitModalSubmit({
        filter: i => i.customId === customId,
        time: timeout,
      })

      const values: Record<string, string> = {}
      for (const key of Object.keys(fields)) {
        values[key] = submission.fields.getTextInputValue(key)
      }

      const result = await onSubmit(values, submission)

      // Handle the callback return — string or reply handler
      if (typeof result === 'function') {
        await (result as any)(submission, this)
      }
      else if (typeof result === 'string') {
        if (!submission.replied && !submission.deferred) {
          await submission.reply({ content: result })
        }
      }
      else if (!submission.replied && !submission.deferred) {
        await submission.deferUpdate().catch(() => {})
      }
    }
    catch (error) {
      // Timeout or other error — user didn't submit
      logger.error('Modal submission error:', error)
    }
  }
}
