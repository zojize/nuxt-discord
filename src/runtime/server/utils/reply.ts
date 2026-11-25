import type {
  BaseMessageOptions,
  ButtonComponentData,
  ButtonInteraction,
  CommandInteraction,
  ComponentType,
  InteractionCallbackResponse,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageCollectorOptionsParams,
  MessageCreateOptions,
  MessageFlagsResolvable,
  ModalSubmitInteraction,
} from 'discord.js'
import type { MaybeRef } from 'vue'
import type { SlashCommandCustomReturnHandler } from '../../../types'
import { randomUUID } from 'node:crypto'
import { ActionRowBuilder, InteractionCollector, InteractionType, MessageFlags, MessageFlagsBitField, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'
import { computed, isRef, toValue } from 'vue'
import { interactionSender, scheduleAcknowledgement, wasAutomaticallyDeferred } from '../../acknowledgement'
import { onInvocationDispose } from '../../discordInvocation'
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
  defaultOptions: (Omit<InteractionReplyOptions, 'files' | 'flags'> & {
    flags?: MaybeRef<InteractionReplyOptions['flags']>
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
          flags: computed(() => {
            const flags = new MessageFlagsBitField(toValue(defaultOptions.flags) as MessageFlagsResolvable)
            return flags.add(MessageFlags.Ephemeral).bitfield as InteractionReplyOptions['flags']
          }),
        })
      },
    },
    flags: {
      value: (flags: MaybeRef<InteractionReplyOptions['flags']>) => createReplyFunction({
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

  return async function (interaction) {
    const customId = randomUUID()
    let active = true
    let collector: InteractionCollector<ModalSubmitInteraction> | undefined
    let cancelAcknowledgement: (() => void) | undefined
    onInvocationDispose(() => {
      active = false
      collector?.stop('disposed')
      cancelAcknowledgement?.()
    })
    await interaction.showModal(new ModalBuilder({
      custom_id: customId,
      title,
      components: rows.map(row => row.toJSON()),
    }))
    if (!active)
      return

    collector = new InteractionCollector(interaction.client, {
      interactionType: InteractionType.ModalSubmit,
      max: 1,
      time: timeout,
      filter: submission => submission.customId === customId && submission.user.id === interaction.user.id,
    })
    const submission = await new Promise<ModalSubmitInteraction | undefined>((resolve) => {
      collector!.once('end', collected => resolve(collected.first()))
    })
    if (!submission || !active)
      return

    cancelAcknowledgement = scheduleAcknowledgement(submission)
    try {
      const values = Object.fromEntries(Object.keys(fields).map(key => [key, submission.fields.getTextInputValue(key)]))
      const result = await onSubmit(values, submission)
      if (!active)
        return
      if (typeof result === 'function') {
        await result.call(this, submission, this)
      }
      else if (typeof result === 'string' && !submission.replied) {
        await interactionSender(submission).send({ content: result })
      }
      else if (!submission.replied && (!submission.deferred || wasAutomaticallyDeferred(submission))) {
        if (!submission.deferred && submission.isFromMessage())
          await submission.deferUpdate()
        else
          await interactionSender(submission).send({ content: 'Submitted.', flags: MessageFlags.Ephemeral })
      }
    }
    catch (error) {
      if (active && !submission.replied)
        await interactionSender(submission).send({ content: 'An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {})
      throw error
    }
    finally {
      cancelAcknowledgement()
    }
  }
}
