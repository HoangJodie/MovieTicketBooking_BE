import { DatabaseService } from "../auth/database/database.service";
import { PaymentStatus, BookingStatus } from "../constants/constants";
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as moment from 'moment';
import { ZaloPayConfig } from "../config/zalo-pay.config";
import * as crypto from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import * as qs from 'qs';

interface ZaloPayRequest {
  app_id: string;
  app_trans_id: string;
  app_user: string;
  app_time: number;
  amount: number;
  description: string;
  bank_code: string;
  callback_url: string;
  item: string;
  embed_data: string;
  mac?: string;
}

interface ZaloPayQueryRequest {
  app_id: string;
  app_trans_id: string;
  mac?: string;
}

@Injectable()
export class ZaloPayService {
  constructor(private readonly prisma: DatabaseService) {}

  private generateMac(data: string, key: string): string {
    return crypto
      .createHmac('sha256', key)
      .update(data)
      .digest('hex');
  }

  async createPayment(bookingId: number) {
    try {
      // Log booking info
      const booking = await this.prisma.booking.findUnique({
        where: { booking_id: bookingId },
        include: {
          user: true,
          bookingdetail: {
            include: { seat: true }
          }
        }
      });
      console.log('Found booking:', booking);

      if (!booking) {
        throw new Error('Booking not found');
      }

      // Tính total_amount nếu chưa có
      if (!booking.total_amount) {
        const totalAmount = new Decimal(
          booking.bookingdetail.reduce((sum, detail) => 
            sum + Number(detail.seat?.price || 0), 0
          )
        );

        // Cập nhật booking
        await this.prisma.booking.update({
          where: { booking_id: bookingId },
          data: {
            total_amount: totalAmount,
            booking_code: `BK${bookingId}_${Date.now()}`
          }
        });

        booking.total_amount = totalAmount;
        booking.booking_code = `BK${bookingId}_${Date.now()}`;
      }

      // Validate amount
      if (Number(booking.total_amount) < 1000) {
        throw new Error('Amount must be at least 1000 VND');
      }

      // Tạo transID ngẫu nhiên
      const transID = Math.floor(Math.random() * 1000000);
      const appTransId = `${moment().format('YYMMDD')}_${transID}`;

      const embed_data = {
        redirecturl: process.env.FRONTEND_URL,
        bookingId: bookingId
      };

      const orderData: ZaloPayRequest = {
        app_id: ZaloPayConfig.app_id,
        app_trans_id: appTransId,
        app_user: booking.user?.email || 'user123',
        app_time: Date.now(),
        amount: Math.floor(Number(booking.total_amount)),
        description: `Cinema - Payment for booking #${booking.booking_code}`,
        bank_code: '',
        callback_url: ZaloPayConfig.callback_url,
        item: JSON.stringify([{
          id: booking.booking_code,
          name: "Movie Ticket", 
          price: Math.floor(Number(booking.total_amount)),
          quantity: 1
        }]),
        embed_data: JSON.stringify(embed_data)
      };

      // Tạo MAC string theo format của ZaloPay
      const data = 
        orderData.app_id + '|' +
        orderData.app_trans_id + '|' +
        orderData.app_user + '|' +
        orderData.amount + '|' +
        orderData.app_time + '|' +
        orderData.embed_data + '|' +
        orderData.item;

      orderData.mac = this.generateMac(data, ZaloPayConfig.key1);

      // Gọi API với params
      const response = await axios.post(
        ZaloPayConfig.endpoint,
        null,
        { params: orderData }
      );

      // Lưu payment record
      await this.prisma.payment.create({
        data: {
          booking_id: bookingId,
          amount: booking.total_amount,
          payment_method: 'zalopay',
          transaction_id: appTransId,
          status: PaymentStatus.PENDING
        }
      });

      return response.data;

    } catch (error) {
      console.error('Create payment error:', error);
      throw error;
    }
  }

  async verifyCallback(callbackData: any): Promise<boolean> {
    return true; // Temporary return
  }

  async checkPaymentStatus(orderId: string) {
    const postData: ZaloPayQueryRequest = {
      app_id: ZaloPayConfig.app_id,
      app_trans_id: orderId
    };

    const data = postData.app_id + '|' + postData.app_trans_id + '|' + ZaloPayConfig.key1;
    postData.mac = this.generateMac(data, ZaloPayConfig.key1);

    const response = await axios.post(
      'https://sb-openapi.zalopay.vn/v2/query',
      qs.stringify(postData),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return response.data;
  }

  async handlePaymentSuccess(bookingId: number) {
    const payment = await this.prisma.payment.findFirst({
      where: { booking_id: bookingId }
    });

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { payment_id: payment.payment_id },
        data: { status: PaymentStatus.COMPLETED }
      }),
      this.prisma.booking.update({
        where: { booking_id: bookingId },
        data: {
          booking_status: BookingStatus.CONFIRMED,
          payment_status: PaymentStatus.COMPLETED
        }
      }),
      this.prisma.seat.updateMany({
        where: {
          bookingdetail: {
            some: {
              booking_id: bookingId
            }
          }
        },
        data: {
          status: 'booked'
        }
      })
    ]);
  }

  async handlePaymentFailure(bookingId: number) {
    const payment = await this.prisma.payment.findFirst({
      where: { booking_id: bookingId }
    });

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { payment_id: payment.payment_id },
        data: { status: PaymentStatus.FAILED }
      }),
      this.prisma.booking.update({
        where: { booking_id: bookingId },
        data: {
          booking_status: BookingStatus.CANCELLED,
          payment_status: PaymentStatus.FAILED
        }
      })
    ]);
  }
} 