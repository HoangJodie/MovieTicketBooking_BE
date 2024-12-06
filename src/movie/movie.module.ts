import { Module } from '@nestjs/common';
import { MovieController } from './movie.controller';
import { MovieService } from './movie.service';
import { DatabaseService } from '../auth/database/database.service';

@Module({
  controllers: [MovieController],
  providers: [MovieService, DatabaseService],
})
export class MovieModule {}
