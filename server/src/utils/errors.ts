// ──────────────────────────────────────────────────────────────
// CineFlow Studio API — Custom Error Classes
// Standardized error handling across the API.
// ──────────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ─── 400 Bad Request ─────────────────────────────────────────

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', code: string = 'BAD_REQUEST') {
    super(message, 400, code);
  }
}

export class ValidationError extends AppError {
  public readonly errors: Array<{ field: string; message: string }>;

  constructor(errors: Array<{ field: string; message: string }>) {
    super('Validation failed', 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

// ─── 401 Unauthorized ────────────────────────────────────────

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required', code: string = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }
}

export class TokenExpiredError extends AppError {
  constructor() {
    super('Token has expired', 401, 'TOKEN_EXPIRED');
  }
}

export class InvalidTokenError extends AppError {
  constructor() {
    super('Invalid or malformed token', 401, 'INVALID_TOKEN');
  }
}

// ─── 403 Forbidden ───────────────────────────────────────────

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied', code: string = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

export class InsufficientRoleError extends AppError {
  constructor(requiredRole: string) {
    super(`Requires ${requiredRole} role or higher`, 403, 'INSUFFICIENT_ROLE');
  }
}

export class AccountSuspendedError extends AppError {
  constructor() {
    super('Account is suspended. Contact support.', 403, 'ACCOUNT_SUSPENDED');
  }
}

export class AccountBannedError extends AppError {
  constructor() {
    super('Account has been permanently banned', 403, 'ACCOUNT_BANNED');
  }
}

// ─── 404 Not Found ───────────────────────────────────────────

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

// ─── 409 Conflict ────────────────────────────────────────────

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists', code: string = 'CONFLICT') {
    super(message, 409, code);
  }
}

export class EmailAlreadyExistsError extends AppError {
  constructor() {
    super('An account with this email already exists', 409, 'EMAIL_EXISTS');
  }
}

// ─── 422 Unprocessable ───────────────────────────────────────

export class InsufficientCreditsError extends AppError {
  public readonly required: number;
  public readonly available: number;

  constructor(required: number, available: number) {
    super(
      `Insufficient credits. Required: ${required}, Available: ${available}`,
      422,
      'INSUFFICIENT_CREDITS',
    );
    this.required = required;
    this.available = available;
  }
}

export class MaxDevicesReachedError extends AppError {
  public readonly maxDevices: number;

  constructor(maxDevices: number) {
    super(
      `Maximum device limit reached (${maxDevices}). Deactivate a device first.`,
      422,
      'MAX_DEVICES_REACHED',
    );
    this.maxDevices = maxDevices;
  }
}

export class InvalidLicenseKeyError extends AppError {
  constructor() {
    super('Invalid or expired license key', 422, 'INVALID_LICENSE_KEY');
  }
}

// ─── 429 Rate Limited ────────────────────────────────────────

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number = 60) {
    super(`Too many requests. Try again in ${retryAfterSeconds} seconds.`, 429, 'RATE_LIMITED');
  }
}

// ─── Error Response Formatter ────────────────────────────────

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    errors?: Array<{ field: string; message: string }>;
    details?: Record<string, unknown>;
  };
}

export function formatError(err: AppError): ErrorResponse {
  const response: ErrorResponse = {
    error: {
      code: err.code,
      message: err.message,
    },
  };

  if (err instanceof ValidationError) {
    response.error.errors = err.errors;
  }

  if (err instanceof InsufficientCreditsError) {
    response.error.details = {
      required: err.required,
      available: err.available,
    };
  }

  if (err instanceof MaxDevicesReachedError) {
    response.error.details = {
      maxDevices: err.maxDevices,
    };
  }

  return response;
}
