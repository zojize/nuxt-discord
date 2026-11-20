<script setup lang="ts">
import { watch } from 'vue'
import ChatAvatar from './ChatAvatar.vue'

export interface PickerItem {
  name: string
  value: string
  description?: string
  required?: string[]
  optional?: number
}
const props = defineProps<{ id: string, label: string, items: PickerItem[], index: number, commands?: boolean, searching?: boolean }>()
defineEmits<{ choose: [item: PickerItem], highlight: [index: number] }>()
watch(() => props.index, index => document.getElementById(`${props.id}-${index}`)?.scrollIntoView({ block: 'nearest' }), { flush: 'post' })
</script>

<template>
  <div class="absolute inset-x-2 bottom-full z-20 mb-1.5 flex overflow-hidden rounded bg-chat-panel shadow-[0_4px_18px_#0005] ring-1 ring-black/20">
    <div v-if="commands && !searching" aria-hidden="true" class="flex w-[2.875rem] shrink-0 justify-center bg-chat-sidebar pt-3">
      <ChatAvatar class="size-8" />
    </div>
    <div :id="id" role="listbox" :aria-label="label" class="max-h-[min(26.25rem,55dvh)] min-w-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5">
      <h3 class="px-2 py-1.5 text-sm font-semibold">
        {{ label }}
      </h3>
      <div
        v-for="(item, i) in items" :id="`${id}-${i}`" :key="item.value" role="option"
        :aria-selected="i === index" class="flex cursor-pointer items-center gap-4 rounded px-2 aria-selected:bg-chat-hover"
        :class="commands ? 'min-h-14' : 'min-h-10'"
        @pointermove="$emit('highlight', i)" @pointerdown.prevent @click="$emit('choose', item)"
      >
        <ChatAvatar v-if="commands && searching" class="size-8" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="font-medium">{{ item.name }}</span>
            <span v-for="arg in item.required" :key="arg" class="rounded-sm bg-white/10 px-1 text-sm leading-[1.25]">{{ arg }}</span>
            <span v-if="item.optional" class="text-xs text-chat-muted">+{{ item.optional }} optional</span>
          </div>
          <p v-if="item.description" class="truncate text-xs leading-[1.5] text-chat-muted">
            {{ item.description }}
          </p>
        </div>
        <span v-if="commands && searching" class="hidden shrink-0 text-xs text-chat-muted sm:inline">nuxt-discord</span>
      </div>
      <p v-if="!items.length" class="p-2 text-sm text-chat-muted">
        No commands found
      </p>
    </div>
  </div>
</template>
