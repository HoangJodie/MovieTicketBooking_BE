import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RateLimitService } from './rate-limit.service';
import { RateLimitGuard } from './rate-limit.guard';

@Module({
  providers: [RedisService, RateLimitService, RateLimitGuard],
  exports: [RedisService, RateLimitService, RateLimitGuard],
})
export class RedisModule {} 