import { Controller, Post, Body, Req, UseGuards, Get, Param, ParseIntPipe, BadRequestException, Query, Put } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { SeatReservationService } from '../queue/seat-reservation.service';

@Controller('api/v1/bookings')
export class BookingController {
  constructor(
    private readonly seatReservationService: SeatReservationService,
  ) {}

  @Post('initiate-booking')
  @UseGuards(JwtAuthGuard)
  async initiateBooking(
    @Req() req,
    @Body() data: { showtimeId: number; seatIds: number[] },
  ) {
    try {
      return await this.seatReservationService.initiateBooking(
        req.user.user_id,
        data.showtimeId,
        data.seatIds,
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Put('update-selected-seats')
  @UseGuards(JwtAuthGuard)
  async updateSelectedSeats(
    @Req() req,
    @Body() data: { showtimeId: number; seatIds: number[] },
  ) {
    try {
      return await this.seatReservationService.updateSelectedSeats(
        req.user.user_id,
        data.showtimeId,
        data.seatIds,
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('confirm')
  @UseGuards(JwtAuthGuard)
  async getBookingConfirmation(
    @Req() req,
    @Query('showtimeId', ParseIntPipe) showtimeId: number,
    @Query('seatIds') seatIdsString: string,
  ) {
    try {
      const seatIds = seatIdsString.split(',').map(Number);
      return await this.seatReservationService.getBookingConfirmation(
        req.user.user_id,
        showtimeId,
        seatIds,
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('cancel-seat')
  @UseGuards(JwtAuthGuard)
  async cancelSeat(
    @Req() req,
    @Body() data: { showtimeId: number; seatId: number },
  ) {
    try {
      return await this.seatReservationService.cancelSeat(
        req.user.user_id,
        data.showtimeId,
        data.seatId,
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('showtimes/:showtimeId/seats')
  async getSeatsForShowtime(
    @Param('showtimeId', ParseIntPipe) showtimeId: number,
    @Req() req,
  ) {
    const userId = req.user?.user_id;
    return {
      status: 'success',
      data: await this.seatReservationService.getSeatsForShowtime(showtimeId, userId),
    };
  }

  @Get('my-tickets')
  @UseGuards(JwtAuthGuard)
  async getMyTickets(@Req() req) {
    try {
      const userId = req.user.user_id;
      return await this.seatReservationService.getTicketsByUser(userId);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
} 