<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  commands: { name: string, description: string, options: { name: string, description: string, type: number, required: boolean, choices?: { name: string, value: string | number }[] }[] }[]
}>()

type Phase = 'idle' | 'suggesting' | 'filling'
const phase = ref<Phase>('idle')
const rawInput = ref('')
const selectedIndex = ref(0)
const inputEl = ref<HTMLInputElement>()
const pending = ref(false)
const activeCommand = ref<typeof props.commands[number] | null>(null)
const optionValues = ref<Record<string, string>>({})
const focusedOptionIndex = ref(0)
const optionInputRefs = ref<Record<string, HTMLInputElement>>({})
const responses = ref<{ command: string, ok: boolean, text: string, time: number }[]>([])
const showChoices = ref(false)
const choiceIndex = ref(0)

const allCommands = computed(() => {
  const result: typeof props.commands = []
  for (const cmd of props.commands) {
    result.push(cmd)
    if ('subcommands' in cmd && Array.isArray((cmd as any).subcommands)) {
      for (const sub of (cmd as any).subcommands) {
        result.push({ ...sub, name: `${cmd.name} ${sub.name}` })
        if (sub.subcommands) {
          for (const leaf of sub.subcommands) {
            result.push({ ...leaf, name: `${cmd.name} ${sub.name} ${leaf.name}` })
          }
        }
      }
    }
  }
  return result
})

const suggestions = computed(() => {
  const q = rawInput.value.startsWith('/') ? rawInput.value.slice(1) : rawInput.value
  if (!q)
    return allCommands.value.slice(0, 10)
  return allCommands.value.filter(c => c.name.startsWith(q)).slice(0, 8)
})

const focusedOption = computed(() => activeCommand.value?.options[focusedOptionIndex.value] ?? null)

const filteredChoices = computed(() => {
  if (!focusedOption.value?.choices)
    return []
  const val = (optionValues.value[focusedOption.value.name] ?? '').toLowerCase()
  return focusedOption.value.choices.filter(c =>
    !val || c.name.toLowerCase().includes(val),
  )
})

const typeLabels: Record<number, string> = {
  3: 'text',
  4: 'integer',
  5: 'true/false',
  6: 'user',
  7: 'channel',
  8: 'role',
  9: 'mention',
  10: 'number',
  11: 'file',
}

function selectCommand(cmd: typeof allCommands.value[number]) {
  activeCommand.value = cmd
  optionValues.value = {}
  focusedOptionIndex.value = 0
  phase.value = 'filling'
  rawInput.value = ''
  showChoices.value = false
  if (cmd.options.length > 0) {
    nextTick(() => {
      const first = cmd.options[0]
      if (first) {
        optionInputRefs.value[first.name]?.focus()
        showChoices.value = !!first.choices?.length
      }
    })
  }
}

function cancelCommand() {
  phase.value = 'idle'
  activeCommand.value = null
  optionValues.value = {}
  rawInput.value = ''
  showChoices.value = false
  nextTick(() => inputEl.value?.focus())
}

async function executeCommand() {
  if (!activeCommand.value || pending.value)
    return
  const cmd = activeCommand.value
  pending.value = true
  const start = performance.now()
  try {
    const result = await $fetch('/api/discord/slash-command/test', {
      method: 'POST',
      body: { name: cmd.name, options: optionValues.value },
    }) as any
    const time = Math.round(performance.now() - start)
    const text = result.ok
      ? (result.responses?.join('\n') ?? result.response ?? 'Command executed')
      : result.error
    responses.value.unshift({ command: `/${cmd.name}`, ok: result.ok, text, time })
  }
  catch (e) {
    responses.value.unshift({ command: `/${cmd.name}`, ok: false, text: String(e), time: Math.round(performance.now() - start) })
  }
  finally {
    pending.value = false
    cancelCommand()
  }
}

function selectChoice(value: string) {
  if (!focusedOption.value)
    return
  optionValues.value[focusedOption.value.name] = value
  showChoices.value = false
  // Move to next option
  const opts = activeCommand.value?.options ?? []
  const next = focusedOptionIndex.value + 1
  if (next < opts.length) {
    focusedOptionIndex.value = next
    const o = opts[next]
    if (o) {
      nextTick(() => {
        optionInputRefs.value[o.name]?.focus()
        showChoices.value = !!o.choices?.length
      })
    }
  }
}

