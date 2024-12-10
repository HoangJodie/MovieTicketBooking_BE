import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { DatabaseService } from 'src/database/database.service';
import { RedisService } from '../redis/redis.service';
import { ConfirmBookingDto } from '../booking/dto/confirm-booking.dto';

@Injectable()
export class SeatReservationService {
  private temporarySelections: Map<string, { seatIds: number[], timestamp: number }> = new Map();
  private readonly logger = new Logger(SeatReservationService.name);

  constructor(
    @InjectQueue('seat-reservation') private reservationQueue: Queue,
    private readonly prisma: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async initiateBooking(userId: number, showtimeId: number, seatIds: number[]) {
    try {
      // Kiểm tra trạng thái ghế trong suất chiếu
      const showtimeSeats = await this.prisma.showtimeseat.findMany({
        where: {
          showtime_id: showtimeId,
          seat_id: { in: seatIds },
        },
      });

      // Kiểm tra ghế không available
      const unavailableSeats = showtimeSeats.filter(seat => seat.status !== 'available');
      if (unavailableSeats.length > 0) {
        throw new BadRequestException('Một số ghế đã được đặt, vui lòng chọn ghế khác');
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

        // Xóa booking details và booking trong transaction
        await this.prisma.$transaction([
          this.prisma.bookingdetail.deleteMany({
            where: { booking_id: oldPendingBooking.booking_id }
          }),
          this.prisma.booking.delete({
            where: { booking_id: oldPendingBooking.booking_id }
          }),
          // Cập nhật lại trạng thái ghế cũ về available
          this.prisma.showtimeseat.updateMany({
            where: {
              showtime_id: showtimeId,
              seat_id: { 
                in: oldPendingBooking.bookingdetail.map(d => d.seat_id) 
              }
            },
            data: { status: 'available' }
          })
        ]);
      }

      // Tạo booking mới và cập nhật trạng thái ghế trong transaction
      const booking = await this.prisma.$transaction(async (prisma) => {
        // Tạo booking mới
        const newBooking = await prisma.booking.create({
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

        // Cập nhật trạng thái ghế trong showtimeseat
        await prisma.showtimeseat.updateMany({
          where: {
            showtime_id: showtimeId,
            seat_id: { in: seatIds }
          },
          data: {
            status: 'pending'
          }
        });

        return newBooking;
      });

      // Lưu thông tin quyền sở hữu ghế vào Redis
      for (const seatId of seatIds) {
        const key = `seat:${showtimeId}:${seatId}`;
        await this.redis.set(key, userId.toString(), 60); // Sửa lại thành 600 giây (10 phút)
      }

      // Thêm job release ghế vào queue với logging
      const job = await this.reservationQueue.add(
        'release-seats',
        {
          bookingId: booking.booking_id,
          seatIds,
          showtimeId,
        },
        {
          delay: 6 * 10000, // 6 giây
        }
      );

      this.logger.log(`Created release job ${job.id} for booking ${booking.booking_id}`);
      this.logger.log(`Seats will be released in 6 seconds at ${new Date(Date.now() + 6 * 1000)}`);

      // Thêm listener để log quá trình đếm ngược mỗi giây
      const remainingTime = setInterval(async () => {
        const currentJob = await this.reservationQueue.getJob(job.id);
        if (currentJob) {
          const timeLeft = Math.ceil((currentJob.opts.delay - (Date.now() - currentJob.timestamp)) / 1000);
          if (timeLeft > 0) {
            this.logger.log(`⏰ Time remaining for booking ${booking.booking_id}: ${timeLeft} seconds`);
          } else {
            this.logger.log(`⚠️ Time's up for booking ${booking.booking_id}! Processing release...`);
            clearInterval(remainingTime);
          }
        } else {
          this.logger.log(`🔄 Job completed for booking ${booking.booking_id}`);
          clearInterval(remainingTime);
        }
      }, 1000); // Log mỗi giây

      return {
        message: 'Đặt ghế thành công, vui lòng thanh toán trong vòng 6 giây',
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

      // Lấy tất cả các ghế của phòng và trạng thái của chúng trong suất chiếu này
      const seats = await this.prisma.seat.findMany({
        where: { room_id: showtime.room_id },
        include: {
          showtimeseat: {
            where: { showtime_id: showtimeId }
          }
        },
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

        // Lấy trạng thái ghế từ showtimeseat
        const showtimeSeat = seat.showtimeseat[0]; // Chỉ có 1 bản ghi do where showtime_id
        const seatStatus = showtimeSeat?.status || 'available';

        // Kiểm tra xem ghế có thuộc booking pending của user không
        const isUserPendingSeat = userPendingBooking?.bookingdetail?.some(
          detail => detail.seat_id === seat.seat_id
        );

        acc[seat.row].push({
          id: seat.seat_id,
          seatNumber: seat.seat_number,
          type: seat.seat_type,
          price: seat.price,
          status: isUserPendingSeat ? 'available' : seatStatus,
          isSelected: isUserPendingSeat
        });
        return acc;
      }, {});

      // Format startTime
      const startTime = showtime.start_time;
      const startUtcTime = new Date(startTime).toUTCString();
      const startHours = new Date(startUtcTime).getUTCHours().toString().padStart(2, '0');
      const startMinutes = new Date(startUtcTime).getUTCMinutes().toString().padStart(2, '0');
      const formattedStartTime = `${startHours}:${startMinutes}`;

      // Format endTime
      const endTime = showtime.end_time;
      const endUtcTime = new Date(endTime).toUTCString();
      const endHours = new Date(endUtcTime).getUTCHours().toString().padStart(2, '0');
      const endMinutes = new Date(endUtcTime).getUTCMinutes().toString().padStart(2, '0');
      const formattedEndTime = `${endHours}:${endMinutes}`;

      return {
        showtime: {
          id: showtime.showtime_id,
          movie: showtime.movie,
          startTime: formattedStartTime,
          endTime: formattedEndTime,
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

      // Cập nh���t trạng thái ghế về available
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
          bookingdetail: true
        }
      });

      if (!pendingBooking) {
        throw new BadRequestException('Không tìm thấy đơn đặt chỗ đang chờ');
      }

      // Kiểm tra xem ghế có thuộc booking này không
      const bookingDetail = pendingBooking.bookingdetail.find(
        detail => detail.seat_id === seatId
      );

      if (!bookingDetail) {
        throw new BadRequestException('Ghế không thuộc đơn đặt chỗ của bạn');
      }

      // Kiểm tra trạng thái ghế trong showtimeseat
      const showtimeSeat = await this.prisma.showtimeseat.findFirst({
        where: {
          showtime_id: showtimeId,
          seat_id: seatId
        }
      });

      if (!showtimeSeat || showtimeSeat.status !== 'pending') {
        throw new BadRequestException('Ghế không thể hủy vì đã thay đổi trạng thái');
      }

      // Bắt đầu transaction
      await this.prisma.$transaction(async (prisma) => {
        // Cập nhật trạng thái ghế về available trong showtimeseat
        await prisma.showtimeseat.update({
          where: {
            showtime_id_seat_id: {
              showtime_id: showtimeId,
              seat_id: seatId
            }
          },
          data: {
            status: 'available'
          }
        });

        // Xóa th��ng tin quyền sở hữu ghế khỏi Redis
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

      // Lấy danh sách ghế còn lại
      const remainingSeats = await this.prisma.bookingdetail.findMany({
        where: {
          booking_id: pendingBooking.booking_id
        },
        include: {
          seat: true
        }
      });

      return {
        status: 'success',
        message: 'Đã hủy ghế thành công',
        data: {
          remainingSeats: remainingSeats.map(detail => ({
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
      throw new NotFoundException('Không tìm thấy suất chi���u');
    }

    // Tìm booking pending của user
    const pendingBooking = await this.prisma.booking.findFirst({
      where: {
        user_id: userId,
        showtime_id: showtimeId,
        booking_status: 'pending',
      },
    });

    if (!pendingBooking) {
      throw new BadRequestException('Không tìm thấy booking đang chờ');
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
          id: pendingBooking.booking_id,
          customer: {
            name: user.full_name || '',
            email: user.email,
          },
          movie: {
            title: showtime.movie.title,
            posterUrl: showtime.movie.poster_url,
          },
          showtime: {
            id: showtime.showtime_id,
            showDate: showtime.show_date,
            startTime: showtime.start_time.toString().slice(0, 5),
          },
          room: {
            name: showtime.room.name,
          },
          seats: formattedSeats,
          basePrice: showtime.base_price,
          totalAmount,
        },
      },
    };
  }

  async getTicketsByUser(userId: number) {
    try {
      const bookings = await this.prisma.booking.findMany({
        where: {
          user_id: userId,
          booking_status: 'confirmed',
          payment_status: 'completed'
        },
        include: {
          showtime: {
            include: {
              movie: {
                select: {
                  movie_id: true,
                  title: true,
                  poster_url: true
                }
              },
              room: {
                select: {
                  room_id: true,
                  name: true
                }
              }
            }
          },
          bookingdetail: {
            include: {
              seat: true
            }
          }
        },
        orderBy: {
          booking_date: 'desc'
        }
      });

      return {
        status: 'success',
        data: bookings.map(booking => {
          // Format thời gian
          const startTime = booking.showtime.start_time;
          // Chuyển đổi Date object thành chuỗi thời gian UTC
          const utcTime = new Date(startTime).toUTCString();
          // Lấy giờ và phút từ chuỗi UTC
          const hours = new Date(utcTime).getUTCHours().toString().padStart(2, '0');
          const minutes = new Date(utcTime).getUTCMinutes().toString().padStart(2, '0');
          const formattedTime = `${hours}:${minutes}`;

          return {
            booking_id: booking.booking_id,
            booking_code: booking.booking_code,
            booking_date: new Date(booking.booking_date).toLocaleDateString('vi-VN'),
            total_amount: booking.total_amount,
            movie: {
              id: booking.showtime.movie.movie_id,
              title: booking.showtime.movie.title,
              poster_url: booking.showtime.movie.poster_url
            },
            showtime: {
              id: booking.showtime.showtime_id,
              show_date: new Date(booking.showtime.show_date).toLocaleDateString('vi-VN'),
              start_time: formattedTime,
              room: {
                id: booking.showtime.room.room_id,
                name: booking.showtime.room.name
              }
            },
            seats: booking.bookingdetail.map(detail => ({
              seat_id: detail.seat.seat_id,
              row: detail.seat.row,
              seat_number: detail.seat.seat_number,
              price: detail.price,
              ticket_code: detail.ticket_code
            }))
          };
        })
      };
    } catch (error) {
      throw new BadRequestException('Không thể lấy danh sách vé');
    }
  }
} 