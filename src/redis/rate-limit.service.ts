import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class RateLimitService {
  constructor(private readonly redisService: RedisService) {}

  async isRateLimited(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const current = await this.redisService.get(key);
    
    if (!current) {
      await this.redisService.set(key, '1', windowSeconds);
      return false;
    }

    const requestCount = parseInt(current);
    if (requestCount >= limit) {
      return true;
    }

    await this.redisService.set(key, (requestCount + 1).toString(), windowSeconds);
    return false;
  }

  async getRemainingRequests(key: string, limit: number): Promise<number> {
    const current = await this.redisService.get(key);
    if (!current) return limit;
    return Math.max(0, limit - parseInt(current));
  }
} 