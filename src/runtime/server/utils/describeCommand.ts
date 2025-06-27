export interface DescribeCommandOptions {
  /** The name of the command. */
  name?: string

  /** A brief description of the command. */
  description?: string
}

/**
 * A compiler macro that describes a command. Used for defining metadata
 * for registering slash commands. Options defined here will take higher
 * precedence over the inferred function name and JSDoc tags.
 *
 * @param _options - The options for the command.
 * @example
 * describeCommand({
 *   name: 'ping',
 *   description: 'A simple ping command that responds with "pong!"',
 * })
 */
export function describeCommand(_options: DescribeCommandOptions): void {
  // This function is a placeholder for the build time macro
}
