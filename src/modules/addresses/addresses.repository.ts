import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AddressesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllForUser(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      // Default address first, then most recently updated.
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  findOne(id: string) {
    return this.prisma.address.findUnique({ where: { id } });
  }

  create(userId: string, data: Omit<Prisma.AddressUncheckedCreateInput, 'userId'>) {
    return this.prisma.address.create({
      data: { ...data, userId },
    });
  }

  update(id: string, data: Prisma.AddressUncheckedUpdateInput) {
    return this.prisma.address.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.address.delete({ where: { id } });
  }

  /** Clears isDefault on every other address owned by this user. */
  clearDefaultForUser(userId: string, exceptId?: string) {
    return this.prisma.address.updateMany({
      where: { userId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }

  countForUser(userId: string) {
    return this.prisma.address.count({ where: { userId } });
  }
}
