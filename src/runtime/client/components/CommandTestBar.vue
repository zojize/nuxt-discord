<script lang="ts" setup>
import type { PickerItem } from './CommandPicker.vue'
import { computed, nextTick, ref, useId, watch } from 'vue'
import CommandPicker from './CommandPicker.vue'

interface Option {
  name: string
  description: string
  required: boolean
  type: number
  choices?: { name: string, value: string | number }[]
  hasAutocomplete?: boolean
}
interface Command {
  name: string
  description: string
  options: Option[]
  subcommands?: Command[]
}
interface TestResult {
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
const optionalButton = ref<HTMLButtonElement>()
const addedOptions = ref<string[]>([])
const pickingOption = ref(false)
const focusIndex = ref(0)
const index = ref(0)
const pending = ref(false)
const responses = ref<{ name: string, text: string, ok: boolean }[]>([])
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
function focusField(i: number) {
  nextTick(() => {
    const opt = visibleOptions.value[i]
    if (opt)
      fields.get(opt.name)?.focus()
    else (optionalButton.value ?? runButton.value)?.focus()
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
  cancel()
  query.value = '/'
  index.value = 0
  open.value = true
}
async function send() {
  const cmd = command.value
  if (!cmd || pending.value)
    return
  const missing = visibleOptions.value.findIndex(o => o.required && !values.value[o.name]?.trim())
  if (missing >= 0) {
    focusField(missing)
    fields.get(visibleOptions.value[missing]!.name)?.reportValidity()
    return
  }
  pending.value = true
  try {
    const body = { name: cmd.name, options: Object.fromEntries(Object.entries(values.value).filter(([,v]) => v !== '')) }
    const result = props.execute
      ? await props.execute(body)
      : await $fetch<TestResult>('/api/discord/slash-command/test', { method: 'POST', body })
    responses.value.push({ name: cmd.name, ok: result.ok, text: result.responses?.join('\n') ?? result.response ?? result.error ?? 'Command executed' })
  }
  catch (error) { responses.value.push({ name: cmd.name, ok: false, text: String(error) }) }
  finally {
    pending.value = false
    cancel()
  }
}
function keydown(e: KeyboardEvent) {
  if (e.isComposing || pending.value)
    return
  if (picking.value && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
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
  <section aria-label="Command tester" class="dc-dock">
    <div v-if="responses.length" class="dc-history">
      <button type="button" class="dc-clear" @click="responses = []">
        Clear history
      </button>
      <div role="log" aria-label="Command responses">
        <article v-for="(r, i) in responses" :key="i" class="dc-message">
          <span class="dc-avatar" aria-hidden="true">/d</span><div><small>You used <b>/{{ r.name }}</b></small><div><strong>nuxt-discord</strong> <span class="dc-app">APP</span></div><p>{{ r.ok ? r.text : `Error: ${r.text}` }}</p></div>
        </article>
      </div>
    </div>
    <CommandPicker v-if="picking" :id="id" :label="pickingOption ? 'Options' : option?.name ?? 'nuxt-discord'" :commands="!command" :index="index" :items="items" @choose="choose" @highlight="index = $event" />
    <div v-if="command" class="dc-hint">
      <strong>{{ option?.name ?? `/${command.name}` }}</strong> {{ option?.description ?? command.description }}<button type="button" aria-label="Cancel command" :disabled="pending" @click="cancel">
        ×
      </button>
    </div>
    <div class="dc-composer">
      <button v-if="!command" type="button" class="dc-browse" aria-label="Browse commands" @click="browse">
        +
      </button>
      <span v-else class="dc-avatar" aria-hidden="true">/d</span>
      <input v-if="!command" ref="input" v-model="query" class="dc-input" placeholder="Message #command-testing" aria-label="Message #command-testing" role="combobox" aria-autocomplete="list" :aria-controls="picking ? id : undefined" :aria-expanded="picking" :aria-activedescendant="activeId" autocomplete="off" @input="open = true; index = 0" @focus="open = true" @blur="open = false" @keydown="keydown">
      <template v-else>
        <strong>/{{ command.name }}</strong>
        <label v-for="(opt, i) in visibleOptions" :key="opt.name" class="dc-chip">
          <span>{{ opt.name }}</span><input :ref="el => setField(opt.name, el)" v-model="values[opt.name]" :required="opt.required" :disabled="pending" :aria-label="opt.name" role="combobox" aria-autocomplete="list" :aria-expanded="i === focusIndex && picking" :aria-controls="picking && i === focusIndex ? id : undefined" :aria-activedescendant="i === focusIndex ? activeId : undefined" :style="{ width: `${Math.max(2, (values[opt.name]?.length ?? 0) + 1)}ch` }" autocomplete="off" @focus="focusOption(i)" @input="showChoices = true" @keydown="keydown">
        </label>
        <button v-if="remainingOptions.length" ref="optionalButton" class="dc-optional" type="button" :disabled="pending" aria-haspopup="listbox" :aria-expanded="pickingOption" :aria-controls="pickingOption ? id : undefined" @focus="showChoices = false" @click="pickingOption = !pickingOption; index = 0" @keydown="pickingOption && keydown($event)">
          +{{ remainingOptions.length }} optional
        </button>
        <button ref="runButton" class="dc-send" type="button" :disabled="pending" aria-label="Run command" @click="send" @keydown.esc="cancel">
          {{ pending ? '…' : '➤' }}
        </button>
      </template>
    </div>
  </section>
</template>

<style src="./composer.css"></style>
