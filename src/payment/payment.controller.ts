import { 
  Controller, 
  Post, 
  Body, 
  Param, 
  Get,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  ParseIntPipe
} from '@nestjs/common';
import { ZaloPayService } from './zalopay.service';
import { DatabaseService } from '../database/database.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: {
    user_id: number;
  }
}

@Controller('api/v1/payments')
export class PaymentController {
  constructor(
    private readonly paymentService: ZaloPayService,
    private readonly prisma: DatabaseService
  ) {}

  @Get('status/:bookingId')
  @UseGuards(JwtAuthGuard)
  async checkPaymentStatus(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Req() req: AuthenticatedRequest
  ) {
    try {
      console.log('Checking payment status for booking:', bookingId);
      console.log('User:', req.user);

      const booking = await this.prisma.booking.findUnique({
        where: { booking_id: bookingId },
        include: {
          payment: true
        }
      });

      console.log('Found booking:', booking);

      if (!booking) {
        throw new HttpException('Booking not found', HttpStatus.NOT_FOUND);
      }

      if (booking.user_id !== req.user.user_id) {
        throw new UnauthorizedException();
      }

      return {
        return_code: booking.payment_status === 'completed' ? 1 : 0,
        data: {
          booking_status: booking.booking_status,
          payment_status: booking.payment_status,
          amount: booking.total_amount
        }
      };
    } catch (error) {
      console.error('Error checking payment status:', error);
      throw new HttpException(
        error.message || 'Không thể kiểm tra trạng thái thanh toán',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  
  // Tạo payment cho booking
  @Post('orders/zalopay')
  @UseGuards(JwtAuthGuard)
  async createPayment(
    @Body() data: { bookingId: number },
    @Req() req: AuthenticatedRequest
  ) {
    try {
      console.log('Creating ZaloPay order for booking:', data.bookingId);
      console.log('User:', req.user);

      const booking = await this.prisma.booking.findUnique({
        where: { booking_id: data.bookingId }
      });

      if (!booking) {
        throw new HttpException('Booking not found', HttpStatus.NOT_FOUND);
      }

      if (booking.user_id !== req.user.user_id) {
        throw new UnauthorizedException();
      }

      const payment = await this.paymentService.createPayment(data.bookingId);
      return payment;

    } catch (error) {
      console.error('Create payment error:', error);
      throw new HttpException(
        error.message || 'Không thể tạo thanh toán',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // Callback từ ZaloPay
  @Post('callback')
  async handleCallback(@Body() callbackData: any) {
    try {
      console.log('ZaloPay callback received in controller:', callbackData);

      const data = JSON.parse(callbackData.data);
      const embedData = JSON.parse(data.embed_data);
      const bookingId = embedData.bookingId;

      console.log('Parsed data:', {
        data,
        embedData,
        bookingId
      });

      if (callbackData.type === 1) {
        console.log('Processing successful payment...');
        await this.paymentService.handlePaymentSuccess(bookingId);
        return {
          return_code: 1,
          return_message: 'success'
        };
      } else {
        console.log('Processing failed payment...');
        await this.paymentService.handlePaymentFailure(bookingId);
        return {
          return_code: 0,
          return_message: 'failed'
        };
      }
    } catch (error) {
      console.error('Callback processing error:', error);
      return {
        return_code: -1,
        return_message: error.message
      };
    }
  }

  
} 