---
title: Responses
---

# Responses

Commands can return different types to control how Discord displays the response.

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
export default () => {
  return function (interaction, client) {
    interaction.reply({
      content: 'Custom response',
      ephemeral: true,
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
