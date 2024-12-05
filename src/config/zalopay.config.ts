interface ZaloPayConfigInterface {
  app_id: string;
  key1: string;
  key2: string;
  endpoint: string;
  callback_url: string;
}

export const ZaloPayConfig: ZaloPayConfigInterface = {
  app_id: process.env.ZALOPAY_APPID || '',
  key1: process.env.ZALOPAY_KEY1 || '',
  key2: process.env.ZALOPAY_KEY2 || '',
  endpoint: process.env.ZALOPAY_ENDPOINT || 'https://sb-openapi.zalopay.vn/v2/create',
  callback_url: process.env.ZALOPAY_CALLBACK_URL || ''
};

// Validate config khi khởi động ứng dụng
Object.entries(ZaloPayConfig).forEach(([key, value]) => {
  if (!value) {
    throw new Error(`Missing ZaloPay config: ${key}`);
  }
}); 