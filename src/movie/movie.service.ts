import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../auth/database/database.service';

@Injectable()
export class MovieService {
  constructor(private readonly prisma: DatabaseService) {}

  async findAll() {
    try {
      const movies = await this.prisma.movie.findMany({
        where: { status: 'active' },
        include: {
          moviegenre: {
            include: { genre: true },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      if (!movies.length) {
        throw new NotFoundException('Không có phim nào trong hệ thống');
      }

      return movies.map((movie) => ({
        id: movie.movie_id,
        title: movie.title,
        description: movie.description,
        duration: movie.duration,
        releaseDate: movie.release_date,
        poster: movie.poster_url,
        trailer: movie.trailer_url,
        director: movie.director,
        cast: movie.cast,
        language: movie.language,
        subtitle: movie.subtitle,
        genres: movie.moviegenre.map((mg) => mg.genre.name),
      }));
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new Error('Lỗi khi lấy danh sách phim');
    }
  }

  async findOne(id: number) {
    try {
      const movie = await this.prisma.movie.findUnique({
        where: { movie_id: id },
        include: {
          moviegenre: {
            include: { genre: true },
          },
          showtime: {
            where: {
              show_date: { gte: new Date() },
              status: 'active',
            },
            include: { room: true },
          },
        },
      });

      if (!movie) throw new NotFoundException('Không tìm thấy phim');

      return {
        id: movie.movie_id,
        title: movie.title,
        description: movie.description,
        duration: movie.duration,
        releaseDate: movie.release_date,
        poster: movie.poster_url,
        trailer: movie.trailer_url,
        director: movie.director,
        cast: movie.cast,
        language: movie.language,
        subtitle: movie.subtitle,
        genres: movie.moviegenre.map((mg) => mg.genre.name),
        showtimes: movie.showtime.map((st) => ({
          id: st.showtime_id,
          showDate: st.show_date,
          startTime: st.start_time,
          endTime: st.end_time,
          basePrice: st.base_price,
          availableSeats: st.available_seats,
          room: {
            id: st.room.room_id,
            name: st.room.name,
          },
        })),
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new Error('Lỗi khi lấy thông tin phim');
    }
  }

  async create(movieData: any) {
    try {
      // Kiểm tra dữ liệu đầu vào
      if (
        !movieData.title ||
        !movieData.duration ||
        !movieData.releaseDate ||
        !movieData.genreIds?.length
      ) {
        throw new Error(
          'Thiếu thông tin bắt buộc: title, duration, releaseDate, genreIds',
        );
      }

      // Kiểm tra genres có tồn tại
      const genres = await this.prisma.genre.findMany({
        where: {
          genre_id: {
            in: movieData.genreIds,
          },
        },
      });

      if (genres.length !== movieData.genreIds.length) {
        throw new Error('Một số genre không tồn tại trong hệ thống');
      }

      const movie = await this.prisma.movie.create({
        data: {
          title: movieData.title,
          description: movieData.description,
          duration: movieData.duration,
          release_date: new Date(movieData.releaseDate),
          poster_url: movieData.poster,
          trailer_url: movieData.trailer,
          director: movieData.director,
          cast: movieData.cast,
          language: movieData.language,
          subtitle: movieData.subtitle,
          moviegenre: {
            create: movieData.genreIds.map((genreId: number) => ({
              genre: { connect: { genre_id: genreId } },
            })),
          },
        },
        include: {
          moviegenre: {
            include: {
              genre: true,
            },
          },
        },
      });

      // Format lại dữ liệu trả về
      return {
        id: movie.movie_id,
        title: movie.title,
        description: movie.description,
        duration: movie.duration,
        releaseDate: movie.release_date,
        poster: movie.poster_url,
        trailer: movie.trailer_url,
        director: movie.director,
        cast: movie.cast,
        language: movie.language,
        subtitle: movie.subtitle,
        genres: movie.moviegenre.map((mg) => mg.genre.name),
      };
    } catch (error) {
      console.error('Create movie error:', error);
      throw new Error(error.message || 'Lỗi khi tạo phim mới');
    }
  }

  async update(id: number, movieData: any) {
    try {
      // Xóa các genre cũ
      await this.prisma.moviegenre.deleteMany({
        where: { movie_id: id },
      });

      const movie = await this.prisma.movie.update({
        where: { movie_id: id },
        data: {
          title: movieData.title,
          description: movieData.description,
          duration: movieData.duration,
          release_date: new Date(movieData.releaseDate),
          poster_url: movieData.poster,
          trailer_url: movieData.trailer,
          director: movieData.director,
          cast: movieData.cast,
          language: movieData.language,
          subtitle: movieData.subtitle,
          moviegenre: {
            create: movieData.genreIds.map((genreId: number) => ({
              genre: { connect: { genre_id: genreId } },
            })),
          },
        },
      });

      return movie;
    } catch (error) {
      throw new Error('Lỗi khi cập nhật phim');
    }
  }

  async delete(id: number) {
    try {
      await this.prisma.movie.update({
        where: { movie_id: id },
        data: { status: 'inactive' },
      });
      return { message: 'Xóa phim thành công' };
    } catch (error) {
      throw new Error('Lỗi khi xóa phim');
    }
  }
}
