import type { InteractionReplyOptions } from 'discord.js'
import type { SlashCommandCustomReturnHandler } from '~/src/types'
import { MessageFlags } from 'discord.js'

interface ReplyFunction {
  (text: string, options?: InteractionReplyOptions): SlashCommandCustomReturnHandler
  ephemeral: this
  flags: (flags: InteractionReplyOptions['flags']) => this
}

function createReplyFunction(defaultOptions: Partial<InteractionReplyOptions> = {}): ReplyFunction {
  const reply = (text: string, options?: InteractionReplyOptions): SlashCommandCustomReturnHandler => (interaction) => {
    interaction.reply({
      content: text,
      ...defaultOptions,
      ...options,
    })
  }

  return new Proxy(reply, {
    get(target, prop, receiver) {
      if (prop === 'ephemeral') {
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
      }
      else if (prop === 'flags') {
        return (flags: InteractionReplyOptions['flags']) => createReplyFunction({
          ...defaultOptions,
          flags,
        })
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as ReplyFunction
}

export const reply: ReplyFunction = createReplyFunction()
