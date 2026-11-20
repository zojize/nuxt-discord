<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import ChatAvatar from './ChatAvatar.vue'

export interface ChatEntry {
  id: number
  at: Date
  ephemeral?: boolean
  invocation?: { name: string, options: Record<string, string> }
  messages: string[]
  state: 'pending' | 'sent' | 'error'
}
const props = defineProps<{ entries: ChatEntry[], channel: boolean, search?: string, pinned?: boolean, interactive?: boolean }>()
defineEmits<{ dismiss: [id: number] }>()
const scroller = ref<HTMLElement>()
const follow = ref(true)
const day = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

const pins = ref(new Set<number>())
const reactions = ref(new Map<number, Set<string>>())
const filtered = computed(() => {
  const query = props.search?.trim().toLowerCase() ?? ''
  return props.entries.filter((entry) => {
    if (props.pinned && !pins.value.has(entry.id))
      return false
    if (!query)
      return true
    const invocation = entry.invocation
    const terms = invocation ? [`/${invocation.name}`, ...Object.values(invocation.options)] : []
    return terms.concat(entry.messages).some(s => s.toLowerCase().includes(query))
  })
})
function togglePin(id: number) {
  if (pins.value.has(id))
    pins.value.delete(id)
  else pins.value.add(id)
}
function react(id: number, emoji: string) {
  const selected = new Set(reactions.value.get(id))
  if (selected.has(emoji))
    selected.delete(emoji)
  else selected.add(emoji)
  reactions.value.set(id, selected)
}

function trackScroll() {
  const el = scroller.value
  if (el)
    follow.value = el.scrollHeight - el.scrollTop - el.clientHeight < 32
}
watch(() => props.entries.map(e => e.state), async (_, previous) => {
  if (!props.entries.length) {
    reactions.value.clear()
    pins.value.clear()
  }
  const submitted = props.entries.length !== previous.length
  if (!follow.value && !submitted)
    return
  await nextTick()
  if (scroller.value)
    scroller.value.scrollTop = scroller.value.scrollHeight
}, { flush: 'pre' })
</script>

