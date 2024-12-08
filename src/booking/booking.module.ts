import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [BookingController],
})
export class BookingModule {} 