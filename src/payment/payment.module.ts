import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { ZaloPayService } from './zalopay.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BullModule.registerQueue({
      name: 'seat-reservation',
    }),
  ],
  controllers: [PaymentController],
  providers: [ZaloPayService],
  exports: [ZaloPayService]
})
export class PaymentModule {} 