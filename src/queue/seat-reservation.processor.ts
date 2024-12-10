import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { DatabaseService } from '../database/database.service';
import { Logger } from '@nestjs/common';

@Processor('seat-reservation')
export class SeatReservationProcessor {
  private readonly logger = new Logger(SeatReservationProcessor.name);

  constructor(private readonly prisma: DatabaseService) {}

  @Process('release-seats')
  async handleReleaseSeat(job: Job) {
    try {
      const { seatIds, showtimeId, bookingId } = job.data;
      this.logger.log(`Starting to process release job ${job.id} for booking ${bookingId}`);
      this.logger.log(`Seats to release: ${seatIds.join(', ')}`);

      // Kiểm tra trạng thái booking
      const booking = await this.prisma.booking.findUnique({
        where: { booking_id: bookingId },
        include: {
          showtime: true
        }
      });

      this.logger.log(`Current booking status: ${booking?.booking_status}`);

      // Chỉ release ghế nếu booking vẫn ở trạng thái pending
      if (booking && booking.booking_status === 'pending') {
        this.logger.log(`Releasing seats for booking ${bookingId}`);
        
        // Lấy trạng thái ghế trước khi update
        const currentSeats = await this.prisma.showtimeseat.findMany({
          where: {
            showtime_id: showtimeId,
            seat_id: { in: seatIds }
          }
        });
        
        this.logger.log('Current seat statuses:', currentSeats.map(s => ({
          seat_id: s.seat_id,
          status: s.status
        })));

        await this.prisma.$transaction([
          // Cập nhật trạng thái ghế về available
          this.prisma.showtimeseat.updateMany({
            where: {
              showtime_id: showtimeId,
              seat_id: { in: seatIds },
              status: 'pending'
            },
            data: { status: 'available' }
          }),

          // Cập nhật trạng thái booking
          this.prisma.booking.update({
            where: { booking_id: bookingId },
            data: {
              booking_status: 'cancelled',
              payment_status: 'cancelled'
            }
          })
        ]);

        // Lấy trạng thái ghế sau khi update
        const updatedSeats = await this.prisma.showtimeseat.findMany({
          where: {
            showtime_id: showtimeId,
            seat_id: { in: seatIds }
          }
        });

        this.logger.log('Updated seat statuses:', updatedSeats.map(s => ({
          seat_id: s.seat_id,
          status: s.status
        })));

        this.logger.log(`Successfully released seats for booking ${bookingId}`);
      } else {
        this.logger.log(`Skipping release for booking ${bookingId} - status is not pending`);
      }
    } catch (error) {
      this.logger.error('Failed to release seats:', error);
      throw error;
    }
  }
} 