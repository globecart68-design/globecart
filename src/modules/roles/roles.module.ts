import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * RolesModule — exposes RolesService for use by onboarding modules (driver,
 * delivery, business) that need to grant a role after profile completion.
 *
 * Import this module wherever role assignment is needed:
 *   imports: [RolesModule]
 *   // then inject RolesService
 */
@Module({
  imports: [PrismaModule],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
