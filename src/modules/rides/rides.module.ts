import { Module } from '@nestjs/common';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { RidesRepository } from './rides.repository';
import { MapsModule } from '../maps/maps.module';

@Module({
  imports: [MapsModule],
  controllers: [RidesController],
  providers: [RidesService, RidesRepository],
  exports: [RidesService],
})
export class RidesModule {}
