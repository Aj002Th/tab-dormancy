export type ErrorCode =
  | 'INVALID_EXPRESSION'
  | 'INVALID_SETTINGS'
  | 'UNSUPPORTED_FACT'
  | 'BUSY'
  | 'STORAGE_FAILED'
  | 'NOT_FOUND'
  | 'TAB_CHANGED'
  | 'PREVIEW_REQUIRED'
  | 'FORBIDDEN'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
