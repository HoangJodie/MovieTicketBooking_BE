import { IsNumber, IsString, IsArray, ValidateNested, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

class SeatDetail {
  @IsNumber()
  seatId: number;

  @IsString()
  seatNumber: string;

  @IsString()
  rowName: string;

  @IsNumber()
  price: number;
}

export class ConfirmBookingDto {
  @IsNumber()
  showtimeId: number;

  @IsString()
  customerName: string;

  @IsEmail()
  customerEmail: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatDetail)
  seats: SeatDetail[];
} 