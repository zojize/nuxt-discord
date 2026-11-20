<script lang="ts" setup>
import type { PickerItem } from './CommandPicker.vue'
import type { ChatEntry } from './CommandTranscript.vue'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import ChatAvatar from './ChatAvatar.vue'
import CommandPicker from './CommandPicker.vue'
import CommandTranscript from './CommandTranscript.vue'

interface Option {
  name: string
  description: string
  required: boolean
  type: number
  choices?: { name: string, value: string | number }[]
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  hasAutocomplete?: boolean
}
interface Command {
  name: string
  description: string
  options: Option[]
  subcommands?: Command[]
}
interface TestResult {
  ephemeral?: boolean
  ok: boolean
  response?: string
  responses?: string[]
  error?: string
}
interface TestRequest {
  name: string
  options: Record<string, string>
}
const props = defineProps<{
  commands: Command[]
  channel?: boolean
  search?: string
  pinned?: boolean
  suggest?: (command: string, option: string, value: string) => NonNullable<Option['choices']>
  execute?: (body: TestRequest) => TestResult | Promise<TestResult>
}>()
const id = useId()
const input = ref<HTMLInputElement>()
const query = ref('')
const open = ref(false)
const command = ref<Command>()
const values = ref<Record<string, string>>({})
const fields = new Map<string, HTMLInputElement>()
const runButton = ref<HTMLButtonElement>()
const addedOptions = ref<string[]>([])
const pickingOption = ref(false)
const focusIndex = ref(0)
const index = ref(0)
const entries = ref<ChatEntry[]>([])
let sequence = 0
const more = ref(false)
const emojis = ref(false)
const emojiChoices = ['😀', '😂', '❤️', '👍', '🎉', '👋', '✨', '🤖']

const remoteChoices = ref<Option['choices']>([])
const showChoices = ref(true)

function leaves(commands: Command[], prefix = ''): Command[] {
  return commands.flatMap((cmd) => {
    const name = prefix + cmd.name
    return cmd.subcommands?.length ? leaves(cmd.subcommands, `${name} `) : [{ ...cmd, name }]
  })
}
const commands = computed(() => leaves(props.commands))
const visibleOptions = computed(() => command.value?.options.filter(o => o.required || addedOptions.value.includes(o.name)) ?? [])
const remainingOptions = computed(() => command.value?.options.filter(o => !o.required && !addedOptions.value.includes(o.name)) ?? [])
const option = computed(() => visibleOptions.value[focusIndex.value])
const value = computed(() => values.value[option.value?.name ?? ''] ?? '')
const matches = computed<PickerItem[]>(() => commands.value.filter(cmd => cmd.name.includes(query.value.slice(1).toLowerCase())).map(cmd => ({
  name: `/${cmd.name}`,
  value: cmd.name,
  description: cmd.description,
  required: cmd.options.filter(o => o.required).map(o => o.name),
  optional: cmd.options.filter(o => !o.required).length,
})))
const choices = computed<PickerItem[]>(() => {
  const fixed = option.value?.choices ?? (option.value?.type === 5 ? [{ name: 'True', value: 'true' }, { name: 'False', value: 'false' }] : undefined)
  return (fixed?.filter(c => c.name.toLowerCase().includes(value.value.toLowerCase())) ?? remoteChoices.value ?? []).map(c => ({ name: c.name, value: String(c.value) }))
})
const picking = computed(() => command.value ? pickingOption.value || (showChoices.value && choices.value.length > 0) : open.value && query.value.startsWith('/'))
const items = computed<PickerItem[]>(() => pickingOption.value
  ? remainingOptions.value.map(o => ({ name: o.name, value: o.name, description: o.description }))
  : command.value ? choices.value : matches.value)
const activeId = computed(() => picking.value && items.value[index.value] ? `${id}-${index.value}` : undefined)

