<script setup lang="ts">
import { watch } from 'vue'

export interface PickerItem {
  name: string
  value: string
  description?: string
  required?: string[]
  optional?: number
}
const props = defineProps<{ id: string, label: string, items: PickerItem[], index: number, commands?: boolean }>()
defineEmits<{ choose: [item: PickerItem], highlight: [index: number] }>()
watch(() => props.index, index => document.getElementById(`${props.id}-${index}`)?.scrollIntoView({ block: 'nearest' }), { flush: 'post' })
</script>

<template>
  <div class="dc-picker">
    <div v-if="commands" class="dc-rail" aria-hidden="true">
      <b>/d</b>
    </div>
    <div :id="id" class="dc-list" role="listbox" :aria-label="label">
      <div class="dc-group">
        {{ label }}
      </div>
      <div
        v-for="(item, i) in items" :id="`${id}-${i}`" :key="item.value" role="option"
        :aria-selected="i === index" class="dc-option" @pointermove="$emit('highlight', i)"
        @mousedown.prevent @click="$emit('choose', item)"
      >
        <div><strong>{{ item.name }}</strong><span v-for="arg in item.required" :key="arg" class="dc-tag">{{ arg }}</span><small v-if="item.optional">+{{ item.optional }} optional</small></div>
        <span v-if="item.description">{{ item.description }}</span>
      </div>
      <div v-if="!items.length" class="dc-group">
        No matches
      </div>
    </div>
  </div>
</template>