<template>
  <div ref="scroller" :class="channel ? 'min-h-0 flex-1' : 'max-h-[40dvh] rounded-t-lg bg-chat-canvas'" class="overflow-y-auto overscroll-contain" @scroll.passive="trackScroll">
    <div class="flex min-h-full flex-col justify-end">
      <slot v-if="!search && !pinned" />
      <p v-if="(search || pinned) && !filtered.length" class="px-5 py-6 text-sm text-chat-muted">
        {{ pinned ? 'No matching pinned messages' : 'No matching messages' }}
      </p>
      <div :role="interactive ? 'log' : undefined" :aria-label="interactive ? 'Channel messages' : undefined" aria-relevant="additions text" class="shrink-0">
        <template v-for="(entry, i) in filtered" :key="entry.id">
          <div v-if="channel && (i === 0 || filtered[i - 1]?.at.toDateString() !== entry.at.toDateString())" class="mx-4 my-4 flex items-center gap-2 text-xs font-semibold text-chat-muted before:h-px before:flex-1 before:bg-chat-line after:h-px after:flex-1 after:bg-chat-line">
            {{ day.format(entry.at) }}
          </div>
          <article
            :tabindex="interactive ? -1 : undefined"
            class="group/message relative mt-4 px-4 pb-0.5 pl-[4.5rem] text-base leading-[1.375]" :class="entry.ephemeral
              ? 'bg-chat-brand/5 before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-chat-brand hover:bg-chat-brand/10'
              : 'hover:bg-white/[0.025]'"
          >
            <div v-if="interactive && !entry.ephemeral && entry.state === 'sent'" role="group" aria-label="Message actions" class="pointer-events-none absolute -top-3 right-4 z-10 flex items-center gap-0.5 rounded-md border border-chat-line bg-chat-panel px-1 py-0.5 opacity-0 shadow group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100 group-hover/message:pointer-events-auto group-hover/message:opacity-100">
              <button v-for="emoji in ['💯', '👍', '👎']" :key="emoji" type="button" :aria-label="`React with ${emoji}`" :aria-pressed="reactions.get(entry.id)?.has(emoji) ?? false" class="grid size-7 cursor-pointer place-items-center rounded hover:bg-chat-hover" @click="react(entry.id, emoji)">
                {{ emoji }}
              </button>
              <button type="button" :aria-label="pins.has(entry.id) ? 'Unpin message' : 'Pin message'" :aria-pressed="pins.has(entry.id)" class="grid size-7 cursor-pointer place-items-center rounded text-chat-muted hover:bg-chat-hover aria-pressed:text-chat-link" @click="togglePin(entry.id)">
                <UIcon name="i-lucide-pin" class="size-4" />
              </button>
            </div>
            <div v-if="entry.invocation" class="relative mb-1 flex min-h-5 items-center gap-1 text-sm leading-[1.3] text-chat-muted before:absolute before:top-1/2 before:right-[calc(100%+4px)] before:h-3 before:w-8 before:rounded-tl-md before:border-t-2 before:border-l-2 before:border-[#4c4c53]">
              <ChatAvatar user class="size-4" />
              <span class="font-medium">You</span><span>used</span>
              <UPopover :content="{ side: 'top', align: 'center', sideOffset: 8 }" :ui="{ content: 'max-w-[min(28rem,85vw)] rounded-[5px] bg-chat-panel px-3 py-2 font-chat text-base leading-5 text-chat-white shadow-lg ring-0' }">
                <button type="button" :aria-label="`View sent command /${entry.invocation.name}`" class="inline-flex cursor-pointer items-center gap-0.5 rounded-sm bg-chat-brand/25 px-0.5 font-medium text-chat-link hover:underline focus-visible:outline-2">
                  <UIcon name="i-lucide-blocks" class="size-2.5" />{{ entry.invocation.name }}
                </button>
                <template #content>
                  <p class="break-words whitespace-pre-wrap">
                    <span>/{{ entry.invocation.name }}</span><template v-for="(value, key) in entry.invocation.options" :key="key">
                      <span>{{ ` ${key}: ` }}</span><span class="text-white">{{ value }}</span>
                    </template>
                  </p>
                </template>
              </UPopover>
            </div>
            <div class="relative">
              <ChatAvatar :user="!entry.invocation" class="absolute top-0 -left-14 size-10" />
              <div class="flex min-h-[1.375rem] flex-wrap items-center gap-x-1">
                <b class="font-semibold">{{ entry.invocation ? 'nuxt-discord' : 'You' }}</b>
                <span v-if="entry.invocation" class="inline-flex h-[.9375rem] items-center min-w-[2.125rem] justify-center rounded-[3px] bg-chat-brand px-1 text-[.8rem] leading-none font-semibold text-white">APP</span>
                <NuxtTime :datetime="entry.at" hour="numeric" minute="2-digit" class="ml-1 text-xs font-medium text-chat-faint" />
              </div>
              <p v-if="entry.state === 'pending'" class="text-chat-muted italic">
                Sending command...
              </p>
              <p v-for="(text, j) in entry.messages" :key="j" class="break-words whitespace-pre-wrap" :class="{ 'text-[#ff9e9e]': entry.state === 'error', 'mt-1': j > 0 }">
                {{ text }}
              </p>
              <div v-if="entry.ephemeral" class="flex min-h-6 items-start gap-1 pt-1.5 text-xs leading-4 text-chat-muted">
                <UIcon name="i-lucide-eye" class="size-4 shrink-0" /><span>Only you can see this</span>
                <template v-if="interactive">
                  <span aria-hidden="true">•</span><button type="button" class="cursor-pointer text-chat-link hover:underline" @click="$emit('dismiss', entry.id)">
                    Dismiss message
                  </button>
                </template>
              </div>
              <div v-if="reactions.get(entry.id)?.size" class="mt-1 flex gap-1">
                <button v-for="emoji in reactions.get(entry.id)" :key="emoji" type="button" :aria-label="`Remove reaction ${emoji}`" class="flex cursor-pointer items-center gap-1 rounded-md border border-chat-brand bg-[#282b40] px-1.5 text-sm text-chat-link" @click="react(entry.id, emoji)">
                  {{ emoji }} 1
                </button>
              </div>
            </div>
          </article>
        </template>
      </div>
    </div>
  </div>
</template>
