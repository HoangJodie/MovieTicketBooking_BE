/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from './database/database.service';
import * as bcrypt from 'bcryptjs';
import { AuthModule } from './auth.module';

interface AuthPayLoad {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private databaseService: DatabaseService,
  ) {}

  async validateUser({ email, password }: AuthPayLoad) {
    const user = await this.databaseService.user.findUnique({
      where: { email },
    });

    if (!user) return null;

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return null;

    const { password: _, ...userData } = user;
    return userData;
  }

  generateTokens(user: any) {
    try {
      const payload = {
        user_id: user.user_id,
        email: user.email,
        role_id: user.role_id,
        full_name: user.full_name,
      };

      const accessToken = this.jwtService.sign(payload, {
        expiresIn: AuthModule.accessTokenExpiration,
      });

      const refreshToken = this.jwtService.sign(payload, {
        expiresIn: AuthModule.refreshTokenExpiration,
      });

      return { accessToken, refreshToken };
    } catch (error) {
      console.error('Error generating tokens:', error.message);
      throw new Error('Failed to generate tokens');
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await this.databaseService.user.findUnique({
        where: { user_id: payload.user_id },
      });

      if (!user || user.status !== 'active') {
        throw new Error('User not found or inactive');
      }

      const newAccessToken = this.jwtService.sign(
        {
          user_id: user.user_id,
          email: user.email,
          role_id: user.role_id,
          full_name: user.full_name,
        },
        { expiresIn: '15m' },
      );

      return newAccessToken;
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async verifyToken(token: string) {
    try {
      const decoded = await this.jwtService.verify(token);
      const user = await this.databaseService.user.findUnique({
        where: { user_id: decoded.user_id },
      });

      if (!user || user.status !== 'active') {
        return null;
      }

      return decoded;
    } catch (error) {
      console.error('Token verification error:', error);
      return null;
    }
  }
}
