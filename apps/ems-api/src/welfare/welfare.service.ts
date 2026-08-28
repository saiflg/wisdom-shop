import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { CreateWelfareDto } from "./dto/create-welfare.dto";
import type { DecideWelfareDto } from "./dto/decide-welfare.dto";
import {
  availableTransitions,
  checkTransition,
  summariseWelfare,
  validateAmount,
  type WelfareStatus,
} from "./welfare-rules";

@Injectable()
export class WelfareService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateWelfareDto, actor: AuthenticatedUser) {
    const problem = validateAmount(dto.amountCents);
    if (problem) throw new BadRequestException(problem);

    const client = await this.tenantPrisma.getClient();
    return client.welfareRequest.create({
      data: {
        userId: actor.id,
        kind: dto.kind,
        reason: dto.reason.trim(),
        amountCents: dto.amountCents,
      },
    });
  }

  /**
   * Requests this person may read.
   *
   * Your own, or all of them if you are an administrator. There is no listing
   * that shows one teacher another teacher's welfare request, and no query
   * parameter that widens it — the scope is applied after anything a caller
   * sends.
   */
  async list(viewer: AuthenticatedUser, status?: WelfareStatus) {
    const client = await this.tenantPrisma.getClient();
    const isAdmin = viewer.roles.includes("SCHOOL_ADMIN");

    const requests = await client.welfareRequest.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(isAdmin ? {} : { userId: viewer.id }),
      },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    return {
      requests: requests.map((request) => ({
        ...request,
        availableTransitions: availableTransitions(request.status, {
          isAdmin,
          isRequester: request.userId === viewer.id,
        }),
      })),
      summary: summariseWelfare(requests),
    };
  }

  async decide(id: string, dto: DecideWelfareDto, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const request = await client.welfareRequest.findFirst({ where: { id, deletedAt: null } });
    if (!request) throw new NotFoundException("No welfare request found with that id");

    const problem = checkTransition(request.status, dto.to, {
      isAdmin: actor.roles.includes("SCHOOL_ADMIN"),
      isRequester: request.userId === actor.id,
    });
    if (problem) throw new ForbiddenException(problem);

    if (dto.to === "DECLINED" && !dto.note?.trim()) {
      // Saying why is the least somebody deserves when they have had to ask
      // for help in the first place.
      throw new BadRequestException("Say why when you decline a request for help");
    }

    const decidedByName = await this.nameOf(actor.id);

    return client.welfareRequest.update({
      where: { id },
      data: {
        status: dto.to,
        ...(dto.to === "APPROVED" || dto.to === "DECLINED"
          ? {
              decidedAt: new Date(),
              decidedByUserId: actor.id,
              decidedByName,
              decisionNote: dto.note?.trim() ?? null,
            }
          : {}),
        ...(dto.to === "PAID" ? { paidAt: new Date(), reference: dto.reference ?? null } : {}),
        // Raising a declined request again clears the old decision, so the
        // next reader is not looking at somebody else's refusal.
        ...(dto.to === "REQUESTED"
          ? { decidedAt: null, decidedByUserId: null, decidedByName: null, decisionNote: null }
          : {}),
      },
    });
  }

  private async nameOf(userId: string): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown";
  }
}
