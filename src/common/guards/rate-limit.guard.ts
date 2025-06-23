import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RateLimitOptions, RATE_LIMIT_KEY } from '@common/decorators/rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip;

    const handler = context.getHandler();
    const options = this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, handler);

    // If no rate limit is set, allow access
    if (!options) return true;

    const { limit, windowMs } = options;
    const cacheKey = `rate_limit:${ip}:${handler.name}`;
    const now = Date.now();

    // Try to get the current record
    const record = await this.cacheManager.get<{ count: number; resetTime: number }>(cacheKey);

    if (!record) {
      // First request
      await this.cacheManager.set(
        cacheKey,
        { count: 1, resetTime: now + windowMs },
        windowMs / 1000,
      );
      return true;
    }

    if (record.count >= limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests, please try again later.',
          limit,
          resetTime: record.resetTime,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment count
    await this.cacheManager.set(
      cacheKey,
      { count: record.count + 1, resetTime: record.resetTime },
      (record.resetTime - now) / 1000,
    );

    return true;
  }
}