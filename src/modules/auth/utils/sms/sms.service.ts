import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';

@Injectable()
export class SmsService implements OnModuleInit {
  private readonly logger = new Logger(SmsService.name);
  private client!: Twilio;
  private fromNumber!: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const accountSid = this.configService.getOrThrow<string>('TWILIO_SID');
    const authToken = this.configService.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.configService.getOrThrow<string>('TWILIO_PHONE_NUMBER');

    this.client = twilio(accountSid, authToken);
  }

  async sendSms(to: string, body: string): Promise<void> {
    try {
      const message = await this.client.messages.create({
        body,
        from: this.fromNumber,
        to,
      });

      this.logger.log(`SMS sent to ${to} — SID: ${message.sid}`);
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${to}`, error);
      throw error;
    }
  }
}