import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SeatReservationProcessor } from './seat-reservation.processor';
import { SeatReservationService } from './seat-reservation.service';
import { DatabaseModule } from '../auth/database/database.module';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
    BullModule.registerQueue({
      name: 'seat-reservation',
    }),
    DatabaseModule,
  ],
  providers: [SeatReservationProcessor, SeatReservationService],
  exports: [SeatReservationService],
})
export class QueueModule {} 