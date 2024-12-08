import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../auth/database/database.service';
import { CreateShowtimeDto } from './dto/create-showtime.dto';

@Injectable()
export class ShowtimeService {
  constructor(private readonly prisma: DatabaseService) {}

  async create(createShowtimeDto: CreateShowtimeDto) {
    try {
      // Kiểm tra phim tồn tại
      const movie = await this.prisma.movie.findUnique({
        where: { movie_id: createShowtimeDto.movie_id },
      });

      if (!movie) {
        throw new BadRequestException('Phim không tồn tại');
      }

      // Kiểm tra phòng tồn tại
      const room = await this.prisma.room.findUnique({
        where: { room_id: createShowtimeDto.room_id },
      });

      if (!room) {
        throw new BadRequestException('Phòng không tồn tại');
      }

      // Chuyển đổi thời gian
      const showDate = new Date(createShowtimeDto.show_date);
      const [startHour, startMinute] = createShowtimeDto.start_time.split(':');
      const [endHour, endMinute] = createShowtimeDto.end_time.split(':');

      const startTime = new Date(showDate);
      startTime.setHours(parseInt(startHour), parseInt(startMinute));

      const endTime = new Date(showDate);
      endTime.setHours(parseInt(endHour), parseInt(endMinute));

      // Kiểm tra xung đột lịch chiếu
      const conflictShowtime = await this.prisma.showtime.findFirst({
        where: {
          room_id: createShowtimeDto.room_id,
          show_date: showDate,
          OR: [
            {
              AND: [
                { start_time: { lte: startTime } },
                { end_time: { gt: startTime } },
              ],
            },
            {
              AND: [
                { start_time: { lt: endTime } },
                { end_time: { gte: endTime } },
              ],
            },
          ],
        },
      });

      if (conflictShowtime) {
        throw new BadRequestException(
          'Phòng đã có lịch chiếu trong khoảng thời gian này',
        );
      }

      // Tạo lịch chiếu mới
      const showtime = await this.prisma.showtime.create({
        data: {
          movie_id: createShowtimeDto.movie_id,
          room_id: createShowtimeDto.room_id,
          show_date: showDate,
          start_time: startTime,
          end_time: endTime,
          base_price: createShowtimeDto.base_price,
          available_seats: room.capacity, // Số ghế trống ban đầu bằng sức chứa phòng
          status: 'active',
        },
        include: {
          movie: true,
          room: true,
        },
      });

      return {
        id: showtime.showtime_id,
        movie: {
          id: showtime.movie.movie_id,
          title: showtime.movie.title,
        },
        room: {
          id: showtime.room.room_id,
          name: showtime.room.name,
        },
        showDate: showtime.show_date,
        startTime: showtime.start_time,
        endTime: showtime.end_time,
        basePrice: showtime.base_price,
        availableSeats: showtime.available_seats,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
} 