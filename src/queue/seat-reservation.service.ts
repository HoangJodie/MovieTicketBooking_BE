import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { DatabaseService } from '../auth/database/database.service';

@Injectable()
export class SeatReservationService {
  constructor(
    @InjectQueue('seat-reservation') private reservationQueue: Queue,
    private readonly prisma: DatabaseService,
  ) {}

  async reserveSeats(userId: number, showtimeId: number, seatIds: number[]) {
    try {
      // Kiểm tra ghế có available không
      const seats = await this.prisma.seat.findMany({
        where: {
          seat_id: {
            in: seatIds,
          },
        },
      });

      const unavailableSeats = seats.filter(seat => seat.status !== 'available');
      if (unavailableSeats.length > 0) {
        throw new BadRequestException('Một số ghế đã được đặt');
      }

      // Cập nhật trạng thái ghế thành pending
      await this.prisma.seat.updateMany({
        where: {
          seat_id: {
            in: seatIds,
          },
        },
        data: {
          status: 'pending',
        },
      });

      // Cập nhật số ghế trống của suất chiếu
      await this.prisma.showtime.update({
        where: {
          showtime_id: showtimeId,
        },
        data: {
          available_seats: {
            decrement: seatIds.length,
          },
        },
      });

      // Thêm job vào queue để release ghế sau 10 phút
      await this.reservationQueue.add(
        'release-seats',
        {
          seatIds,
          showtimeId,
        },
        {
          delay: 10 * 60 * 1000, // 10 phút
        },
      );

      return {
        message: 'Đặt ghế thành công, vui lòng thanh toán trong vòng 10 phút',
        reservedSeats: seatIds,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async confirmPayment(userId: number, showtimeId: number, seatIds: number[]) {
    try {
      // Xóa job release ghế khỏi queue
      const jobs = await this.reservationQueue.getJobs(['delayed']);
      for (const job of jobs) {
        const jobData = job.data;
        if (
          jobData.showtimeId === showtimeId &&
          JSON.stringify(jobData.seatIds) === JSON.stringify(seatIds)
        ) {
          await job.remove();
        }
      }

      // Cập nhật trạng thái ghế thành booked
      await this.prisma.seat.updateMany({
        where: {
          seat_id: {
            in: seatIds,
          },
        },
        data: {
          status: 'booked',
        },
      });

      return {
        message: 'Thanh toán thành công',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async getSeatsForShowtime(showtimeId: number) {
    try {
      console.log("showtimeId"); 
      // Lấy thông tin suất chiếu và phòng
      const showtime = await this.prisma.showtime.findUnique({
        where: { showtime_id: showtimeId },
        include: {
          room: true,
          movie: {
            select: {
              movie_id: true,
              title: true,
            },
          },
        },
      });

      if (!showtime) {
        throw new BadRequestException('Không tìm thấy suất chiếu');
      }

      // Lấy danh sách ghế của phòng
      const seats = await this.prisma.seat.findMany({
        where: { room_id: showtime.room_id },
        orderBy: [
          { row: 'asc' },
          { seat_number: 'asc' },
        ],
      });

      // Format lại dữ liệu theo từng hàng
      const seatsByRow = seats.reduce((acc, seat) => {
        if (!acc[seat.row]) {
          acc[seat.row] = [];
        }
        acc[seat.row].push({
          id: seat.seat_id,
          seatNumber: seat.seat_number,
          type: seat.seat_type,
          price: seat.price,
          status: seat.status,
        });
        return acc;
      }, {});

      return {
        showtime: {
          id: showtime.showtime_id,
          movie: showtime.movie,
          startTime: showtime.start_time.toString().slice(0, 5),
          endTime: showtime.end_time.toString().slice(0, 5),
          basePrice: showtime.base_price,
        },
        room: {
          id: showtime.room.room_id,
          name: showtime.room.name,
          capacity: showtime.room.capacity,
        },
        seats: Object.entries(seatsByRow).map(([row, seats]) => ({
          row,
          seats,
        })),
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
} 