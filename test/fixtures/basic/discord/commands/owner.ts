/** @middleware ownerOnly */
export default () => {
  const state = globalThis as typeof globalThis & { ownerExecutions?: number }
  state.ownerExecutions = (state.ownerExecutions ?? 0) + 1
  return 'owner action'
}
