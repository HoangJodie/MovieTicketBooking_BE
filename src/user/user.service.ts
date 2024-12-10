import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UserService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createUser(createUserDto: CreateUserDto) {
    // Kiểm tra email đã tồn tại
    const existingUser = await this.databaseService.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // Tạo user mới
    const newUser = await this.databaseService.user.create({
      data: {
        email: createUserDto.email,
        password: hashedPassword,
        full_name: createUserDto.full_name,
        phone_number: createUserDto.phone,
        role_id: 2, // Mặc định là user thường
        status: 'active',
      },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        phone_number: true,
        role_id: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    });

    return newUser;
  }

  async getAllUsers() {
    return await this.databaseService.user.findMany({
      select: {
        user_id: true,
        email: true,
        full_name: true,
        phone_number: true,
        role_id: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async getUserById(userId: number) {
    const user = await this.databaseService.user.findUnique({
      where: { user_id: userId },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        phone_number: true,
        role_id: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateUserStatus(userId: number, status: 'active' | 'inactive') {
    const user = await this.databaseService.user.update({
      where: { user_id: userId },
      data: { status },
      select: {
        user_id: true,
        email: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async deleteUser(userId: number) {
    try {
      await this.databaseService.user.delete({
        where: { user_id: userId },
      });
      return { message: 'User deleted successfully' };
    } catch (error) {
      throw new NotFoundException('User not found');
    }
  }

  async getUserProfile(userId: number) {
    const user = await this.databaseService.user.findUnique({
      where: { user_id: userId },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        phone_number: true,
        email_verified: true,
        created_at: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
} 