import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { ZaloPayService } from './zalopay.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule
  ],
  controllers: [PaymentController],
  providers: [ZaloPayService],
  exports: [ZaloPayService]
})
export class PaymentModule {} 