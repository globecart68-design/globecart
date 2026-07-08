import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { AuthModule } from './modules/auth/auth.module';

import { NotificationModule } from './modules/notifications/notification.module';
import { StoriesModule } from './modules/stories/stories.module';
 import { PostsModule } from './modules/posts/posts.module';

// ─── Onboarding ───────────────────────────────────────────────────────────────
import { BusinessOnboardingModule } from './modules/onboarding/business/business-onboarding.module';
import { DriverOnboardingModule } from './modules/onboarding/driver/driver-onboarding.module';
import { DeliveryOnboardingModule } from './modules/onboarding/delivery/delivery-onboarding.module';

// ---- Personal ----------------------------------------------------------------
import { SocialModule } from './modules/personal-users/social-graph/social/social.module';
import { ShopsModule } from './modules/personal-users/shops/shops.module';
import { FriendsModule } from './modules/personal-users/social-graph/friends/friends.module';
import { BlocksModule } from './modules/personal-users/social-graph/blocks/blocks.module';
import { ProfileModule } from './modules/personal-users/profile/profile.module';

// ─── Business dashboard ─────────────────────────────────────────────────────--
import { BusinessHomeModule } from './modules/business-user/home/business-home.module';
import { BusinessProfileModule } from './modules/business-user/profile/business-profile.module';
import { BusinessAnalyticsModule } from './modules/business-user/analytics/business-analytics.module';
import { BusinessCustomersModule } from './modules/business-user/customers/business-customers.module';
import { BusinessPaymentsModule } from './modules/business-user/payments/business-payments.module';
import { BusinessProductsModule } from './modules/business-user/products/business-products.module';
import { BusinessInventoryModule } from './modules/business-user/inventory/business-inventory.module';

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

    // Onboarding
    BusinessOnboardingModule,
    DriverOnboardingModule,
    DeliveryOnboardingModule,

    //
    StoriesModule,
     PostsModule, 

    // Business dashboard tabs
    BusinessHomeModule,
    BusinessProfileModule,
    BusinessAnalyticsModule,
    BusinessCustomersModule,
    BusinessPaymentsModule,
    BusinessProductsModule,
    BusinessInventoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}