export class InvalidCredentialsError extends Error {
  public override readonly name = 'InvalidCredentialsError';
}

export class AuthenticationRequiredError extends Error {
  public override readonly name = 'AuthenticationRequiredError';
}

export class AuthorizationError extends Error {
  public override readonly name = 'AuthorizationError';
}

export class LoginRateLimitError extends Error {
  public override readonly name = 'LoginRateLimitError';

  public constructor(public readonly retryAfterSeconds: number) {
    super('Demasiados intentos de acceso. Intente nuevamente más tarde');
  }
}
