import { Controller, Get, ServiceUnavailableException, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "@/auth/decorators/public.decorator";
import { ControlPrismaService } from "@/control-db/control-prisma.service";

@ApiTags("health")
@Public()
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly controlPrisma: ControlPrismaService) {}

  @Get()
  async check() {
    try {
      await this.controlPrisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException("Control database unreachable");
    }
    return { status: "ok" };
  }
}
