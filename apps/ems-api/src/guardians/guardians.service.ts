import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { CreateGuardianDto } from "./dto/create-guardian.dto";

@Injectable()
export class GuardiansService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateGuardianDto) {
    const client = await this.tenantPrisma.getClient();

    const student = await client.studentProfile.findFirst({
      where: { id: dto.studentProfileId, deletedAt: null },
    });
    if (!student) throw new NotFoundException("No student found with that id");

    let guardianUser = await client.user.findUnique({ where: { email: dto.email } });

    if (!guardianUser) {
      if (!dto.firstName || !dto.lastName || !dto.password) {
        throw new BadRequestException(
          "firstName, lastName and password are required when creating a new guardian",
        );
      }
      const passwordHash = await argon2.hash(dto.password);
      guardianUser = await client.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          roles: ["GUARDIAN"],
        },
      });
    } else if (!guardianUser.roles.includes("GUARDIAN")) {
      guardianUser = await client.user.update({
        where: { id: guardianUser.id },
        data: { roles: { push: "GUARDIAN" } },
      });
    }

    const existingLink = await client.guardianLink.findUnique({
      where: {
        guardianUserId_studentProfileId: { guardianUserId: guardianUser.id, studentProfileId: student.id },
      },
    });
    if (existingLink) throw new ConflictException("This guardian is already linked to this student");

    return client.guardianLink.create({
      data: { guardianUserId: guardianUser.id, studentProfileId: student.id, relationship: dto.relationship },
      include: { guardianUser: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  async remove(linkId: string) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.guardianLink.findUnique({ where: { id: linkId } });
    if (!existing) throw new NotFoundException("No guardian link found with that id");
    await client.guardianLink.delete({ where: { id: linkId } });
  }
}
