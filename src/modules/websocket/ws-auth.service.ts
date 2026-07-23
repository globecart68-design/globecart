import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload, AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { Socket } from 'socket.io';

/**
 * Socket.IO connections never go through Nest's HTTP guard pipeline, so the
 * gateway verifies the JWT itself on `handleConnection` — same secret/payload
 * shape as JwtStrategy, just invoked manually.
 */
@Injectable()
export class WsAuthService {
  private readonly logger = new Logger(WsAuthService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticate(client: Socket): Promise<AuthenticatedUser | null> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      this._fromAuthHeader(client);

    if (!token) return null;

    try {
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: process.env.JWT_SECRET || 'dev_secret',
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return null;

      return { ...user, activeRole: payload.activeRole, roles: payload.roles };
    } catch (err) {
      this.logger.debug(`WS auth failed: ${(err as Error).message}`);
      return null;
    }
  }

  private _fromAuthHeader(client: Socket): string | undefined {
    const header = client.handshake.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length);
  }
}
