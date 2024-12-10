import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class RoomService {
  constructor(private readonly prisma: DatabaseService) {}

  async findAll() {
    try {
      console.log('Fetching rooms from database...');
      
      const rooms = await this.prisma.room.findMany({
        where: {
          status: 'active',
        },
        select: {
          room_id: true,
          name: true,
          capacity: true,
        },
        orderBy: {
          name: 'asc',
        },
      });

      console.log('Found rooms:', rooms);
      return rooms;
      
    } catch (error) {
      console.error('Error fetching rooms:', error);
      throw new InternalServerErrorException('Lỗi khi lấy danh sách phòng');
    }
  }
} 