function onRawKeydown(e: KeyboardEvent) {
  if (rawInput.value.length > 0)
    phase.value = 'suggesting'
  if (phase.value === 'suggesting' && suggestions.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIndex.value = Math.min(selectedIndex.value + 1, suggestions.value.length - 1)
    }
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const s = suggestions.value[selectedIndex.value]
      if (s)
        selectCommand(s)
    }
  }
  if (e.key === 'Escape') {
    cancelCommand()
  }
}

function onOptionKeydown(e: KeyboardEvent, idx: number) {
  const opts = activeCommand.value?.options ?? []

  // Choice navigation
  if (showChoices.value && filteredChoices.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      choiceIndex.value = Math.min(choiceIndex.value + 1, filteredChoices.value.length - 1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      choiceIndex.value = Math.max(choiceIndex.value - 1, 0)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const c = filteredChoices.value[choiceIndex.value]
      if (c) {
        selectChoice(String(c.value))
      }
      return
    }
  }

  if (e.key === 'Tab') {
    e.preventDefault()
    showChoices.value = false
    const next = e.shiftKey ? Math.max(0, idx - 1) : Math.min(opts.length - 1, idx + 1)
    focusedOptionIndex.value = next
    const o = opts[next]
    if (o) {
      nextTick(() => {
        optionInputRefs.value[o.name]?.focus()
        showChoices.value = !!o.choices?.length
        choiceIndex.value = 0
      })
    }
  }
  else if (e.key === 'Enter' && !showChoices.value) {
    e.preventDefault()
    executeCommand()
  }
  else if (e.key === 'Escape') {
    if (showChoices.value) {
      showChoices.value = false
    }
    else {
      cancelCommand()
    }
  }
  else if (e.key === 'Backspace' && !optionValues.value[opts[idx]?.name ?? '']) {
    if (idx === 0) {
      cancelCommand()
    }
    else {
      e.preventDefault()
      focusedOptionIndex.value = idx - 1
      const prev = opts[idx - 1]
      if (prev) {
        nextTick(() => optionInputRefs.value[prev.name]?.focus())
      }
    }
  }
}

function onOptionInput(name: string, e: Event) {
  optionValues.value[name] = (e.target as HTMLInputElement).value
  const opt = activeCommand.value?.options.find(o => o.name === name)
  showChoices.value = !!(opt?.choices?.length)
  choiceIndex.value = 0
}

function onRawInput() {
  phase.value = rawInput.value.length > 0 ? 'suggesting' : 'idle'
  selectedIndex.value = 0
}

function onRawBlur() {
  if (phase.value === 'suggesting') {
    phase.value = 'idle'
  }
}

function setOptionRef(name: string, el: any) {
  if (el) {
    optionInputRefs.value[name] = el
  }
}

