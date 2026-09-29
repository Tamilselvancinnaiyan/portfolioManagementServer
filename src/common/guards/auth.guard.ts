import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private config: ConfigService,
    private db: PrismaService,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride('public', [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow('JWT_SECRET'),
        algorithms: ['HS256'],
        issuer: 'vestora',
        audience: 'vestora-api',
      });
      if (payload.kind !== 'access' || typeof payload.sub !== 'string') throw new Error();
      const user = await this.db.user.findFirst({
        where: { id: payload.sub, deletedAt: null },
        select: { id: true },
      });
      if (!user) throw new Error();
      req.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
