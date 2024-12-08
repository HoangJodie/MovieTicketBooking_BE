import { Controller, Post, Body, Req, UseGuards, Get, Param, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { SeatReservationService } from '../queue/seat-reservation.service';

@Controller('api/v1/bookings')
export class BookingController {
  constructor(
    private readonly seatReservationService: SeatReservationService,
  ) {}

  @Post('reserve-seats')
  @UseGuards(JwtAuthGuard)
  async reserveSeats(
    @Req() req,
    @Body() data: { showtimeId: number; seatIds: number[] },
  ) {
    return await this.seatReservationService.reserveSeats(
      req.user.user_id,
      data.showtimeId,
      data.seatIds,
    );
  }

  @Post('confirm-payment')
  @UseGuards(JwtAuthGuard)
  async confirmPayment(
    @Req() req,
    @Body() data: { showtimeId: number; seatIds: number[] },
  ) {
    return await this.seatReservationService.confirmPayment(
      req.user.user_id,
      data.showtimeId,
      data.seatIds,
    );
  }

  @Get('showtimes/:showtimeId/seats')
  async getSeatsForShowtime(@Param('showtimeId', ParseIntPipe) showtimeId: number) {
    return {
      status: 'success',
      data: await this.seatReservationService.getSeatsForShowtime(showtimeId),
    };
  }
} 