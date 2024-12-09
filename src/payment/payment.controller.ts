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
  UnauthorizedException
} from '@nestjs/common';
import { ZaloPayService } from './zalopay.service';
import { DatabaseService } from '../auth/database/database.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

// Thêm interface cho Request
interface AuthenticatedRequest extends Request {
  user: {
    user_id: number;
  }
}

@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentService: ZaloPayService,
    private readonly prisma: DatabaseService
  ) {}

  // Tạo payment cho booking
  @Post('create/:bookingId')
  @UseGuards(JwtAuthGuard)
  async createPayment(
    @Param('bookingId') bookingId: string,
    @Req() req: AuthenticatedRequest
  ) {
    try {
      // Verify user có quyền thanh toán booking này
      const booking = await this.prisma.booking.findUnique({
        where: { booking_id: Number(bookingId) }
      });

      if (!booking || booking.user_id !== req.user.user_id) {
        throw new UnauthorizedException();
      }

      // Tạo ZaloPay payment
      const payment = await this.paymentService.createPayment(Number(bookingId));
      return payment;

    } catch (error) {
      console.error('Create payment error:', error);
      throw new HttpException(
        error.message || 'Không thể tạo thanh toán',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // Callback từ ZaloPay
  @Post('callback')
  async handleCallback(
    @Body() callbackData: any,
    @Req() req: Request
  ) {
    try {
      console.log('========= CALLBACK RECEIVED =========');
      console.log('Raw callback data:', callbackData);
      console.log('Headers:', req.headers);
      console.log('====================================');

      // Verify callback signature
      const isValid = await this.paymentService.verifyCallback(callbackData);
      console.log('Callback signature valid:', isValid);

      if (!isValid) {
        console.log('Invalid callback signature');
        return {
          return_code: -1,
          return_message: 'mac not equal'
        };
      }

      // Parse data
      const data = JSON.parse(callbackData.data);
      const embedData = JSON.parse(data.embed_data);
      console.log('Parsed callback data:', {data, embedData});

      // Cập nhật trạng thái - Kiểm tra callbackData.type thay vì data.type
      if (callbackData.type === 1) { // Success
        console.log('Payment successful, updating status...');
        await this.paymentService.handlePaymentSuccess(embedData.bookingId);
      } else {
        console.log('Payment failed, updating status...');
        await this.paymentService.handlePaymentFailure(embedData.bookingId);
      }

      return {
        return_code: callbackData.type,
        return_message: callbackData.type === 1 ? 'success' : 'failed'
      };

    } catch (error) {
      console.error('Callback error:', error);
      return {
        return_code: -3,
        return_message: 'internal server error'
      };
    }
  }

  // Kiểm tra trạng thái thanh toán
  @Get('check-status/:bookingId')
  @UseGuards(JwtAuthGuard) 
  async checkPaymentStatus(
    @Param('bookingId') bookingId: string,
    @Req() req: AuthenticatedRequest
  ) {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { booking_id: Number(bookingId) }
      });

      if (!booking || booking.user_id !== req.user.user_id) {
        throw new UnauthorizedException();
      }

      const status = await this.paymentService.checkPaymentStatus(bookingId);
      return status;

    } catch (error) {
      throw new HttpException(
        'Không thể kiểm tra trạng thái thanh toán',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 