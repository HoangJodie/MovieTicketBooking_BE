import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../auth/database/database.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

interface FindAllParams {
  page: number;
  limit: number;
  search?: string;
}

@Injectable()
export class MovieService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async findAll({ page, limit, search }: FindAllParams) {
    try {
      const skip = (page - 1) * limit;

      // Tạo điều kiện tìm kiếm
      const where = {
        status: 'active',
        ...(search && {
          OR: [
            { title: { contains: search } },
            { description: { contains: search } },
            { director: { contains: search } },
            { cast: { contains: search } },
          ],
        }),
      };

      // Đếm tổng số phim thỏa điều kiện
      const total = await this.prisma.movie.count({ where });

      // Lấy danh sách phim có phân trang
      const movies = await this.prisma.movie.findMany({
        where,
        include: {
          moviegenre: {
            include: { genre: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      });

      // Format dữ liệu trả về
      const formattedMovies = movies.map((movie) => ({
        id: movie.movie_id,
        title: movie.title,
        description: movie.description,
        duration: movie.duration,
        releaseDate: movie.release_date,
        poster: movie.poster_url,
        director: movie.director,
        cast: movie.cast,
        language: movie.language,
        subtitle: movie.subtitle,
        genres: movie.moviegenre.map((mg) => mg.genre.name),
      }));

      return {
        data: formattedMovies,
        total,
      };
    } catch (error) {
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

  async create(movieData: any, poster?: Express.Multer.File) {
    try {
      // Kiểm tra dữ liệu đầu vào
      if (
        !movieData.title ||
        !movieData.duration ||
        !movieData.releaseDate ||
        !movieData.genreIds
      ) {
        throw new Error(
          'Thiếu thông tin bắt buộc: title, duration, releaseDate, genreIds',
        );
      }

      // Chuyển genreIds từ string sang array
      let genreIds;
      try {
        genreIds = typeof movieData.genreIds === 'string' 
          ? JSON.parse(movieData.genreIds)
          : movieData.genreIds;
      } catch (error) {
        throw new Error('genreIds không đúng định dạng. Phải là array hoặc JSON string của array');
      }

      if (!Array.isArray(genreIds)) {
        throw new Error('genreIds phải là một mảng các ID');
      }

      // Upload poster lên Cloudinary nếu có
      let posterUrl = null;
      if (poster) {
        const uploadResult = await this.cloudinaryService.uploadImage(poster);
        posterUrl = uploadResult.secure_url;
      }

      const movie = await this.prisma.movie.create({
        data: {
          title: movieData.title,
          description: movieData.description,
          duration: parseInt(movieData.duration),
          release_date: new Date(movieData.releaseDate),
          poster_url: posterUrl,
          director: movieData.director,
          cast: movieData.cast,
          language: movieData.language,
          subtitle: movieData.subtitle,
          moviegenre: {
            create: genreIds.map((genreId: number) => ({
              genre: { connect: { genre_id: Number(genreId) } },
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

      return {
        id: movie.movie_id,
        title: movie.title,
        description: movie.description,
        duration: movie.duration,
        releaseDate: movie.release_date,
        poster: movie.poster_url,
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
