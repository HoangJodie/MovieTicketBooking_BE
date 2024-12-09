import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { DatabaseService } from '../auth/database/database.service';
import { RedisService } from '../redis/redis.service';
import { ConfirmBookingDto } from '../booking/dto/confirm-booking.dto';

@Injectable()
export class SeatReservationService {
  private temporarySelections: Map<string, { seatIds: number[], timestamp: number }> = new Map();

  constructor(
    @InjectQueue('seat-reservation') private reservationQueue: Queue,
    private readonly prisma: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async initiateBooking(userId: number, showtimeId: number, seatIds: number[]) {
    try {
      // Kiểm tra xem ghế có available không
      const seats = await this.prisma.seat.findMany({
        where: {
          seat_id: { in: seatIds },
        },
      });

      const unavailableSeats = seats.filter(seat => seat.status !== 'available');
      if (unavailableSeats.length > 0) {
        throw new BadRequestException('Một số ghế đã đư���c đặt, vui lòng chọn ghế khác');
      }

      // Hủy booking pending cũ của user nếu có
      const oldPendingBooking = await this.prisma.booking.findFirst({
        where: {
          user_id: userId,
          showtime_id: showtimeId,
          booking_status: 'pending',
        },
        include: {
          bookingdetail: true
        }
      });

      if (oldPendingBooking) {
        // Xóa job release cũ
        const jobs = await this.reservationQueue.getJobs(['delayed']);
        for (const job of jobs) {
          if (job.data.bookingId === oldPendingBooking.booking_id) {
            await job.remove();
          }
        }

        // Xóa booking details trước
        await this.prisma.bookingdetail.deleteMany({
          where: {
            booking_id: oldPendingBooking.booking_id
          }
        });

        // Sau đó mới xóa booking
        await this.prisma.booking.delete({
          where: { booking_id: oldPendingBooking.booking_id }
        });
      }

      // Tạo booking mới với trạng thái pending
      const booking = await this.prisma.booking.create({
        data: {
          user_id: userId,
          showtime_id: showtimeId,
          booking_status: 'pending',
          bookingdetail: {
            create: seatIds.map(seatId => ({
              seat_id: seatId
            }))
          }
        }
      });

      // Cập nhật trạng thái ghế thành pending
      await this.prisma.seat.updateMany({
        where: {
          seat_id: { in: seatIds }
        },
        data: {
          status: 'pending'
        }
      });

      // Lưu thông tin quyền sở hữu ghế vào Redis
      for (const seatId of seatIds) {
        const key = `seat:${showtimeId}:${seatId}`;
        await this.redis.set(key, userId.toString(), 600); // Hết hạn sau 10 phút
      }

      // Thêm job release ghế vào queue
      await this.reservationQueue.add(
        'release-seats',
        {
          bookingId: booking.booking_id,
          seatIds,
          showtimeId,
        },
        {
          delay: 10 * 60 * 1000, // 10 phút
        }
      );

      return {
        message: 'Đặt ghế thành công, vui lòng thanh toán trong vòng 10 phút',
        reservedSeats: seatIds,
        bookingId: booking.booking_id
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async updateSelectedSeats(userId: number, showtimeId: number, newSeatIds: number[]) {
    try {
      // Tìm booking pending hiện tại của user
      const currentBooking = await this.prisma.booking.findFirst({
        where: {
          user_id: userId,
          showtime_id: showtimeId,
          booking_status: 'pending',
        },
        include: {
          bookingdetail: true
        }
      });

      if (!currentBooking) {
        throw new BadRequestException('Không tìm thấy đơn đặt chỗ đang chờ');
      }

      // Lấy danh sách ghế hiện tại
      const currentSeatIds = currentBooking.bookingdetail.map(detail => detail.seat_id);

      // Kiểm tra các ghế mới có available không
      const newSeats = newSeatIds.filter(id => !currentSeatIds.includes(id));
      if (newSeats.length > 0) {
        const seats = await this.prisma.seat.findMany({
          where: {
            seat_id: { in: newSeats },
          },
        });

        const unavailableSeats = seats.filter(seat => seat.status !== 'available');
        if (unavailableSeats.length > 0) {
          throw new BadRequestException('Một số ghế mới đã được đặt, vui lòng chọn ghế khác');
        }
      }

      // Xóa booking details cũ
      await this.prisma.bookingdetail.deleteMany({
        where: {
          booking_id: currentBooking.booking_id
        }
      });

      // Cập nhật trạng thái các ghế cũ thành available
      await this.prisma.seat.updateMany({
        where: {
          seat_id: { in: currentSeatIds }
        },
        data: {
          status: 'available'
        }
      });

      // Tạo booking details mới
      await this.prisma.bookingdetail.createMany({
        data: newSeatIds.map(seatId => ({
          booking_id: currentBooking.booking_id,
          seat_id: seatId
        }))
      });

      // Cập nhật trạng thái các ghế mới thành pending
      await this.prisma.seat.updateMany({
        where: {
          seat_id: { in: newSeatIds }
        },
        data: {
          status: 'pending'
        }
      });

      return {
        message: 'Cập nhật ghế thành công',
        newSeatIds
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

  async getSeatsForShowtime(showtimeId: number, userId?: number) {
    try {
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

      // Lấy booking pending của user hiện tại
      const userPendingBooking = userId ? await this.prisma.booking.findFirst({
        where: {
          user_id: userId,
          showtime_id: showtimeId,
          booking_status: 'pending',
        },
        include: {
          bookingdetail: {
            select: {
              seat_id: true
            }
          }
        },
        orderBy: {
          booking_date: 'desc'
        }
      }) : null;

      // Lấy tất cả các ghế của phòng
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

        // Kiểm tra xem ghế có thuộc booking pending của user không
        const isUserPendingSeat = userPendingBooking?.bookingdetail?.some(
          detail => detail.seat_id === seat.seat_id
        );

        // Nếu là ghế của user đang pending -> available để có thể chọn lại
        // Nếu không -> giữ nguyên status
        const seatStatus = isUserPendingSeat ? 'available' : seat.status;

        acc[seat.row].push({
          id: seat.seat_id,
          seatNumber: seat.seat_number,
          type: seat.seat_type,
          price: seat.price,
          status: seatStatus,
          isSelected: isUserPendingSeat // Thêm flag để frontend biết ghế đã được chọn trước đó
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

  async cancelBooking(userId: number, showtimeId: number) {
    try {
      // Tìm booking pending của user
      const pendingBooking = await this.prisma.booking.findFirst({
        where: {
          user_id: userId,
          showtime_id: showtimeId,
          booking_status: 'pending',
        },
        include: {
          bookingdetail: true
        }
      });

      if (!pendingBooking) {
        throw new BadRequestException('Không tìm thấy đơn đặt chỗ đang chờ');
      }

      // Xóa job release cũ
      const jobs = await this.reservationQueue.getJobs(['delayed']);
      for (const job of jobs) {
        if (job.data.bookingId === pendingBooking.booking_id) {
          await job.remove();
        }
      }

      // Lấy danh sách seat_ids
      const seatIds = pendingBooking.bookingdetail.map(detail => detail.seat_id);

      // Cập nhật trạng thái ghế về available
      await this.prisma.seat.updateMany({
        where: {
          seat_id: {
            in: seatIds
          }
        },
        data: {
          status: 'available'
        }
      });

      // Xóa booking details trước
      await this.prisma.bookingdetail.deleteMany({
        where: {
          booking_id: pendingBooking.booking_id
        }
      });

      // Xóa thông tin quyền sở hữu ghế khỏi Redis
      for (const seatId of seatIds) {
        const key = `seat:${showtimeId}:${seatId}`;
        await this.redis.del(key);
      }

      // Sau đó mới xóa booking
      await this.prisma.booking.delete({
        where: { booking_id: pendingBooking.booking_id }
      });

      return {
        status: 'success',
        message: 'Đã hủy đơn đặt chỗ thành công'
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async cancelSeat(userId: number, showtimeId: number, seatId: number) {
    try {
      // Tìm booking pending của user với showtime cụ thể
      const pendingBooking = await this.prisma.booking.findFirst({
        where: {
          user_id: userId,
          showtime_id: showtimeId,
          booking_status: 'pending',
        },
        include: {
          bookingdetail: {
            include: {
              seat: true
            }
          }
        }
      });

      if (!pendingBooking) {
        throw new BadRequestException('Ghế đang được chọn');
      }

      // Kiểm tra xem ghế có thuộc booking này không
      const bookingDetail = pendingBooking.bookingdetail.find(
        detail => detail.seat_id === seatId
      );

      if (!bookingDetail) {
        throw new BadRequestException('Ghế không thuộc đơn đặt chỗ của bạn');
      }

      // Kiểm tra trạng thái ghế
      if (bookingDetail.seat.status !== 'pending') {
        throw new BadRequestException('Ghế không thể hủy vì đã thay đổi trạng thái');
      }

      // Bắt đầu transaction
      await this.prisma.$transaction(async (prisma) => {
        // Cập nhật trạng thái ghế về available
        await prisma.seat.update({
          where: {
            seat_id: seatId,
          },
          data: {
            status: 'available'
          }
        });

        // Xóa thông tin quyền sở hữu ghế khỏi Redis
        const key = `seat:${showtimeId}:${seatId}`;
        await this.redis.del(key);

        // Xóa booking detail của ghế đó
        await prisma.bookingdetail.deleteMany({
          where: {
            AND: {
              booking_id: pendingBooking.booking_id,
              seat_id: seatId
            }
          }
        });

        // Kiểm tra xem còn booking detail nào không
        const remainingDetails = await prisma.bookingdetail.count({
          where: {
            booking_id: pendingBooking.booking_id
          }
        });

        // Nếu không còn booking detail nào
        if (remainingDetails === 0) {
          // Xóa job release khỏi queue
          const jobs = await this.reservationQueue.getJobs(['delayed']);
          for (const job of jobs) {
            if (job.data.bookingId === pendingBooking.booking_id) {
              await job.remove();
            }
          }

          // Xóa booking
          await prisma.booking.delete({
            where: {
              booking_id: pendingBooking.booking_id
            }
          });
        }
      });

      return {
        status: 'success',
        message: 'Đã hủy ghế thành công',
        data: {
          remainingSeats: pendingBooking.bookingdetail
            .filter(detail => detail.seat_id !== seatId)
            .map(detail => ({
              id: detail.seat_id,
              seatNumber: detail.seat.seat_number,
              row: detail.seat.row,
              price: detail.seat.price
            }))
        }
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async confirmBooking(userId: number, confirmBookingDto: ConfirmBookingDto) {
    const { showtimeId, customerName, customerEmail, seats } = confirmBookingDto;

    const showtime = await this.prisma.showtime.findFirst({
      where: { showtime_id: showtimeId },
      include: { movie: true, room: true }
    });

    if (!showtime) {
      throw new NotFoundException('Không tìm thấy suất chiếu');
    }

    const seatIds = seats.map(seat => seat.seatId);
    for (const seatId of seatIds) {
      const key = `seat:${showtimeId}:${seatId}`;
      const reservedUserId = await this.redis.get(key);
      if (!reservedUserId || Number(reservedUserId) !== userId) {
        throw new BadRequestException('Một số ghế không còn khả dụng');
      }
    }

    const booking = await this.prisma.booking.create({
      data: {
        user_id: userId,
        showtime_id: showtimeId,
        total_amount: seats.reduce((sum, seat) => sum + seat.price, 0),
        booking_status: 'pending_payment',
        payment_status: 'pending',
        booking_code: Math.random().toString(36).substring(7)
      }
    });

    await this.prisma.bookingdetail.createMany({
      data: seats.map(seat => ({
        booking_id: booking.booking_id,
        seat_id: seat.seatId,
        price: seat.price
      }))
    });

    return {
      status: 'success',
      data: {
        confirmation: {
          id: booking.booking_id,
          customerName,
          customerEmail,
          totalAmount: booking.total_amount,
          movie: { title: showtime.movie.title },
          showtime: {
            showDate: showtime.show_date,
            startTime: showtime.start_time
          },
          room: { name: showtime.room.name },
          seats: seats.map(seat => ({
            seatNumber: seat.seatNumber,
            rowName: seat.rowName,
            price: seat.price
          })),
          status: booking.booking_status,
          createdAt: booking.booking_date
        }
      }
    };
  }

  async getBookingConfirmation(userId: number, showtimeId: number, seatIds: number[]) {
    // Kiểm tra showtime
    const showtime = await this.prisma.showtime.findFirst({
      where: { showtime_id: showtimeId },
      include: {
        movie: true,
        room: true,
      },
    });

    if (!showtime) {
      throw new NotFoundException('Không tìm thấy suất chiếu');
    }

    // Kiểm tra ghế
    const seats = await this.prisma.seat.findMany({
      where: {
        seat_id: { in: seatIds },
      },
    });

    if (seats.length !== seatIds.length) {
      throw new BadRequestException('Một số ghế không tồn tại');
    }

    // Kiểm tra quyền sở hữu ghế
    for (const seatId of seatIds) {
      const key = `seat:${showtimeId}:${seatId}`;
      const reservedUserId = await this.redis.get(key);
      if (!reservedUserId || Number(reservedUserId) !== userId) {
        throw new BadRequestException('Một số ghế không thuộc quyền kiểm soát của bạn');
      }
    }

    // Lấy thông tin user
    const user = await this.prisma.user.findFirst({
      where: { user_id: userId },
    });

    // Tính tổng tiền
    const totalAmount = seats.reduce((sum, seat) => sum + Number(seat.price), 0);

    // Format thông tin ghế
    const formattedSeats = seats.map(seat => ({
      seatId: seat.seat_id,
      seatNumber: seat.seat_number,
      rowName: seat.row,
      price: seat.price,
    }));

    return {
      status: 'success',
      data: {
        confirmation: {
          showtime: {
            id: showtime.showtime_id,
            showDate: showtime.show_date,
            startTime: showtime.start_time,
            endTime: showtime.end_time,
          },
          movie: {
            id: showtime.movie.movie_id,
            title: showtime.movie.title,
            posterUrl: showtime.movie.poster_url,
          },
          room: {
            id: showtime.room.room_id,
            name: showtime.room.name,
          },
          customer: {
            name: user.full_name || '',
            email: user.email,
          },
          seats: formattedSeats,
          totalAmount,
          basePrice: showtime.base_price,
        },
      },
    };
  }
} 