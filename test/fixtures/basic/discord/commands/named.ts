import { prefix, suffix } from './ping'

/** Verify named helpers can also be imported by another command. */
export default function named() {
  return suffix() + prefix()
}
