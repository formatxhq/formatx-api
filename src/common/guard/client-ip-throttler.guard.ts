import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate limits by the visitor's real IP address. Behind Cloudflare every request arrives from
 * Cloudflare's network, which puts the visitor's address in the `CF-Connecting-IP` header.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    const cloudflareIp = req.headers['cf-connecting-ip'];
    const ip = (Array.isArray(cloudflareIp) ? cloudflareIp[0] : cloudflareIp) ?? req.ip ?? 'unknown';
    return Promise.resolve(ip);
  }
}
