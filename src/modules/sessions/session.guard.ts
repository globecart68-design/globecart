import { PrismaService } from '../../prisma/prisma.service';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return false;

    const session = await this.prisma.session.findUnique({ where: { id: token } });
    if (!session) return false;

    req.session = session;
    return true;
  }
}
