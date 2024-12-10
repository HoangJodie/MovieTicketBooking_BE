import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class GenreService {
  constructor(private readonly prisma: DatabaseService) {}

  async getAllGenres() {
    try {
      const genres = await this.prisma.genre.findMany({
        select: {
          genre_id: true,
          name: true,
          description: true,
        },
      });

      return genres;
    } catch (error) {
      throw new Error('Lỗi khi lấy danh sách thể loại phim');
    }
  }
} 