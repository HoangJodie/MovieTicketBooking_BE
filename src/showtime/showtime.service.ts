import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
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

      // Kiểm tra phòng tồn tại và lấy danh sách ghế
      const room = await this.prisma.room.findUnique({
        where: { room_id: createShowtimeDto.room_id },
        include: {
          seat: true // Lấy thêm thông tin các ghế trong phòng
        }
      });

      if (!room) {
        throw new BadRequestException('Phòng không tồn tại');
      }

      // Chuyển đổi thời gian
      const showDate = new Date(createShowtimeDto.show_date);
      showDate.setHours(0, 0, 0, 0);

      const [startHour, startMinute] = createShowtimeDto.start_time.split(':');
      const [endHour, endMinute] = createShowtimeDto.end_time.split(':');

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

      // Tạo suất chiếu mới trong transaction
      const showtime = await this.prisma.$transaction(async (prisma) => {
        // 1. Tạo suất chiếu
        const newShowtime = await prisma.showtime.create({
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

        // 2. Tạo các bản ghi showtimeseat cho tất cả ghế trong phòng
        await prisma.showtimeseat.createMany({
          data: room.seat.map(seat => ({
            showtime_id: newShowtime.showtime_id,
            seat_id: seat.seat_id,
            status: 'available'
          }))
        });

        return newShowtime;
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
        startTime: createShowtimeDto.start_time,
        endTime: createShowtimeDto.end_time,
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