watch(rawInput, () => {
  selectedIndex.value = 0
})
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-40" style="font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;">
    <!-- Response log -->
    <div v-if="responses.length > 0" class="mx-auto max-w-6xl px-4">
      <div class="mb-2 max-h-56 overflow-y-auto rounded-lg border border-default bg-elevated shadow-xl">
        <div class="flex items-center justify-between border-b border-default px-4 py-1.5">
          <span class="text-xs font-medium text-muted">Test Output</span>
          <button class="cursor-pointer text-xs text-muted hover:text-highlighted" @click="responses = []">
            Clear
          </button>
        </div>
        <div class="divide-y divide-default">
          <div v-for="(r, i) in responses" :key="i" class="px-4 py-2">
            <div class="flex items-center gap-2">
              <code class="text-xs font-semibold" :class="r.ok ? 'text-highlighted' : 'text-error'">{{ r.command }}</code>
              <span class="text-xs text-dimmed">{{ r.time }}ms</span>
            </div>
            <pre class="mt-1 whitespace-pre-wrap text-sm" :class="r.ok ? 'text-default' : 'text-error'" style="font-family: inherit;">{{ r.text }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- Description bar / Choice autocomplete -->
    <div v-if="phase === 'filling' && (focusedOption || showChoices)" class="border-t border-default bg-elevated">
      <div class="mx-auto max-w-6xl px-4">
        <!-- Choices dropdown -->
        <div v-if="showChoices && filteredChoices.length > 0" class="py-1">
          <button
            v-for="(c, i) in filteredChoices"
            :key="String(c.value)"
            class="flex w-full cursor-pointer items-center rounded px-3 py-1 text-left text-sm transition-colors"
            :class="i === choiceIndex ? 'bg-accented text-highlighted' : 'text-muted hover:bg-muted'"
            @mousedown.prevent="selectChoice(String(c.value))"
            @mouseenter="choiceIndex = i"
          >
            {{ c.name }}
          </button>
        </div>
        <!-- Option description -->
        <div v-else-if="focusedOption" class="flex items-center gap-2 py-2">
          <span class="text-sm font-semibold text-highlighted">{{ focusedOption.name }}</span>
          <span class="text-xs text-muted">{{ focusedOption.description || `Enter a ${typeLabels[focusedOption.type] ?? 'value'}` }}</span>
        </div>
      </div>
    </div>

    <!-- Autocomplete popup -->
    <div v-if="phase === 'suggesting' && suggestions.length > 0" class="rounded-t-lg border-t border-default bg-elevated shadow-xl">
      <div class="mx-auto max-w-6xl px-4 py-1">
        <button
          v-for="(s, i) in suggestions"
          :key="s.name"
          class="flex w-full cursor-pointer items-center gap-3 rounded px-3 py-1.5 text-left transition-colors"
          :class="i === selectedIndex ? 'bg-accented' : 'hover:bg-muted'"
          @mousedown.prevent="selectCommand(s)"
          @mouseenter="selectedIndex = i"
        >
          <code class="text-sm font-semibold text-highlighted">/{{ s.name }}</code>
          <span class="truncate text-xs text-muted">{{ s.description }}</span>
        </button>
      </div>
    </div>

    <!-- Main input area -->
    <div class="border-t border-default bg-elevated px-0 pb-6 pt-0">
      <div class="mx-auto max-w-6xl px-4">
        <div class="flex min-h-11 items-center rounded-lg bg-accented px-4">
          <!-- Idle: raw text input -->
          <div v-if="phase !== 'filling'" class="flex flex-1 items-center gap-1 py-1.5">
            <span class="select-none text-base font-semibold text-muted">/</span>
            <input
              ref="inputEl"
              v-model="rawInput"
              type="text"
              class="flex-1 border-none bg-transparent text-base text-highlighted outline-none placeholder:text-dimmed"
              placeholder="Type a command..."
              autocomplete="off"
              @input="onRawInput"
              @keydown="onRawKeydown"
              @focus="onRawInput"
              @blur="onRawBlur"
            >
          </div>

          <!-- Filling: inline pills -->
          <div
            v-else
            class="flex flex-1 cursor-text flex-wrap items-center gap-1 py-1.5"
            @click="() => { const o = activeCommand?.options[focusedOptionIndex]; if (o) { optionInputRefs[o.name]?.focus() } }"
          >
            <span class="text-base font-semibold text-highlighted">/{{ activeCommand!.name }}</span>

            <template v-for="(opt, idx) in activeCommand!.options" :key="opt.name">
              <span
                class="inline-flex h-6 items-stretch overflow-hidden rounded"
                :class="focusedOptionIndex === idx
                  ? 'ring-1 ring-primary'
                  : ''"
                style="background: var(--ui-bg-muted);"
              >
                <span
                  class="flex select-none items-center px-2 text-xs"
                  :class="focusedOptionIndex === idx ? 'text-primary font-medium' : 'text-muted'"
                  style="background: var(--ui-bg-elevated);"
                >{{ opt.name }}</span>
                <input
                  :ref="(el) => setOptionRef(opt.name, el)"
                  :value="optionValues[opt.name] ?? ''"
                  type="text"
                  class="h-full min-w-0 border-none bg-transparent px-1.5 text-xs text-highlighted outline-none placeholder:text-dimmed"
                  :placeholder="typeLabels[opt.type] ?? 'value'"
                  :style="{ width: `${Math.max(4, (optionValues[opt.name]?.length ?? typeLabels[opt.type]?.length ?? 4) + 1)}ch` }"
                  @input="(e) => onOptionInput(opt.name, e)"
                  @focus="() => { focusedOptionIndex = idx; showChoices = !!(opt.choices?.length); choiceIndex = 0 }"
                  @keydown="(e) => onOptionKeydown(e, idx)"
                >
              </span>
            </template>

            <span v-if="activeCommand!.options.length === 0" class="text-sm text-dimmed">
              press Enter to run
            </span>
          </div>

          <!-- Enter key hint -->
          <div v-if="phase === 'filling'" class="ml-2 flex shrink-0 items-center gap-1">
            <UKbd value="escape" size="sm" />
            <UKbd size="sm" class="cursor-pointer" @click="executeCommand">
              Enter ↵
            </UKbd>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
