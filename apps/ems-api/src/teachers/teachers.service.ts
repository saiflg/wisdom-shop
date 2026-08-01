import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { CreateTeacherDto } from "./dto/create-teacher.dto";

const TEACHER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  roles: true,
  createdAt: true,
} as const;

@Injectable()
export class TeachersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateTeacherDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("A user with that email already exists");
    }

    const passwordHash = await argon2.hash(dto.password);
    return client.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roles: ["TEACHER"],
      },
      select: TEACHER_SELECT,
    });
  }

  async list() {
    const client = await this.tenantPrisma.getClient();
    return client.user.findMany({
      where: { roles: { has: "TEACHER" }, deletedAt: null },
      select: TEACHER_SELECT,
      orderBy: { lastName: "asc" },
    });
  }

  async findOne(id: string) {
    const client = await this.tenantPrisma.getClient();
    const record = await client.user.findFirst({
      where: { id, roles: { has: "TEACHER" }, deletedAt: null },
      select: { ...TEACHER_SELECT, homeroomFor: { select: { id: true, name: true, academicYear: true } } },
    });
    if (!record) throw new NotFoundException("No teacher found with that id");
    return record;
  }
}
