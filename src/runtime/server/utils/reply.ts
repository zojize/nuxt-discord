import type { InteractionEditReplyOptions, InteractionReplyOptions } from 'discord.js'
import type { SlashCommandCustomReturnHandler } from '~/src/types'
import { MessageFlags } from 'discord.js'

type OmitPreservingCallSignature<T, K extends keyof T = keyof T>
  = Omit<T, K> & (T extends (...args: infer R) => infer S ? (...args: R) => S : unknown)
interface ReplyFunction {
  (text: string, options?: InteractionReplyOptions): SlashCommandCustomReturnHandler
  edit: EditReplyFunction
  ephemeral: OmitPreservingCallSignature<ReplyFunction, 'edit' | 'ephemeral'>
  flags: (flags: InteractionReplyOptions['flags']) => OmitPreservingCallSignature<ReplyFunction, 'edit'>
}

interface EditReplyFunction {
  (text: string, options?: InteractionEditReplyOptions): SlashCommandCustomReturnHandler
  flags: (flags: InteractionEditReplyOptions['flags']) => EditReplyFunction
}

function createReplyFunction(
  { editReply, ...defaultOptions }: (
    | InteractionReplyOptions
    | InteractionEditReplyOptions
  ) & { editReply?: boolean } = {},
): ReplyFunction {
  const reply = (text: string, options?: InteractionReplyOptions | InteractionEditReplyOptions): SlashCommandCustomReturnHandler => async (interaction) => {
    if (editReply) {
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
  })

  return reply as ReplyFunction
}

export const reply: ReplyFunction = createReplyFunction()
