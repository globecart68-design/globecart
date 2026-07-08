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
 * Supports the multi-role system where one user can have:
 *   - user (personal)
 *   - business
 *   - delivery
 *   - driver
 *   - admin (future)
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
   * Grants a role to a user. Idempotent and robust.
   * - Creates the role if it doesn't exist (safe for first-time use)
   * - Returns updated list of roles
   */
  async grantRole(userId: string, roleName: string): Promise<string[]> {
    if (!roleName || typeof roleName !== 'string') {
      throw new BadRequestException('Role name is required');
    }

    // Normalize role name (optional: you can map 'personal' → 'user' here if needed)
    const normalizedRole = roleName === 'personal' ? 'user' : roleName;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Ensure the role exists in the Role table
    const role = await this.prisma.role.upsert({
      where: { name: normalizedRole },
      update: {},
      create: { name: normalizedRole },
    });

    // Assign to user (idempotent)
    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: { userId, roleId: role.id },
      },
      update: {},
      create: { userId, roleId: role.id },
    });

    return this.getUserRoles(userId);
  }

  /**
   * Revokes a role from a user.
   * Prevents revoking the base "user" role.
   */
  async revokeRole(userId: string, roleName: string): Promise<string[]> {
    const normalizedRole = roleName === 'personal' ? 'user' : roleName;

    if (normalizedRole === 'user') {
      throw new BadRequestException(
        'The base "user" (personal) role cannot be revoked.',
      );
    }

    const role = await this.prisma.role.findUnique({
      where: { name: normalizedRole },
    });

    if (!role) throw new NotFoundException(`Role "${roleName}" not found`);

    await this.prisma.userRole.deleteMany({
      where: { userId, roleId: role.id },
    });

    return this.getUserRoles(userId);
  }

  /**
   * Checks if user has a specific role
   */
  async hasRole(userId: string, roleName: string): Promise<boolean> {
    const normalizedRole = roleName === 'personal' ? 'user' : roleName;

    const count = await this.prisma.userRole.count({
      where: {
        userId,
        role: { name: normalizedRole },
      },
    });

    return count > 0;
  }
}