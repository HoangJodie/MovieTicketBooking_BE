import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { Roles } from '../auth/decorators/roles.decorators';
import { Request } from 'express';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // Đăng ký tài khoản mới - không cần xác thực
  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return await this.userService.createUser(createUserDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: Request) {
    const userId = req.user['user_id'];
    return await this.userService.getUserProfile(userId);
  }

  // Các endpoint dưới đây yêu cầu quyền admin
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('1')
  async getAllUsers() {
    return await this.userService.getAllUsers();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('1')
  async getUserById(@Param('id') id: string) {
    return await this.userService.getUserById(Number(id));
  }

  @Put(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('1')
  async updateUserStatus(
    @Param('id') id: string,
    @Body('status') status: 'active' | 'inactive',
  ) {
    return await this.userService.updateUserStatus(Number(id), status);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('1')
  async deleteUser(@Param('id') id: string) {
    return await this.userService.deleteUser(Number(id));
  }

  
} 