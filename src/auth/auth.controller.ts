import { Controller, Post, Body, UseGuards, Get, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalGuard } from './guards/local.guard';
import { JwtAuthGuard } from './guards/jwt.guard';
import { Request, Response } from 'express';
import { Roles } from './decorators/roles.decorators';
import { RolesGuard } from './guards/roles.guards';


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  // Đăng nhập và tạo token
  // auth.controller.ts

@Post('login')
@UseGuards(LocalGuard)
async login(@Req() req: Request, @Res() res: Response) {
  try {
    const user = req.user;
    const { accessToken, refreshToken } = this.authService.generateTokens(user);

    // Lưu refresh token vào cookies
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ accessToken });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ message: 'Login failed due to server error' });
  }
}


  // Endpoint để lấy access token mới từ refresh token
  @Post('refresh')
  async refreshToken(@Req() req: Request, @Res() res: Response) {
    const refreshToken = req.cookies['refreshToken']; // Lấy refresh token từ cookies

    if (!refreshToken) {
      return res.status(403).json({ message: 'Refresh token missing' });
    }

    try {
      const newAccessToken = await this.authService.refreshToken(refreshToken);
      return res.json({ accessToken: newAccessToken });
    } catch (error) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
  }
  // Lấy thông tin trạng thái người dùng (yêu cầu JWT token)
  @Get('status')
  @UseGuards(JwtAuthGuard)
  async status(@Req() req: Request) {
    return req.user; // Trả về thông tin người dùng từ JWT token
  }

  @Post('logout')
  async logout(@Res() res: Response) {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true, // Đảm bảo dùng HTTPS trong môi trường production
      sameSite: 'strict',
    }); // Xóa cookie refresh token
    return res.json({ message: 'Logged out successfully' });
  }

  // Chỉ admin có thể truy cập trang dashboard
  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('1') // Chỉ những người có role_id '1' mới truy cập được
  getAdminDashboard(@Req() req: Request) {
    return `Welcome to admin dashboard`; // Trả về thông điệp chào mừng
  }
}
