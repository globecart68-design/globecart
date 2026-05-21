import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: Transporter;
  private fromAddress!: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.fromAddress = this.configService.getOrThrow<string>('SMTP_FROM');

    this.transporter = nodemailer.createTransport({
      host: this.configService.getOrThrow<string>('SMTP_HOST'),
      port: this.configService.getOrThrow<number>('SMTP_PORT'),
      secure: Number(this.configService.get<string>('SMTP_PORT')) === 465,
      auth: {
        user: this.configService.getOrThrow<string>('SMTP_USER'),
        pass: this.configService.getOrThrow<string>('SMTP_PASS'),
      },
    });
  }

  async sendEmail(to: string, subject: string, text: string, html?: string): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        text,
        html,
      });

      this.logger.log(`Email sent to ${to} — MessageId: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to} — Subject: "${subject}"`, error);
      throw error;
    }
  }
}