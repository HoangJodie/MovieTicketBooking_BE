import { ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Observable } from "rxjs";

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt'){
    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        console.log('JwtAuthGuard: Checking token...');
        return super.canActivate(context)
    }

    handleRequest(err, user, info) {
        console.log('JwtAuthGuard: Error:', err);
        console.log('JwtAuthGuard: User:', user);
        console.log('JwtAuthGuard: Info:', info);
        
        if (err || !user) {
            throw err || new UnauthorizedException();
        }
        return user;
    }
}