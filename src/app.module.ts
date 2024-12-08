import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './auth/database/database.module';
import { MovieModule } from './movie/movie.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ShowtimeModule } from './showtime/showtime.module';
import { RoomModule } from './room/room.module';

@Module({
  imports: [
    DatabaseModule, 
    MovieModule, 
    AuthModule, 
    UserModule,
    ShowtimeModule,
    RoomModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
