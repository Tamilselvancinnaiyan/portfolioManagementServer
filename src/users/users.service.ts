import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export const publicUser = {
  id: true,
  name: true,
  email: true,
  baseCurrency: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private db: PrismaService) {}
  me(id: string) {
    return this.db.user.findFirstOrThrow({ where: { id, deletedAt: null }, select: publicUser });
  }
}
