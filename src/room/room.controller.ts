import { 
  Controller, 
  Get, 
  UseGuards, 
  Req,
  HttpException,
  HttpStatus 
} from '@nestjs/common';
import { RoomService } from './room.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { Roles } from '../auth/decorators/roles.decorators';
import { Request } from 'express';

@Controller('api/v1/rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {
    console.log('RoomController initialized');
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('1')
  async getAllRooms(@Req() req: Request) {
    console.log('Request received in getAllRooms');
    
    try {
      console.log('Starting getAllRooms...');
      console.log('User from request:', req.user);
      
      const rooms = await this.roomService.findAll();
      console.log('Rooms from database:', rooms);

      // Kiểm tra mảng rỗng thay vì null
      if (!rooms || rooms.length === 0) {
        throw new HttpException(
          {
            status: 'error',
            message: 'Không tìm thấy phòng nào',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      console.log('Returning success response');
      return {
        status: 'success',
        data: rooms,
      };

    } catch (error) {
      console.error('Error in getAllRooms:', error);
      
      // Log chi tiết lỗi
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          status: 'error',
          message: error.message || 'Internal server error',
          details: process.env.NODE_ENV === 'development' ? error : undefined
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
} 