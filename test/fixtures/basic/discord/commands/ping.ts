export function prefix() {
  return 'po'
}

/** A simple ping command */
export default () => prefix() + suffix()

export function suffix() {
  return 'ng'
}
