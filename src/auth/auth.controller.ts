import { Controller, Post, Body, UseGuards, Get, Req, Res, Param, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalGuard } from './guards/local.guard';
import { JwtAuthGuard } from './guards/jwt.guard';
import { Request, Response } from 'express';
import { Roles } from './decorators/roles.decorators';
import { RolesGuard } from './guards/roles.guards';
import { RateLimit } from '../redis/rate-limit.decorator';
import { RateLimitGuard } from '../redis/rate-limit.guard';


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  // Đăng nhập và tạo token
  // auth.controller.ts

@Post('login')
@UseGuards(LocalGuard)
@UseGuards(RateLimitGuard)
@RateLimit(5, 60)
async login(@Req() req: Request) {
  try {
    const user = req.user;
    const tokens = await this.authService.generateTokens(user);
    return tokens; // Trả về cả access token và refresh token
  } catch (error) {
    throw new UnauthorizedException('Login failed');
  }
}


  // Endpoint để lấy access token mới từ refresh token
  @Post('refresh')
  @UseGuards(RateLimitGuard)
  @RateLimit(10, 300)
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    try {
      const newAccessToken = await this.authService.refreshToken(refreshToken);
      return { accessToken: newAccessToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
  // Lấy thông tin trạng thái người dùng (yêu cầu JWT token)
  @Get('status')
  @UseGuards(JwtAuthGuard)
  async status(@Req() req: Request) {
    return req.user; // Trả về thông tin người dùng từ JWT token
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request) {
    const userId = req.user['user_id'];
    await this.authService.logout(userId);
    return { message: 'Logged out successfully' };
  }

  // Chỉ admin có thể truy cập trang dashboard
  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('1') // Chỉ những người có role_id '1' mới truy cập được
  getAdminDashboard(@Req() req: Request) {
    return `Welcome to admin dashboard`; // Trả về thông điệp chào mừng
  }

  @Get('check-token/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('1') // Chỉ admin mới được kiểm tra
  async checkStoredToken(@Param('userId') userId: string) {
    const token = await this.authService.getStoredRefreshToken(userId);
    return { stored_token: token };
  }

  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimit(3, 3600)
  async register(@Req() req: Request) {
    // Handle registration logic here
  }
}
