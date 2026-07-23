import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { WsAuthService } from './ws-auth.service';
import { RidesModule } from '../rides/rides.module';
import { TrackingModule } from '../tracking/tracking.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev_secret',
    }),
    RidesModule,
    TrackingModule,
    DeliveriesModule,
  ],
  providers: [RealtimeGateway, WsAuthService],
})
export class WebsocketModule {}
