import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { AuthModule } from './modules/auth/auth.module';

import { NotificationModule } from './modules/notifications/notification.module';
import { StoriesModule } from './modules/stories/stories.module';
 import { PostsModule } from './modules/posts/posts.module';
import { MusicModule } from './modules/music/music.module';

// ─── Onboarding ───────────────────────────────────────────────────────────────
import { BusinessOnboardingModule } from './modules/onboarding/business/business-onboarding.module';
import { DriverOnboardingModule } from './modules/onboarding/driver/driver-onboarding.module';
import { DeliveryOnboardingModule } from './modules/onboarding/delivery/delivery-onboarding.module';

// ______________________________________________________________________________
import { SocialModule } from './modules/personal-users/social-graph/social/social.module';
import { ShopsModule } from './modules/personal-users/shops/shops.module';
import { OrdersModule } from './modules/personal-users/orders/orders.module';
import { FriendsModule } from './modules/personal-users/social-graph/friends/friends.module';
import { BlocksModule } from './modules/personal-users/social-graph/blocks/blocks.module';
import { ProfileModule } from './modules/personal-users/profile/profile.module';

// ─── Business dashboard ─────────────────────────────────────────────────────
import { BusinessHomeModule } from './modules/business-user/home/business-home.module';
import { BusinessProfileModule } from './modules/business-user/profile/business-profile.module';
import { BusinessAnalyticsModule } from './modules/business-user/analytics/business-analytics.module';
import { BusinessCustomersModule } from './modules/business-user/customers/business-customers.module';
import { BusinessOrdersModule } from './modules/business-user/orders/business-orders.module';
import { BusinessPaymentsModule } from './modules/business-user/payments/business-payments.module';
import { BusinessProductsModule } from './modules/business-user/products/business-products.module';
import { BusinessInventoryModule } from './modules/business-user/inventory/business-inventory.module';

// ─── Map Hub ─────────────────────────────────────────────────────────────────
import { MapsModule } from './modules/maps/maps.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { RidesModule } from './modules/rides/rides.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { WebsocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Powers the domain-event → WS-broadcast decoupling in RealtimeGateway
    // (RidesService/TrackingService emit 'ride.status_updated' etc.
    // without knowing anything about Socket.IO).
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    
    // Auth & sessions
    SessionsModule,
    AuthModule,

    // Personal user
    ProfileModule,
    SocialModule,
    ShopsModule,
    OrdersModule,
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
    MusicModule,

    // Business dashboard tabs
    BusinessHomeModule,
    BusinessProfileModule,
    BusinessAnalyticsModule,
    BusinessCustomersModule,
    BusinessOrdersModule,
    BusinessPaymentsModule,
    BusinessProductsModule,
    BusinessInventoryModule,

    // Map Hub — Address / Ride / Track
    MapsModule,
    AddressesModule,
    RidesModule,
    TrackingModule,
    DeliveriesModule,
    WebsocketModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}