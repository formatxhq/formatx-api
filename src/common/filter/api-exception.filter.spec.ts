import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { toApiError } from './api-exception.filter.js';

describe('toApiError', () => {
  it('keeps the code and message our own errors carry', () => {
    const error = new PayloadTooLargeException({ code: 'file_too_large', message: 'Files can be up to 50 MB.' });

    expect(toApiError(error)).toEqual({
      statusCode: 413,
      code: 'file_too_large',
      message: 'Files can be up to 50 MB.',
    });
  });

  it('turns validation messages into details', () => {
    const error = new BadRequestException({ message: ['size: required'], error: 'Bad Request', statusCode: 400 });

    expect(toApiError(error)).toEqual({
      statusCode: 400,
      code: 'validation_failed',
      message: 'The request is invalid.',
      details: ['size: required'],
    });
  });

  it('never passes a library’s wording through', () => {
    expect(toApiError(new ThrottlerException())).toEqual({
      statusCode: 429,
      code: 'too_many_requests',
      message: 'Too many requests. Try again in a minute.',
    });
    expect(toApiError(new NotFoundException('Cannot GET /nope'))).toMatchObject({
      code: 'not_found',
      message: 'Not found.',
    });
  });

  it('hides the details of unexpected failures', () => {
    expect(toApiError(new Error('connection string postgres://secret'))).toEqual({
      statusCode: 500,
      code: 'internal_error',
      message: 'Something went wrong on our side.',
    });
  });
});
