import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * RolesService — manages the Role catalogue and UserRole assignments.
 *
 * Called by onboarding flows (driver, delivery, business) to grant a new role
 * after the user completes the relevant profile setup.
 *
 * Never exposes JWT signing — that lives in AuthService.  Role assignment here
 * only touches the DB; the client must call POST /auth/switch-role to get a
 * token that reflects the change.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Role catalogue ───────────────────────────────────────────────────────────

  findAll() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  async findByName(name: string) {
    const role = await this.prisma.role.findUnique({ where: { name } });
    if (!role) throw new NotFoundException(`Role "${name}" not found`);
    return role;
  }

  async createRole(name: string) {
    const exists = await this.prisma.role.findUnique({ where: { name } });
    if (exists) throw new ConflictException(`Role "${name}" already exists`);
    return this.prisma.role.create({ data: { name } });
  }

  // ─── User ↔ Role assignments ──────────────────────────────────────────────────

  /**
   * Returns all roles assigned to a user (array of role name strings).
   */
  async getUserRoles(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return rows.map((r) => r.role.name);
  }

  /**
   * Grants a role to a user. Idempotent — safe to call even if already granted.
   * Returns the full updated role list so callers can issue a new token if needed.
   */
  async grantRole(userId: string, roleName: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new NotFoundException(`Role "${roleName}" not found`);

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    });

    return this.getUserRoles(userId);
  }

  /**
   * Revokes a role from a user.
   * Prevents revoking the "user" base role to keep accounts operable.
   */
  async revokeRole(userId: string, roleName: string): Promise<string[]> {
    if (roleName === 'user') {
      throw new BadRequestException(
        'The base "user" role cannot be revoked.',
      );
    }

    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new NotFoundException(`Role "${roleName}" not found`);

    await this.prisma.userRole.deleteMany({
      where: { userId, roleId: role.id },
    });

    return this.getUserRoles(userId);
  }
}
