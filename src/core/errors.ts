/** A problem with the user's input or configuration; the message is shown as written. */
export class SecurityInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityInputError';
  }
}

/**
 * Messages worth showing: our own input errors and the SDK's typed errors, which the
 * SDK's CLI prints to users as-is. Anything else (bugs, raw OS errors) gets the fallback.
 */
export function userMessage(error: unknown, fallback: string): string {
  if (error instanceof SecurityInputError) return error.message;
  for (let type = error && Object.getPrototypeOf(error); type; type = Object.getPrototypeOf(type))
    if (type.constructor?.name === 'CodexSecurityError')
      return (error as Error).message.slice(0, 2000);
  return fallback;
}
