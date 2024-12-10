import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { MovieModule } from './movie/movie.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ShowtimeModule } from './showtime/showtime.module';
import { RoomModule } from './room/room.module';
import { BookingModule } from './booking/booking.module';
import { PaymentModule } from './payment/payment.module';

@Module({
  imports: [
    DatabaseModule, 
    MovieModule, 
    AuthModule, 
    UserModule,
    ShowtimeModule,
    RoomModule,
    BookingModule,
    PaymentModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
