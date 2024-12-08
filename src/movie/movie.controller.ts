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
  UseInterceptors,
  UploadedFile,
  Query,
  DefaultValuePipe,
} from '@nestjs/common';
import { MovieService } from './movie.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { Roles } from '../auth/decorators/roles.decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import { GenreService } from './genre.service';
import { CreateShowtimeDto } from './dto/create-showtime.dto';

@Controller('api/v1/movies')
export class MovieController {
  constructor(
    private readonly movieService: MovieService,
    private readonly genreService: GenreService,
  ) {}

  @Get()
  async getAllMovies(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    try {
      const result = await this.movieService.findAll({
        page,
        limit,
        search,
      });

      return {
        status: 'success',
        data: result.data,
        meta: {
          total: result.total,
          page: page,
          last_page: Math.ceil(result.total / limit),
          limit: limit,
        },
      };
    } catch (error) {
      throw new HttpException(
        { status: 'error', message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('genres')
  async getAllGenres() {
    try {
      const genres = await this.genreService.getAllGenres();
      return { status: 'success', data: genres };
    } catch (error) {
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('1')
  @UseInterceptors(FileInterceptor('poster'))
  async createMovie(
    @Body() movieData: any,
    @UploadedFile() poster: Express.Multer.File,
  ) {
    try {
      const movie = await this.movieService.create(movieData, poster);
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
