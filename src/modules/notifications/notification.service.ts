// notifications/notification.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SnsService, PushPayload } from './sns.service';

export type NotificationType =
  | 'new_follower'
  | 'new_order'
  | 'order_status'
  | 'new_message'
  | 'new_like'
  | 'new_comment';

type SendNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sns: SnsService,
  ) {}

  /**
   * Persists the notification to the inbox and pushes to all
   * active devices concurrently. Stale endpoints are cleaned up automatically.
   */
  async send(input: SendNotificationInput): Promise<void> {
    const { userId, type, title, body, data } = input;

    // Always persist to inbox — push delivery is best-effort
    await this.prisma.notification.create({
      data: { userId, type, title, body, data: data ?? {}, read: false },
    });

    const devices = await this.prisma.deviceToken.findMany({
      where: { userId, endpointArn: { not: null } },
    });

    if (!devices.length) return;

    const payload: PushPayload = { title, body, data };

    const results = await Promise.allSettled(
      devices.map((device) =>
        this.sns.sendToEndpoint(device.endpointArn!, payload).then((ok) => ({
          ok,
          device,
        })),
      ),
    );

    // Clean up stale endpoints without blocking the response
    const stale = results
      .filter(
        (r): r is PromiseFulfilledResult<{ ok: boolean; device: any }> =>
          r.status === 'fulfilled' && !r.value.ok,
      )
      .map((r) => r.value.device);

    if (stale.length) {
      await Promise.allSettled(
        stale.map(async (device) => {
          await this.sns.deleteEndpoint(device.endpointArn!);
          await this.prisma.deviceToken.delete({ where: { id: device.id } });
          this.logger.log(`Removed stale device token: ${device.id}`);
        }),
      );
    }
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async getInbox(userId: string, page = 1, limit = 20) {
    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);

    return { notifications, unreadCount, page, limit };
  }
}