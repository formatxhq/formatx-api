import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ApiError, ApiErrorCode } from '@spec/formatx-api-spec';
import type { Response } from 'express';

/** The code used when an error didn't name one, by HTTP status. */
const CODE_BY_STATUS: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'validation_failed',
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'file_too_large',
  [HttpStatus.TOO_MANY_REQUESTS]: 'too_many_requests',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'service_unavailable',
};

/** The sentence used when an error didn't give one, by code. */
const DEFAULT_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  validation_failed: 'The request is invalid.',
  unauthorized: 'Not authorized.',
  forbidden: 'This link is invalid or has expired.',
  not_found: 'Not found.',
  too_many_requests: 'Too many requests. Try again in a minute.',
  service_unavailable: 'The service is unavailable. Try again shortly.',
  internal_error: 'Something went wrong on our side.',
};

/**
 * Turns any error into the one shape the spec promises (ApiError): `{ statusCode, code, message,
 * details? }`. The web app can switch on `code` without guessing which library threw.
 */
export function toApiError(exception: unknown): ApiError {
  if (!(exception instanceof HttpException)) {
    return { statusCode: 500, code: 'internal_error', message: DEFAULT_MESSAGES.internal_error! };
  }

  const statusCode = exception.getStatus();
  const response = exception.getResponse();
  const body = typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : {};
  const fallbackCode = CODE_BY_STATUS[statusCode] ?? (statusCode >= 500 ? 'internal_error' : 'not_found');

  // Validation errors from the Zod pipe: one message per invalid field.
  if (statusCode === HttpStatus.BAD_REQUEST && Array.isArray(body.message)) {
    return {
      statusCode,
      code: 'validation_failed',
      message: DEFAULT_MESSAGES.validation_failed!,
      details: body.message.map(String),
    };
  }

  // Our own errors carry { code, message }; anything else gets the defaults, so a library's
  // internal wording ("ThrottlerException: …") never reaches users.
  if (typeof body.code === 'string') {
    const message = typeof body.message === 'string' ? body.message : (DEFAULT_MESSAGES[fallbackCode] ?? '');
    return { statusCode, code: body.code as ApiErrorCode, message };
  }
  return { statusCode, code: fallbackCode, message: DEFAULT_MESSAGES[fallbackCode] ?? 'Request failed.' };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const error = toApiError(exception);
    // Unexpected failures are logged (the error only: never the request, which can carry tokens).
    if (!(exception instanceof HttpException)) this.logger.error(exception);
    host.switchToHttp().getResponse<Response>().status(error.statusCode).json(error);
  }
}
