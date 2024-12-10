import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { DatabaseService } from '../database/database.service';

@Processor('seat-reservation')
export class SeatReservationProcessor {
  constructor(private readonly prisma: DatabaseService) {}

  @Process('release-seats')
  async handleReleaseSeat(job: Job) {
    const { seatIds, showtimeId } = job.data;

    try {
      // Cập nhật trạng thái ghế về available trong suất chiếu
      await this.prisma.showtimeseat.updateMany({
        where: {
          showtime_id: showtimeId,
          seat_id: {
            in: seatIds,
          },
        },
        data: {
          status: 'available',
        },
      });

      // Cập nhật số ghế trống của suất chiếu
      await this.prisma.showtime.update({
        where: {
          showtime_id: showtimeId,
        },
        data: {
          available_seats: {
            increment: seatIds.length,
          },
        },
      });
    } catch (error) {
      console.error('Failed to release seats:', error);
    }
  }
} 