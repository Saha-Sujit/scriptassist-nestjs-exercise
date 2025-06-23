import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private readonly namespace = 'scriptassist'; // Prevents key collisions

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  onModuleInit() {
    this.logger.log('CacheService initialized with Redis backend');
  }

  private getNamespacedKey(key: string): string {
    // Ensure safe, collision-free keys
    return `${this.namespace}:${key}`;
  }

  async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    if (!key) throw new Error('Cache key must be provided');
    if (value === undefined || value === null) {
      this.logger.warn(`Attempted to cache undefined/null value for key: ${key}`);
      return;
    }

    const namespacedKey = this.getNamespacedKey(key);

    try {
      await this.cacheManager.set(namespacedKey, JSON.stringify(value), ttlSeconds);
      this.logger.debug(`Cached key: ${namespacedKey} (TTL: ${ttlSeconds}s)`);
    } catch (err) {
      this.logger.error(`Failed to set cache for key ${key}`, err);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!key) return null;

    const namespacedKey = this.getNamespacedKey(key);

    try {
      const value = await this.cacheManager.get<string>(namespacedKey);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (err) {
      this.logger.error(`Failed to get cache for key ${key}`, err);
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!key) return false;

    const namespacedKey = this.getNamespacedKey(key);

    try {
      await this.cacheManager.del(namespacedKey);
      this.logger.debug(`Deleted cache key: ${namespacedKey}`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to delete cache key: ${key}`, err);
      return false;
    }
  }

  async has(key: string): Promise<boolean> {
    if (!key) return false;

    const namespacedKey = this.getNamespacedKey(key);

    try {
      const value = await this.cacheManager.get(namespacedKey);
      return value !== undefined && value !== null;
    } catch (err) {
      this.logger.error(`Failed to check existence for key ${key}`, err);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const cache = this.cacheManager as unknown as {
        reset?: () => Promise<void>;
      };

      if (cache.reset) {
        await cache.reset();
        this.logger.warn('All cache cleared');
      } else {
        this.logger.warn('Cache reset not supported by current store');
      }
    } catch (error: any) {
      this.logger.error('Error clearing cache', error.stack);
    }
  }
}
