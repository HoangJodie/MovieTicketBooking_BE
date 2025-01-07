/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcryptjs';
import { AuthModule } from './auth.module';
import { RedisService } from '../redis/redis.service';

interface AuthPayLoad {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private databaseService: DatabaseService,
    private redisService: RedisService,
  ) {}

  async validateUser({ email, password }: AuthPayLoad) {
    console.log('Validating user:', email);
    const user = await this.databaseService.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log('User not found');
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log('Password valid:', isPasswordValid);

    if (!isPasswordValid) return null;

    const { password: _, ...userData } = user;
    return userData;
  }

  async generateTokens(user: any) {
    try {
      const payload = {
        user_id: user.user_id,
        email: user.email,
        role_id: user.role_id,
      };

      const accessToken = this.jwtService.sign(payload);
      const refreshToken = this.jwtService.sign(payload, {
        expiresIn: '7d',
      });

      await this.redisService.set(
        `access_token:${user.user_id}`,
        accessToken,
        60 * 60
      );

      await this.redisService.set(
        `refresh_token:${user.user_id}`,
        refreshToken,
        7 * 24 * 60 * 60
      );

      return { accessToken, refreshToken };
    } catch (error) {
      throw new Error('Failed to generate tokens');
    }
  }

  async logout(userId: number) {
    await this.redisService.del(`access_token:${userId}`);
    await this.redisService.del(`refresh_token:${userId}`);
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const storedToken = await this.redisService.get(
        `refresh_token:${payload.user_id}`
      );

      if (!storedToken || storedToken !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      const newAccessToken = this.jwtService.sign({
        user_id: payload.user_id,
        email: payload.email,
        role_id: payload.role_id,
      });

      await this.redisService.set(
        `access_token:${payload.user_id}`,
        newAccessToken,
        60 * 60
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

  async getStoredRefreshToken(userId: string) {
    const token = await this.redisService.get(`refresh_token:${userId}`);
    return token;
  }

  async getCurrentUser(userId: string) {
    const user = await this.databaseService.user.findUnique({
      where: { user_id: parseInt(userId) }
    });
    
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    
    return user;
  }
}
