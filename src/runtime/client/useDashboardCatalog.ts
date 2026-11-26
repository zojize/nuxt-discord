import type { DashboardCatalog } from '../../types'
import { computed, useFetch } from '#imports'

export function useDashboardCatalog() {
  const { data } = useFetch<DashboardCatalog>('/api/discord/catalog', { server: false })
  return {
    commands: computed(() => data.value?.commands ?? []),
    menus: computed(() => data.value?.menus ?? []),
    listeners: computed(() => data.value?.listeners ?? []),
  }
}
