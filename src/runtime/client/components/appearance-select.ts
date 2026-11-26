// Keep the header trigger compact while giving the menu room for the mode names.
export const appearanceSelect = {
  'aria-label': 'Appearance',
  'title': 'Appearance',
  'variant': 'ghost',
  'color': 'neutral',
  'content': { align: 'end' },
  'ui': {
    base: 'size-11 shrink-0 cursor-pointer justify-center p-0',
    leading: 'static p-0',
    leadingIcon: 'size-[1.125rem] text-current',
    value: 'sr-only',
    trailing: 'hidden',
    content: 'z-50 min-w-32',
  },
} as const
