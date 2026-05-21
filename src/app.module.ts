import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/personal-users/profile/profile.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { SocialModule } from './modules/personal-users/social-graph/social/social.module';
import { ShopsModule } from './modules/personal-users/social-graph/shops/shops.module';
import { FriendsModule } from './modules/personal-users/social-graph/friends/friends.module';
import { BlocksModule } from './modules/personal-users/social-graph/blocks/blocks.module';
import { StoriesModule } from './modules/stories/stories.module';

// ─── Onboarding ───────────────────────────────────────────────────────────────
import { BusinessOnboardingModule } from './modules/onboarding/business/business-onboarding.module';
import { DriverOnboardingModule } from './modules/onboarding/driver/driver-onboarding.module';
import { DeliveryOnboardingModule } from './modules/onboarding/delivery/delivery-onboarding.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,

    // Auth & sessions
    SessionsModule,
    AuthModule,

    // Personal user
    ProfileModule,
    SocialModule,
    ShopsModule,
    FriendsModule,
    BlocksModule,

    // Notifications
    NotificationModule,

    // Onboarding (role registration)
    BusinessOnboardingModule,
    DriverOnboardingModule,
    DeliveryOnboardingModule,
    StoriesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
