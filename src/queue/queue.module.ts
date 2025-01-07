import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SeatReservationProcessor } from './seat-reservation.processor';
import { SeatReservationService } from './seat-reservation.service';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';

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
      defaultJobOptions: {
        removeOnComplete: true,
        attempts: 3
      }
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
  ],
  providers: [SeatReservationProcessor, SeatReservationService],
  exports: [SeatReservationService],
})
export class QueueModule {} 