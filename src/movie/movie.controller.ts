import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpException,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { MovieService } from './movie.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { Roles } from '../auth/decorators/roles.decorators';

@Controller('api/v1/movies')
export class MovieController {
  constructor(private readonly movieService: MovieService) {}

  @Get()
  async getAllMovies() {
    try {
      const movies = await this.movieService.findAll();
      return { status: 'success', data: movies };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException(
          { status: 'error', message: error.message },
          HttpStatus.NOT_FOUND,
        );
      }
      throw new HttpException(
        { status: 'error', message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async getMovieById(@Param('id', ParseIntPipe) id: number) {
    try {
      const movie = await this.movieService.findOne(id);
      return { status: 'success', data: movie };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException(
          { status: 'error', message: error.message },
          HttpStatus.NOT_FOUND,
        );
      }
      throw new HttpException(
        { status: 'error', message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  //   @UseGuards(JwtAuthGuard, RolesGuard)
  //   @Roles('1')
  async createMovie(@Body() movieData: any) {
    try {
      const movie = await this.movieService.create(movieData);
      return { status: 'success', data: movie };
    } catch (error) {
      throw new HttpException(
        { status: 'error', message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('1')
  async updateMovie(
    @Param('id', ParseIntPipe) id: number,
    @Body() movieData: any,
  ) {
    try {
      const movie = await this.movieService.update(id, movieData);
      return { status: 'success', data: movie };
    } catch (error) {
      throw new HttpException(
        { status: 'error', message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('1')
  async deleteMovie(@Param('id', ParseIntPipe) id: number) {
    try {
      const result = await this.movieService.delete(id);
      return { status: 'success', message: result.message };
    } catch (error) {
      throw new HttpException(
        { status: 'error', message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
