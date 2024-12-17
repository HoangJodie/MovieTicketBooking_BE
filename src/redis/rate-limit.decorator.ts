import { SetMetadata } from '@nestjs/common';

export const RateLimit = (limit: number, windowSeconds: number = 3600) => {
  SetMetadata('rateLimit', limit);
  return SetMetadata('rateLimitWindow', windowSeconds);
}; 