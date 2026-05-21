import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';


@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  createGuest(deviceId?: string) {
    return this.prisma.session.create({
      data: {
        deviceId,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });
  }

  setRole(sessionId: string, role: string) {
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { role },
    });
  }

  attachUser(sessionId: string, userId: string) {
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { userId },
    });
  }
}

