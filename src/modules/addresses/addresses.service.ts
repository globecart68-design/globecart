import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AddressesRepository } from './addresses.repository';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly addresses: AddressesRepository) {}

  async findAll(userId: string) {
    return this.addresses.findAllForUser(userId);
  }

  async create(userId: string, dto: CreateAddressDto) {
    // First saved address is the default automatically, so a brand-new
    // account always has a usable "deliver to" without an extra step.
    const existingCount = await this.addresses.countForUser(userId);
    const isDefault = dto.isDefault ?? existingCount === 0;

    if (isDefault) {
      await this.addresses.clearDefaultForUser(userId);
    }

    return this.addresses.create(userId, {
      nickname: dto.nickname,
      fullAddress: dto.fullAddress,
      latitude: dto.latitude,
      longitude: dto.longitude,
      building: dto.building,
      floor: dto.floor,
      apartment: dto.apartment,
      instructions: dto.instructions,
      dropoffPreference: dto.dropoffPreference,
      isDefault,
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    await this._assertOwnership(userId, id);

    if (dto.isDefault === true) {
      await this.addresses.clearDefaultForUser(userId, id);
    }

    return this.addresses.update(id, { ...dto });
  }

  async remove(userId: string, id: string) {
    const address = await this._assertOwnership(userId, id);
    await this.addresses.delete(id);

    // If the default address was deleted, promote the most recently
    // updated remaining one so "deliver to" never comes back empty.
    if (address.isDefault) {
      const remaining = await this.addresses.findAllForUser(userId);
      if (remaining.length > 0) {
        await this.addresses.update(remaining[0].id, { isDefault: true });
      }
    }

    return { deleted: true };
  }

  private async _assertOwnership(userId: string, id: string) {
    const address = await this.addresses.findOne(id);
    if (!address) throw new NotFoundException('Address not found');
    if (address.userId !== userId) throw new ForbiddenException();
    return address;
  }
}
