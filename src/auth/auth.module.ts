/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from './guards/roles.guards';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    PassportModule,
    JwtModule.register({
      secret: 'rhehebeheh34635y',
      signOptions: {
        expiresIn: AuthModule.getAccessTokenExpiration(), // Lấy thời gian hết hạn từ phương thức
      },
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy, RolesGuard],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {
  // Thời gian hết hạn của access token
  static readonly accessTokenExpiration = '10m'; 
  // Thời gian hết hạn của refresh token
  static readonly refreshTokenExpiration = '7d'; 

  // Cung cấp thời gian cho access token
  static getAccessTokenExpiration() {
    return this.accessTokenExpiration;
  }

  // Cung cấp thời gian cho refresh token
  static getRefreshTokenExpiration() {
    return this.refreshTokenExpiration;
  }
}
