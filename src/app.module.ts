import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './auth/database/database.module';
import { MovieModule } from './movie/movie.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [DatabaseModule, MovieModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
