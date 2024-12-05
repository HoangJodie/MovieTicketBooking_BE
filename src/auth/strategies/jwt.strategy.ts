import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Injectable } from "@nestjs/common";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'rhehebeheh34635y',
    });
  }

  validate(payload: any) {
    return {
      user_id: payload.user_id,
      username: payload.username, // Bao gồm username
      role: payload.role,
    };
  }  
}

