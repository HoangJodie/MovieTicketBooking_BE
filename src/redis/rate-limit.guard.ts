import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private rateLimitService: RateLimitService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    // Lấy IP của user
    const clientIp = request.ip;
    // Lấy endpoint
    const endpoint = request.route.path;
    
    // Tạo key cho Redis
    const key = `rate_limit:${clientIp}:${endpoint}`;
    
    // Lấy config từ decorator hoặc dùng giá trị mặc định
    const limit = this.reflector.get<number>('rateLimit', context.getHandler()) || 50;
    const windowSeconds = this.reflector.get<number>('rateLimitWindow', context.getHandler()) || 1800;

    const isLimited = await this.rateLimitService.isRateLimited(key, limit, windowSeconds);
    const remaining = await this.rateLimitService.getRemainingRequests(key, limit);

    // Thêm headers
    response.header('X-RateLimit-Limit', limit);
    response.header('X-RateLimit-Remaining', remaining);

    if (isLimited) {
      throw new HttpException({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Quá nhiều yêu cầu, vui lòng thử lại sau',
        remainingTime: windowSeconds
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
} 