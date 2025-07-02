import type { BaseMessageOptions, InteractionEditReplyOptions, InteractionReplyOptions } from 'discord.js'
import type { SlashCommandCustomReturnHandler } from '../../../types'
import { MessageFlags } from 'discord.js'

type OmitPreservingCallSignature<T, K extends keyof T = keyof T>
  = Omit<T, K> & (T extends (...args: infer R) => infer S ? (...args: R) => S : unknown)

type File = NonNullable<BaseMessageOptions['files']>[number]

type ReplyFunction = SlashCommandCustomReturnHandler & {
  (text?: string, options?: InteractionReplyOptions): SlashCommandCustomReturnHandler
  edit: EditReplyFunction
  ephemeral: OmitPreservingCallSignature<ReplyFunction, 'edit' | 'ephemeral'>
  flags: (flags: InteractionReplyOptions['flags']) => OmitPreservingCallSignature<ReplyFunction, 'edit'>
  file: (file: File) => OmitPreservingCallSignature<ReplyFunction, 'edit'>
  files: (files: File[]) => OmitPreservingCallSignature<ReplyFunction, 'edit'>
  send: ReplyFunction
}

type EditReplyFunction = SlashCommandCustomReturnHandler & {
  (text?: string, options?: InteractionEditReplyOptions): SlashCommandCustomReturnHandler
  flags: (flags: InteractionEditReplyOptions['flags']) => EditReplyFunction
  file: (file: File) => EditReplyFunction
  files: (files: File[]) => EditReplyFunction
  send: EditReplyFunction
}

function createReplyFunction(
  { editReply, ...defaultOptions }: (
    | InteractionReplyOptions
    | InteractionEditReplyOptions
  ) & { editReply?: boolean } = {},
): ReplyFunction {
  const reply = ((...args) => {
    if (typeof args[0] === 'string' || typeof args[0] === 'undefined') {
      const [text, options] = args
      return async (interaction) => {
        if (editReply || interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: text,
            ...(defaultOptions as InteractionEditReplyOptions),
            ...(options as InteractionEditReplyOptions),
          })
        }
        else {
          await interaction.reply({
            content: text,
            ...(defaultOptions as InteractionReplyOptions),
            ...(options as InteractionReplyOptions),
          })
        }
      }
    }
    else {
      const interaction = args[0]
      if (editReply || interaction.deferred || interaction.replied) {
        return interaction.editReply({
          ...(defaultOptions as InteractionEditReplyOptions),
        }).then(() => undefined)
      }
      else {
        return interaction.reply({
          ...(defaultOptions as InteractionReplyOptions),
        }).then(() => undefined)
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
    edit: {
      get() {
        return createReplyFunction({
          ...defaultOptions,
          editReply: true,
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
