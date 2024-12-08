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
      showDate.setHours(0, 0, 0, 0); // Reset giờ về 00:00:00

      // Parse thời gian từ input
      const [startHour, startMinute] = createShowtimeDto.start_time.split(':');
      const [endHour, endMinute] = createShowtimeDto.end_time.split(':');

      // Tạo đối tượng Date cho start_time và end_time
      const startTime = new Date(showDate);
      startTime.setUTCHours(parseInt(startHour), parseInt(startMinute));

      const endTime = new Date(showDate);
      endTime.setUTCHours(parseInt(endHour), parseInt(endMinute));

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
          available_seats: room.capacity,
          status: 'active',
        },
        include: {
          movie: true,
          room: true,
        },
      });

      // Format response
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
        startTime: createShowtimeDto.start_time,  // Trả về thời gian gốc từ input
        endTime: createShowtimeDto.end_time,      // Trả về thời gian gốc từ input
        basePrice: showtime.base_price,
        availableSeats: showtime.available_seats,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async findByMovie(movieId: number, date?: string) {
    try {
      const where: any = {
        movie_id: movieId,
        status: 'active',
      };

      if (date) {
        const searchDate = new Date(date);
        searchDate.setHours(0, 0, 0, 0);
        where.show_date = searchDate;
      }

      const showtimes = await this.prisma.showtime.findMany({
        where,
        select: {
          showtime_id: true,
          show_date: true,
          start_time: true,
          end_time: true,
          base_price: true,
          available_seats: true,
          movie: {
            select: {
              movie_id: true,
              title: true,
            },
          },
          room: {
            select: {
              room_id: true,
              name: true,
            },
          },
        },
        orderBy: [
          { show_date: 'asc' },
          { start_time: 'asc' },
        ],
      });

      return showtimes.map(showtime => ({
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
        startTime: showtime.start_time.toISOString().slice(11, 16),  // Lấy HH:mm từ ISO string
        endTime: showtime.end_time.toISOString().slice(11, 16),      // Lấy HH:mm từ ISO string
        basePrice: showtime.base_price,
        availableSeats: showtime.available_seats,
      }));
    } catch (error) {
      throw new Error('Lỗi khi lấy danh sách lịch chiếu');
    }
  }
} 