import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { isSafeResourceUrl, toEmbedUrl } from "./match-resources";
import type { CreateLessonResourceDto } from "./dto/create-lesson-resource.dto";

/**
 * The school's own library of demonstrations.
 *
 * Staff-only to write. The AI never contributes a URL here: a model asked for
 * a good video will invent one, and a child following an invented link is the
 * failure this whole design avoids.
 */
@Injectable()
export class LessonResourcesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateLessonResourceDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const url = dto.url.trim();
    if (!isSafeResourceUrl(url)) {
      throw new BadRequestException("That link must be a normal http:// or https:// web address");
    }

    const subject = await client.subject.findFirst({ where: { id: dto.subjectId, deletedAt: null } });
    if (!subject) throw new NotFoundException("No subject found with that id");

    const created = await client.lessonResource.create({
      data: {
        subjectId: dto.subjectId,
        title: dto.title.trim(),
        url,
        kind: dto.kind ?? "VIDEO",
        keywords: dto.keywords?.trim() || null,
        addedByUserId: viewer.id,
      },
    });

    return { ...created, embedUrl: toEmbedUrl(created.url) };
  }

  async list(subjectId?: string) {
    const client = await this.tenantPrisma.getClient();

    const resources = await client.lessonResource.findMany({
      where: { deletedAt: null, ...(subjectId ? { subjectId } : {}) },
      include: { subject: { select: { id: true, name: true, gradeLevel: true } } },
      orderBy: { createdAt: "desc" },
    });

    return resources.map((resource) => ({ ...resource, embedUrl: toEmbedUrl(resource.url) }));
  }

  async remove(id: string) {
    const client = await this.tenantPrisma.getClient();

    const existing = await client.lessonResource.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("No resource found with that id");

    // Soft delete, so a transcript that offered this demonstration last term
    // still resolves to something rather than a dangling id.
    return client.lessonResource.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
