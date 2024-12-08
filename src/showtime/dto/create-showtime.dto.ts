import { IsNotEmpty, IsNumber, IsDateString, IsDecimal } from 'class-validator';

export class CreateShowtimeDto {
  @IsNotEmpty()
  @IsNumber()
  movie_id: number;

  @IsNotEmpty()
  @IsNumber()
  room_id: number;

  @IsNotEmpty()
  @IsDateString()
  show_date: string;

  @IsNotEmpty()
  start_time: string; // Format: "HH:mm"

  @IsNotEmpty()
  end_time: string; // Format: "HH:mm"

  @IsNotEmpty()
  @IsDecimal()
  base_price: number;
} 