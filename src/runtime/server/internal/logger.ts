import ansis from 'ansis'

export const logger = {
  // eslint-disable-next-line no-console
  log: (...args: unknown[]) => console.log(ansis.hex('#5865F2').bold('[Discord]'), ...args),
  warn: (...args: unknown[]) => console.warn(ansis.yellow.bold('[Discord]'), ...args),
  error: (...args: unknown[]) => console.error(ansis.red.bold('[Discord]'), ...args),
}