watch([command, option, value], ([cmd, opt, search], _, cleanup) => {
  remoteChoices.value = []
  index.value = 0
  if (!cmd || !opt?.hasAutocomplete || opt.choices?.length)
    return
  if (props.suggest) {
    remoteChoices.value = props.suggest(cmd.name, opt.name, search)
    return
  }
  const controller = new AbortController()
  const timer = setTimeout(async () => {
    try {
      const result = await $fetch<NonNullable<Option['choices']>>('/api/discord/slash-command/autocomplete', {
        method: 'POST',
        body: { command: cmd.name, option: opt.name, value: search },
        signal: controller.signal,
      })
      if (!controller.signal.aborted)
        remoteChoices.value = result
    }
    catch { /* The field remains editable when suggestions are unavailable. */ }
  }, 150)
  cleanup(() => {
    clearTimeout(timer)
    controller.abort()
  })
})
function insertEmoji(emoji: string) {
  emojis.value = false
  if (command.value && option.value) {
    values.value[option.value.name] = (values.value[option.value.name] ?? '') + emoji
    focusField(focusIndex.value)
  }
  else {
    query.value += emoji
    nextTick(() => input.value?.focus())
  }
}

function sendText() {
  if (!query.value.trim() || query.value.startsWith('/'))
    return
  entries.value.push({ id: ++sequence, at: new Date(), messages: [query.value], state: 'sent' })
  cancel()
}
function focusField(i: number) {
  nextTick(() => {
    const opt = visibleOptions.value[i]
    if (opt)
      fields.get(opt.name)?.focus()
    else runButton.value?.focus()
  })
}
function choose(item: PickerItem) {
  if (pickingOption.value) {
    addedOptions.value.push(item.value)
    pickingOption.value = false
    focusField(visibleOptions.value.findIndex(o => o.name === item.value))
    return
  }
  if (command.value && option.value) {
    values.value[option.value.name] = item.value
    showChoices.value = false
    focusField(focusIndex.value + 1)
    return
  }
  command.value = commands.value.find(c => c.name === item.value)
  query.value = ''
  values.value = {}
  addedOptions.value = []
  pickingOption.value = false
  focusIndex.value = 0
  open.value = false
  showChoices.value = true
  focusField(0)
}
function cancel() {
  command.value = undefined
  pickingOption.value = false
  query.value = ''
  open.value = false
  nextTick(() => input.value?.focus())
}
function browse() {
  more.value = false
  cancel()
  query.value = '/'
  index.value = 0
  open.value = true
}
async function send() {
  const cmd = command.value
  if (!cmd)
    return
  const missing = visibleOptions.value.findIndex(o => o.required && !values.value[o.name]?.trim())
  if (missing >= 0) {
    focusField(missing)
    fields.get(visibleOptions.value[missing]!.name)?.reportValidity()
    return
  }
  for (const [i, opt] of visibleOptions.value.entries()) {
    const field = fields.get(opt.name)
    const raw = values.value[opt.name]?.trim()
    if (!field || !raw)
      continue
    let error = ''
    if (opt.choices?.length && !opt.choices.some(choice => String(choice.value) === values.value[opt.name])) {
      error = 'Select one of the listed choices.'
    }
    else if (opt.type === 4 || opt.type === 10) {
      const n = Number(raw)
      if (!Number.isFinite(n) || (opt.type === 4 && !Number.isInteger(n)))
        error = opt.type === 4 ? 'Enter an integer.' : 'Enter a number.'
      else if (opt.min !== undefined && n < opt.min)
        error = `Enter a number greater than or equal to ${opt.min}.`
      else if (opt.max !== undefined && n > opt.max)
        error = `Enter a number less than or equal to ${opt.max}.`
    }
    field.setCustomValidity(error)
    if (!field.validity.valid) {
      focusField(i)
      field.reportValidity()
      return
    }
  }
  const body = { name: cmd.name, options: Object.fromEntries(Object.entries(values.value).filter(([,v]) => v !== '')) }
  const entry = reactive<ChatEntry>({ id: ++sequence, at: new Date(), invocation: body, state: 'pending', messages: [] })
  entries.value.push(entry)
  cancel()
  try {
    const result = props.execute
      ? await props.execute(body)
      : await $fetch<TestResult>('/api/discord/slash-command/test', { method: 'POST', body })
    if (!result.ok)
      throw new Error(result.error || 'The application did not respond')
    entry.messages = result.responses?.length ? result.responses : [result.response ?? 'Command completed without a reply.']
    entry.ephemeral = result.ephemeral
    entry.state = 'sent'
  }
  catch (error) {
    entry.messages = [error instanceof Error ? error.message : String(error)]
    entry.ephemeral = true
    entry.state = 'error'
  }
}
function keydown(e: KeyboardEvent) {
  if (e.isComposing)
    return
  if (!command.value && picking.value && e.key === ' ') {
    const exact = matches.value.find(item => item.name === query.value)
    if (!exact)
      return
    e.preventDefault()
    choose(exact)
  }
  else if (picking.value && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
    e.preventDefault()
    index.value = Math.max(0, Math.min(items.value.length - 1, index.value + (e.key === 'ArrowDown' ? 1 : -1)))
  }
  else if (picking.value && !e.shiftKey && (e.key === 'Enter' || e.key === 'Tab') && items.value[index.value]) {
    e.preventDefault()
    choose(items.value[index.value]!)
  }
  else if (e.key === 'Escape') {
    if (pickingOption.value)
      pickingOption.value = false
    else if (command.value && picking.value)
      showChoices.value = false
    else cancel()
  }
  else if (e.key === 'Enter' && command.value) {
    e.preventDefault()
    send()
  }
  else if (e.key === 'Enter' && !command.value) {
    e.preventDefault()
    sendText()
  }
  else if (e.key === 'Backspace' && command.value && !value.value) {
    e.preventDefault()
    if (focusIndex.value)
      focusField(focusIndex.value - 1)
    else cancel()
  }
}
function focusOption(i: number) {
  pickingOption.value = false
  focusIndex.value = i
  showChoices.value = true
  index.value = 0
}
function setField(name: string, el: unknown) {
  if (el instanceof HTMLInputElement)
    fields.set(name, el)
  else fields.delete(name)
}
</script>

