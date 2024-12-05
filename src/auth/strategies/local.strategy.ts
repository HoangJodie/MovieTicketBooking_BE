import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from 'passport-local';
import { AuthService } from "../auth.service";
import { Injectable, UnauthorizedException } from "@nestjs/common";

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super(); // Không cần truyền role vào super() vì chúng ta chỉ sử dụng username và password
  }

  async validate(username: string, password: string) {
    const user = await this.authService.validateUser({ username, password });
    if (!user) throw new UnauthorizedException(); // Nếu không tìm thấy người dùng, trả về lỗi không được phép
    return user; // Trả về thông tin người dùng
  }
}
