import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { SocialAuthController } from './social-auth/social_auth.controller';
import { SocialTokenVerifierService } from './social-auth/social_token_verifier.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SessionsModule } from '../sessions/sessions.module';
import { SmsModule } from './utils/sms/sms.module';
import { EmailModule } from './utils/email/email.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProfileModule } from '../personal-users/profile/profile.module';
import { RolesModule } from '../roles/roles.module';
import { BusinessOnboardingModule } from '../onboarding/business/business-onboarding.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    SessionsModule,
    SmsModule,
    EmailModule,
    ProfileModule,
    RolesModule,          // ← role management
    BusinessOnboardingModule,   // ← auto-create default shop on sign-up
    NotificationModule,   // ← device-token cleanup on logout / account deletion
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController, SocialAuthController],
  providers: [AuthService, JwtStrategy, SocialTokenVerifierService],
  exports: [AuthService],
})
export class AuthModule {}