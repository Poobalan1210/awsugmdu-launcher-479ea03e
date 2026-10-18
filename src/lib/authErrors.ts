/**
 * Thrown by AuthContext.signIn when the password was right but the account's
 * email was never confirmed. Signup creates the login before the email-code
 * step, so anyone who left before entering the code ends up here.
 */
export class UnconfirmedAccountError extends Error {
  constructor() {
    super('Your email address has not been confirmed yet.');
    this.name = 'UnconfirmedAccountError';
  }
}

/**
 * Cognito refuses a password reset for an account whose email was never
 * confirmed (InvalidParameterException, "no registered/verified email").
 */
export function isUnverifiedEmailResetError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'InvalidParameterException' &&
    /verified email/i.test(error.message)
  );
}

/** Message of a thrown value (Amplify errors carry Cognito's message), or the fallback. */
export function messageOf(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message ? message : fallback;
}

/** Cognito exception name of a thrown value, such as UsernameExistsException. */
export function nameOf(error: unknown): string | undefined {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === 'string' ? name : undefined;
}
