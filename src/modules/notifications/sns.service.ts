// notifications/sns.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SNSClient,
  CreatePlatformEndpointCommand,
  PublishCommand,
  DeleteEndpointCommand,
} from '@aws-sdk/client-sns';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

@Injectable()
export class SnsService implements OnModuleInit {
  private readonly logger = new Logger(SnsService.name);
  private client!: SNSClient;

  // Platform Application ARNs — created once in AWS SNS console
  private iosArn!: string;
  private androidArn!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new SNSClient({
      region: this.config.getOrThrow<string>('AWS_SNS_REGION'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('AWS_SNS_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('AWS_SNS_SECRET_ACCESS_KEY'),
      },
    });

    this.iosArn = this.config.getOrThrow<string>('AWS_SNS_IOS_PLATFORM_ARN');
    this.androidArn = this.config.getOrThrow<string>('AWS_SNS_ANDROID_PLATFORM_ARN');
  }

  /**
   * Registers a device token with SNS and returns the endpoint ARN.
   * If the token already has an endpoint, SNS returns the existing ARN.
   */
  async registerEndpoint(token: string, platform: string): Promise<string> {
    const platformArn = platform === 'ios' ? this.iosArn : this.androidArn;

    const command = new CreatePlatformEndpointCommand({
      PlatformApplicationArn: platformArn,
      Token: token,
    });

    const response = await this.client.send(command);
    return response.EndpointArn!;
  }

  /**
   * Sends a push notification to a single SNS endpoint ARN.
   * Returns false if the endpoint is stale/invalid so the caller can clean it up.
   */
  async sendToEndpoint(endpointArn: string, payload: PushPayload): Promise<boolean> {
    const message = this.buildMessage(payload);

    try {
      await this.client.send(
        new PublishCommand({
          TargetArn: endpointArn,
          Message: message,
          MessageStructure: 'json',
        }),
      );
      return true;
    } catch (error: any) {
      // EndpointDisabled means the token is stale — signal the caller to delete it
      if (error.code === 'EndpointDisabled') {
        this.logger.warn(`Stale endpoint detected: ${endpointArn}`);
        return false;
      }
      throw error;
    }
  }

  async deleteEndpoint(endpointArn: string): Promise<void> {
    await this.client.send(
      new DeleteEndpointCommand({ EndpointArn: endpointArn }),
    );
  }

  private buildMessage(payload: PushPayload): string {
    const { title, body, data = {} } = payload;

    // SNS requires a JSON string with per-platform keys
    return JSON.stringify({
      APNS: JSON.stringify({
        aps: { alert: { title, body }, sound: 'default' },
        ...data,
      }),
      APNS_SANDBOX: JSON.stringify({
        aps: { alert: { title, body }, sound: 'default' },
        ...data,
      }),
      GCM: JSON.stringify({
        notification: { title, body },
        data,
      }),
    });
  }
}