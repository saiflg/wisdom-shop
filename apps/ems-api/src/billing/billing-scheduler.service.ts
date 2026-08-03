import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "@/config/env.validation";
import { BillingService } from "./billing.service";

/**
 * Runs the billing cycle on a timer.
 *
 * Deliberately a plain interval rather than a queue. The correctness
 * guarantee for "don't bill twice" is the unique index on
 * (subscriptionId, periodStart), not the scheduler firing exactly once —
 * so a second instance, a restart mid-run, or an operator hitting the
 * manual trigger are all already safe. What a queue would add is retry,
 * backoff and per-job visibility, which is worth having but is an
 * operational upgrade rather than a correctness fix. See PROGRESS.md.
 *
 * Off by default so tests and local runs don't get surprise invoices;
 * enable with BILLING_CYCLE_ENABLED=true.
 */
@Injectable()
export class BillingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  onModuleInit(): void {
    if (!this.config.get("BILLING_CYCLE_ENABLED", { infer: true })) {
      this.logger.log("Billing cycle scheduler disabled (BILLING_CYCLE_ENABLED is not true)");
      return;
    }

    const intervalMs = this.config.get("BILLING_CYCLE_INTERVAL_MS", { infer: true });
    this.timer = setInterval(() => void this.tick(), intervalMs);
    // Don't hold the process open purely for the billing timer.
    this.timer.unref();
    this.logger.log(`Billing cycle scheduler enabled, every ${intervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Skips rather than queues if the previous tick is still running: a slow
   * cycle followed by an overlapping one would do no harm (the unique index
   * catches it) but would waste connections for nothing.
   */
  private async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn("Previous billing cycle still running — skipping this tick");
      return;
    }
    this.running = true;
    try {
      await this.billing.runBillingCycle();
    } catch (error) {
      // A failed cycle must never kill the process; the next tick retries,
      // and anything already invoiced stays invoiced exactly once.
      this.logger.error(`Billing cycle failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
