import {
  Controller,
  Post,
  Body,
  UseGuards,
  Param,
  ParseIntPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ShowtimeService } from './showtime.service';
import { CreateShowtimeDto } from './dto/create-showtime.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { Roles } from '../auth/decorators/roles.decorators';

@Controller('api/v1/showtimes')
export class ShowtimeController {
  constructor(private readonly showtimeService: ShowtimeService) {}

  @Post('movies/:movieId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('1')
  async create(
    @Param('movieId', ParseIntPipe) movieId: number,
    @Body() createShowtimeDto: CreateShowtimeDto,
  ) {
    try {
      createShowtimeDto.movie_id = movieId;
      const showtime = await this.showtimeService.create(createShowtimeDto);
      return {
        status: 'success',
        data: showtime,
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          message: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
} 