<template>
  <section aria-label="Command tester" class="flex min-w-0 flex-col font-chat text-base leading-[1.375] text-chat-white scheme-dark [font-size-adjust:0.478]" :class="channel ? 'min-h-0 flex-1' : 'fixed inset-x-[max(12px,calc((100vw-72rem)/2+24px))] bottom-3 z-40'">
    <CommandTranscript :entries="entries" :channel="!!channel" :search="search" :pinned="pinned" interactive @dismiss="id => entries = entries.filter(entry => entry.id !== id)">
      <slot />
    </CommandTranscript>
    <div class="relative shrink-0" :class="channel ? 'mx-2 mt-2 mb-[max(.5rem,env(safe-area-inset-bottom))]' : ''">
      <CommandPicker v-if="picking" :id="id" :label="pickingOption ? 'Options' : option?.name ?? (query.length > 1 ? `Commands matching ${query}` : 'nuxt-discord')" :commands="!command" :searching="!command && query.length > 1" :index="index" :items="items" @choose="choose" @highlight="index = $event" />
      <div class="rounded-lg border border-white/[.065] bg-chat-field">
        <div v-if="command" class="flex min-h-9 items-center gap-2 rounded-t-lg border-b border-white/[.065] bg-[#28282d] px-4 text-sm text-chat-muted">
          <strong class="text-chat-white">{{ option?.name ?? `/${command.name}` }}</strong>{{ option?.description ?? command.description }}
          <button type="button" aria-label="Cancel command" class="ml-auto grid size-7 cursor-pointer place-items-center rounded-full hover:text-white" @click="cancel">
            <UIcon name="i-lucide-circle-x" class="size-4" />
          </button>
        </div>
        <div class="flex min-h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <UPopover v-if="!command" v-model:open="more" :content="{ side: 'top', align: 'start' }" :ui="{ content: 'rounded-lg bg-chat-panel p-1.5 text-chat-white font-chat ring-chat-line' }">
            <button type="button" aria-label="More message options" class="mr-1.5 grid size-7 shrink-0 cursor-pointer place-items-center text-chat-muted hover:text-white">
              <UIcon name="i-lucide-plus" class="size-6" />
            </button>
            <template #content>
              <button type="button" class="block w-full cursor-pointer rounded px-3 py-1 text-left hover:bg-chat-hover" @click="browse">
                Browse commands
              </button>
              <button v-if="entries.length" type="button" class="block w-full cursor-pointer rounded px-3 py-1 text-left hover:bg-chat-hover" @click="entries = []; more = false">
                Clear local history
              </button>
            </template>
          </UPopover>
          <ChatAvatar v-else class="mr-2 size-[1.375rem] sm:mr-3" />
          <input v-if="!command" ref="input" v-model="query" class="min-w-0 flex-1 bg-transparent py-3 outline-none placeholder:text-chat-faint" placeholder="Message #command-testing" aria-label="Message #command-testing" role="combobox" aria-autocomplete="list" :aria-controls="picking ? id : undefined" :aria-expanded="picking" :aria-activedescendant="activeId" autocomplete="off" @input="open = true; index = 0" @focus="open = true" @blur="open = false" @keydown="keydown">
          <div v-else class="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-2">
            <strong class="font-semibold">/{{ command.name }}</strong>
            <label v-for="(opt, i) in visibleOptions" :key="opt.name" class="inline-flex max-w-full items-stretch overflow-hidden rounded-sm border border-black/60 text-base leading-[1.375] focus-within:border-[#abbbd3]">
              <span class="bg-[#232329] px-2">{{ opt.name }}</span>
              <input :ref="el => setField(opt.name, el)" v-model="values[opt.name]" :required="opt.required" :minlength="opt.minLength" :maxlength="opt.maxLength" :aria-label="opt.name" role="combobox" aria-autocomplete="list" :aria-expanded="i === focusIndex && picking && !pickingOption" :aria-controls="picking && i === focusIndex ? id : undefined" :aria-activedescendant="i === focusIndex ? activeId : undefined" :style="{ width: `${Math.max(1, (values[opt.name]?.length ?? 0) + 1)}ch` }" class="box-content min-w-[.6rem] max-w-[45vw] bg-chat-hover px-1.5 outline-none" autocomplete="off" @focus="focusOption(i)" @input="showChoices = true; fields.get(opt.name)?.setCustomValidity('')" @keydown="keydown">
            </label>
            <button v-if="remainingOptions.length" type="button" aria-haspopup="listbox" :aria-expanded="pickingOption" :aria-controls="pickingOption ? id : undefined" class="cursor-pointer rounded px-1 text-sm text-chat-muted hover:bg-chat-hover" @focus="showChoices = false" @click="pickingOption = !pickingOption; index = 0" @keydown="pickingOption && keydown($event)">
              +{{ remainingOptions.length }} optional
            </button>
            <button ref="runButton" type="button" aria-label="Run command" class="grid size-11 shrink-0 cursor-pointer place-items-center rounded text-chat-muted hover:text-white sm:h-5 sm:w-px sm:rounded-none sm:px-0 sm:focus-visible:bg-chat-white sm:focus-visible:outline-none" @pointerdown.prevent @focus="focusIndex = -1; showChoices = false" @click="send" @keydown.esc="cancel">
              <UIcon name="i-lucide-send-horizontal" class="size-4 sm:hidden" />
            </button>
          </div>
          <div class="flex shrink-0 items-center gap-3 text-chat-muted sm:gap-4">
            <div v-if="!command" aria-hidden="true" class="hidden items-center gap-4 sm:flex" title="Discord media controls">
              <UIcon name="i-lucide-gift" class="size-5" /><span class="rounded-[3px] border-2 px-px text-[.625rem] leading-[1.1] font-extrabold">GIF</span><UIcon name="i-lucide-sticker" class="size-5" />
            </div>
            <UPopover v-if="!command || option" v-model:open="emojis" :content="{ side: 'top', align: 'end' }" :ui="{ content: 'grid grid-cols-4 gap-1 rounded-lg bg-chat-panel p-2 ring-chat-line' }">
              <button type="button" aria-label="Add emoji" class="grid size-6 cursor-pointer place-items-center hover:text-white">
                <UIcon name="i-lucide-smile" class="size-5" />
              </button>
              <template #content>
                <button v-for="emoji in emojiChoices" :key="emoji" type="button" class="size-9 cursor-pointer rounded text-xl hover:bg-chat-hover" @click="insertEmoji(emoji)">
                  {{ emoji }}
                </button>
              </template>
            </UPopover>
            <button v-if="!command" type="button" aria-label="Browse commands" class="grid size-6 cursor-pointer place-items-center hover:text-white" @click="browse">
              <UIcon name="i-lucide-shapes" class="size-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
