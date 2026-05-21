// notifications/device-token.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SnsService } from './sns.service';

type RegisterTokenInput = {
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
};

@Injectable()
export class DeviceTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sns: SnsService,
  ) {}

  async register(input: RegisterTokenInput): Promise<void> {
    const { userId, token, platform } = input;

    // Register with SNS and get endpoint ARN
    const endpointArn = await this.sns.registerEndpoint(token, platform);

    // Upsert — same token re-registering (e.g. app reinstall) just refreshes the ARN
    await this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform, endpointArn, updatedAt: new Date() },
      create: { userId, token, platform, endpointArn },
    });
  }

  async unregister(userId: string, token: string): Promise<void> {
    const device = await this.prisma.deviceToken.findUnique({ where: { token } });

    if (!device || device.userId !== userId) return;

    if (device.endpointArn) {
      await this.sns.deleteEndpoint(device.endpointArn);
    }

    await this.prisma.deviceToken.delete({ where: { token } });
  }
}