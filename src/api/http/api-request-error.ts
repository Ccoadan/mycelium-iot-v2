export type ApiRequestErrorStatus = 400 | 415;

export class ApiRequestError extends Error {
  public override readonly name = 'ApiRequestError';

  public constructor(
    public readonly status: ApiRequestErrorStatus,
    public readonly code: 'INVALID_JSON' | 'UNSUPPORTED_MEDIA_TYPE',
    message: string,
  ) {
    super(message);
  }
}
