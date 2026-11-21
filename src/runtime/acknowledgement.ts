import type { CommandInteraction, InteractionDeferReplyOptions, InteractionEditReplyOptions, InteractionReplyOptions, MessageCreateOptions, MessageFlagsResolvable } from 'discord.js'
import type { MessageSenderConfig, SentMessage } from './server/utils/messageSender'
import { MessageFlags, MessageFlagsBitField, MessagePayload } from 'discord.js'
import { logger } from './logger'

export type DeferPolicy = 'public' | 'private' | 'manual'
interface AutomaticDefer {
  policy?: DeferPolicy
  pending: Promise<unknown>
}
const privateByDefault = new WeakSet<CommandInteraction>()
const automatic = new WeakMap<CommandInteraction, AutomaticDefer>()

// The gateway requires acknowledgement within three seconds. Leave headroom
// for the HTTP request while letting fast handlers choose their own response.
export function scheduleAcknowledgement(interaction: CommandInteraction, policy?: DeferPolicy, allowTimer = true) {
  if (policy === 'manual')
    return () => {}
  if (policy === 'private')
    privateByDefault.add(interaction)
  const elapsed = Date.now() - (interaction.createdTimestamp ?? Date.now())
  const originalDefer = interaction.deferReply
  const restoreMethods: Array<() => void> = []
  const timer = allowTimer
    ? setTimeout(() => {
        if (interaction.replied || interaction.deferred)
          return
        const pending = originalDefer.call(interaction, policy === 'public' ? {} : { flags: MessageFlags.Ephemeral })
        automatic.set(interaction, { policy, pending })
        void pending.catch(error => logger.error('Could not defer interaction:', error))
      }, Math.max(0, 1800 - elapsed))
    : undefined
  timer?.unref()
  const cancel = () => {
    clearTimeout(timer)
    for (const restore of restoreMethods.splice(0))
      restore()
  }

  // discord.js marks an interaction acknowledged only after its HTTP call
  // returns. Cancel before a direct reply/defer/modal starts, even on slow HTTP.
  for (const method of ['reply', 'deferReply', 'showModal'] as const) {
    const original = interaction[method]
    if (typeof original !== 'function')
      continue
    const descriptor = Object.getOwnPropertyDescriptor(interaction, method)
    Object.defineProperty(interaction, method, {
      configurable: true,
      writable: true,
      value(this: CommandInteraction, ...args: unknown[]) {
        cancel()
        const ack = automatic.get(this)
        if (method === 'reply' && (ack || policy === 'private')) {
          const payload = args[0] as string | MessagePayload | InteractionReplyOptions
          const options = typeof payload === 'string' ? { content: payload } : payload instanceof MessagePayload ? payload.options : payload
          const opts = options as InteractionReplyOptions
          if (ack)
            return interactionSender(this).send(opts)
          return Reflect.apply(original, this, [withPrivateFlag(opts)])
        }
        if (method === 'deferReply') {
          const opts = (args[0] ?? {}) as InteractionDeferReplyOptions
          if (ack) {
            if (ack.policy === 'public' && isPrivate(opts))
              throw new Error('This interaction was already deferred publicly. Declare defer: \'private\' or \'manual\' before running this command.')
            if (opts.withResponse)
              throw new Error('To receive the original acknowledgement callback, declare defer: \'manual\'.')
            return opts.fetchReply ? ack.pending.then(() => this.fetchReply()) : ack.pending
          }
          if (policy === 'private')
            return Reflect.apply(original, this, [{ ...opts, flags: MessageFlags.Ephemeral }])
        }
        if (method === 'showModal' && ack)
          throw new Error('Discord requires a modal to be the first response. For a slow modal command, declare defer: \'manual\' and acknowledge within three seconds.')
        return Reflect.apply(original, this, args)
      },
    })
    restoreMethods.push(() => {
      if (descriptor)
        Object.defineProperty(interaction, method, descriptor)
      else
        Reflect.deleteProperty(interaction, method)
    })
  }
  return cancel
}

function isPrivate(opts: InteractionReplyOptions | InteractionDeferReplyOptions) {
  return opts.ephemeral || new MessageFlagsBitField(opts.flags as MessageFlagsResolvable).has(MessageFlags.Ephemeral)
}

function withPrivateFlag(opts: InteractionReplyOptions) {
  const flags = new MessageFlagsBitField(opts.flags as MessageFlagsResolvable).add(MessageFlags.Ephemeral)
  return { ...opts, flags: flags.bitfield as InteractionReplyOptions['flags'] }
}

export function interactionSender(interaction: CommandInteraction): Omit<MessageSenderConfig, 'send'> & { send: (opts: InteractionReplyOptions | MessageCreateOptions) => Promise<SentMessage> } {
  let method: 'followUp' | 'editReply' | 'reply'
  return {
    async send(options) {
      let opts = options as InteractionReplyOptions
      if (!interaction.replied && privateByDefault.has(interaction) && !isPrivate(opts))
        opts = withPrivateFlag(opts)
      const ack = automatic.get(interaction)
      if (ack)
        await ack.pending
      method = interaction.replied ? 'followUp' : interaction.deferred ? 'editReply' : 'reply'
      if (method === 'editReply') {
        const explicitlyPrivate = isPrivate(opts)
        const originalPrivate = ack ? ack.policy !== 'public' : interaction.ephemeral
        // Discord locks visibility on the first acknowledgement. Never put a
        // private payload into a public original, even after a manual deferral.
        if ((explicitlyPrivate && originalPrivate === false)
          || (ack && explicitlyPrivate !== originalPrivate)) {
          await interaction.editReply({ content: 'Preparing reply…' })
          method = 'followUp'
          const message = await interaction.followUp(opts)
          await interaction.deleteReply().catch(error => logger.error('Could not remove acknowledgement:', error))
          return message
        }
        return interaction.editReply(opts as InteractionEditReplyOptions)
      }
      return interaction[method](opts) as Promise<SentMessage>
    },
    edit(msg, options: MessageCreateOptions) {
      const opts = options as InteractionEditReplyOptions
      if (method === 'editReply' || 'resource' in msg)
        return interaction.editReply(opts)
      if (method === 'followUp' && 'id' in msg && interaction.webhook)
        return interaction.webhook.editMessage(msg.id, opts)
      return msg.edit(opts)
    },
  }
}
