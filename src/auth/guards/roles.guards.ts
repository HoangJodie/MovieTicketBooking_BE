import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const roles = this.reflector.get<string[]>('roles', context.getHandler());
        console.log('Required roles:', roles);

        if (!roles) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;
        console.log('User in RolesGuard:', user);

        if (!user || !user.role_id) {
            console.log('Missing user or role_id');
            return false;
        }

        const hasRole = roles.includes(user.role_id.toString());
        console.log('Has required role:', hasRole);
        
        return hasRole;
    }
}
