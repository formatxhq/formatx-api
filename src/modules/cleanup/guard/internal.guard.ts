import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/schema/env.schema.js';

/**
 * Lets a request into /internal routes only with `Authorization: Bearer <INTERNAL_SECRET>`.
 * With no secret configured the routes don't exist at all (404), so a forgotten setting can't
 * leave them open.
 */
@Injectable()
export class InternalGuard implements CanActivate {
  constructor(@InjectEnv() private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.env.INTERNAL_SECRET;
    if (!secret) throw new NotFoundException();

    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const given = Buffer.from(header.replace(/^Bearer /, ''));
    const expected = Buffer.from(secret);

    // Constant-time comparison, so timing reveals nothing about the secret.
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
