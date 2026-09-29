import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service';
import { publicUser } from '../users/users.service';
import { LoginDto, RegisterDto } from './auth.dto';
@Injectable()
export class AuthService {
  constructor(
    private db: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}
  private digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private async tokens(userId: string) {
    const jti = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId, kind: 'access' },
        {
          secret: this.config.getOrThrow('JWT_SECRET'),
          expiresIn: '15m',
          issuer: 'vestora',
          audience: 'vestora-api',
        },
      ),
      this.jwt.signAsync(
        { sub: userId, kind: 'refresh', jti },
        {
          secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
          issuer: 'vestora',
          audience: 'vestora-refresh',
        },
      ),
    ]);
    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      tokenType: 'Bearer',
      record: {
        id: jti,
        userId,
        tokenHash: this.digest(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    };
  }
  async register(dto: RegisterDto) {
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.db.user.create({
      data: { name: dto.name, email: dto.email, baseCurrency: dto.baseCurrency, passwordHash },
      select: publicUser,
    });
    return { user, ...(await this.issue(user.id)) };
  }
  private async issue(userId: string) {
    const { record, ...tokens } = await this.tokens(userId);
    await this.db.refreshToken.create({ data: record });
    return tokens;
  }
  async login(dto: LoginDto) {
    const user = await this.db.user.findUnique({ where: { email: dto.email } });
    const valid = user
      ? await argon2.verify(user.passwordHash, dto.password)
      : (await argon2.hash(dto.password), false);
    if (!user || user.deletedAt || !valid) throw new UnauthorizedException('Invalid credentials');
    return this.issue(user?.id);
  }
  async refresh(token: string) {
    let payload: { sub: string; jti: string; kind: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
        issuer: 'vestora',
        audience: 'vestora-refresh',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.kind !== 'refresh') throw new UnauthorizedException();
    const { record, ...tokens } = await this.tokens(payload.sub);
    await this.db.$transaction(async (tx) => {
      const consumed = await tx.refreshToken.updateMany({
        where: {
          id: payload.jti,
          userId: payload.sub,
          tokenHash: this.digest(token),
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { deletedAt: null },
        },
        data: { revokedAt: new Date() },
      });
      if (consumed.count !== 1)
        throw new UnauthorizedException('Refresh token expired or already used');
      await tx.refreshToken.create({ data: record });
    });
    return tokens;
  }
  async logout(token: string) {
    await this.db.refreshToken.updateMany({
      where: { tokenHash: this.digest(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { loggedOut: true };
  }
}
