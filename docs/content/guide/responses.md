---
title: Responses
---

# Responses

Commands can return different types to control how Discord displays the response.

> Need to send a non-interaction message to a channel (no 15-minute lifetime, no ephemeral, persistent)? See [useTextChannel](./use-text-channel).

## String

The simplest response — a public message:

```ts
export default () => 'Hello, world!'
```

## Ephemeral

Only visible to the user who ran the command:

```ts
export default () => reply.ephemeral('Only you can see this')
```

### Asynchronous commands

Fast async commands send their result directly. With the default settings, a command still working about 1.8 seconds after the interaction began gets a private acknowledgement. A private result edits that response. A public result is sent as a public follow-up and the temporary acknowledgement is removed. Later reactive edits target the message containing the result.

A command can declare its policy before it starts. This example makes the initial result private, including when the lookup finishes immediately. The private policy also applies to direct calls to `interaction.reply()` and `interaction.deferReply()`.

```ts
export default async () => {
  describeCommand({ defer: 'private' })
  return await lookupStatus()
}
```

Use `defer: 'public'` for a command with a public loading indicator. An explicit `reply.ephemeral(...)` still delivers its content privately. Use `defer: 'manual'` if the command manages its own acknowledgement or needs to open a modal as its first response. Discord requires that first response within three seconds. The client option `deferOnPromise: false` disables the automatic deadline for commands without an explicit policy.

## Files

Attach files to the response:

```ts
export default () => reply.file('hello.txt').send('Here is your file')

// Multiple files
export default () => reply.files(['a.txt', 'b.txt']).send('Two files')
```

## Reactive

Return a Vue `ref` — the message auto-edits when the value changes:

```ts
import { ref } from 'vue'

export default () => {
  const msg = ref('Loading...')
  setTimeout(() => {
    msg.value = 'Done!'
  }, 2000)
  return msg
}
```

Discord edits are sent in order. Several changes while an edit is in flight can be combined into one update with the latest values. The watcher and button collectors stop when the interaction scope closes.

## Generator

Yield multiple messages — the first is a reply, subsequent ones are follow-ups:

```ts
export default function* () {
  yield 'Processing...'
  yield 'Step 1 complete'
  yield 'All done!'
}
```

Async generators work too:

```ts
export default async function* () {
  yield 'Starting...'
  await someAsyncWork()
  yield 'Finished!'
}
```

## Buttons

Create interactive button responses with reactive state:

```ts
import { computed, ref } from 'vue'

export default () => {
  const count = ref(0)
  const message = computed(() => `Count: ${count.value}`)

  return reply
    .button('+1', () => {
      count.value++
    })
    .button('-1', () => {
      count.value--
    })
    .send(message)
}
```

Button options:

```ts
reply.button(label, handler, {
  style: ButtonStyle.Primary,
  defer: true,
  hide: computed(() => someCondition),
  customId: 'my-button',
})
```

## Custom Handler

Return a function for full control over the interaction:

```ts
import { MessageFlags } from 'discord.js'

export default () => {
  return function (interaction, client) {
    interaction.reply({
      content: 'Custom response',
      flags: MessageFlags.Ephemeral,
    })
  }
}
```

## Chaining

The `reply` API supports chaining:

```ts
export default () => {
  return reply
    .ephemeral
    .file('log.txt')
    .button('Refresh', () => { /* ... */ })
    .send('Here are the logs')
}
```

## Modal

Open a modal form and handle the submission:

```ts
export default () => {
  return reply.modal('Submit Feedback', {
    subject: { style: 'short', placeholder: 'What is this about?' },
    details: { style: 'paragraph', placeholder: 'Tell us more...', required: false },
    rating: { style: 'short', placeholder: '1-5', maxLength: 1 },
  }, (values) => {
    return reply.ephemeral(`Subject: ${values.subject}\nRating: ${values.rating}`)
  })
}
```

Each field can be a shorthand string (`'short'` or `'paragraph'`) or an options object with `style`, `label`, `placeholder`, `required`, `value`, `minLength`, and `maxLength`. The timeout defaults to 5 minutes.

Each open modal accepts one submission from the person who opened it. Its collector stops on submission, timeout, or application shutdown. A slow submission gets a private acknowledgement while its callback runs. A callback that returns nothing from a slash-command modal receives a private “Submitted.” confirmation.
