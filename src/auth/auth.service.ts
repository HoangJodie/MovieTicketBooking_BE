/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthPayLoad } from './dto/auth.dto';
import { DatabaseService } from 'src/database/database.service'; // Sử dụng DatabaseService
import * as bcrypt from 'bcryptjs'; // Import bcrypt để so sánh mật khẩu đã mã hóa
import { AuthModule } from './auth.module';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private databaseService: DatabaseService,
  ) {}

  // Xác thực người dùng và kiểm tra mật khẩu đã mã hóa
  async validateUser({ username, password }: AuthPayLoad) {
    // Tìm người dùng bằng username
    const user = await this.databaseService.user.findFirst({
      where: { username },
    });

    if (!user) return null;

    // So sánh mật khẩu đã nhập với mật khẩu đã mã hóa trong database
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return null; // Nếu mật khẩu không hợp lệ, trả về null

    const { password: userPassword, ...userData } = user;
    return userData; // Trả về thông tin người dùng (không bao gồm mật khẩu)
  }

  // auth.service.ts
  generateTokens(user: any) {
    try {
      const accessToken = this.jwtService.sign(
        {
          user_id: user.user_id,
          username: user.username,
          role: user.role_id,
        },
        { expiresIn: AuthModule.accessTokenExpiration },
      );
  
      const refreshToken = this.jwtService.sign(
        {
          user_id: user.user_id,
          username: user.username,
          role: user.role_id,
        },
        { expiresIn: AuthModule.refreshTokenExpiration },
      );
  
      return { accessToken, refreshToken };
    } catch (error) {
      console.error('Error generating tokens:', error.message);
      throw new Error('Failed to generate tokens');
    }
  }
  

  // Xử lý refresh token
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken); // Xác thực refresh token
      const newAccessToken = this.jwtService.sign(
        {
          user_id: payload.user_id,
          username: payload.username,
          role: payload.role,
        },
        { expiresIn: '15m' }, // Tạo access token mới
      );
      return newAccessToken;
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }


  async verifyToken(token: string) {
    try {
      const decoded = await this.jwtService.verify(token);
      return decoded;
    } catch (error) {
      console.error('Token verification error:', error);
      return null;
    }
  }
}
