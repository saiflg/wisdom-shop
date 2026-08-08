import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { validateEnv, type EnvConfig } from "./config/env.validation";
import { ControlPrismaModule } from "./control-db/control-prisma.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { TenantContextInterceptor } from "./tenancy/tenant-context.interceptor";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { RolesGuard } from "./auth/guards/roles.guard";
import { HealthModule } from "./health/health.module";
import { PlatformAuthModule } from "./platform-auth/platform-auth.module";
import { SchoolsModule } from "./schools/schools.module";
import { AuthModule } from "./auth/auth.module";
import { ClassesModule } from "./classes/classes.module";
import { StudentsModule } from "./students/students.module";
import { TeachersModule } from "./teachers/teachers.module";
import { GuardiansModule } from "./guardians/guardians.module";
import { EnrollmentsModule } from "./enrollments/enrollments.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { CurriculumSettingsModule } from "./curriculum-settings/curriculum-settings.module";
import { SubjectsModule } from "./subjects/subjects.module";
import { SchemesOfWorkModule } from "./schemes-of-work/schemes-of-work.module";
import { LessonPlansModule } from "./lesson-plans/lesson-plans.module";
import { QuizzesModule } from "./quizzes/quizzes.module";
import { AiTeacherModule } from "./ai-teacher/ai-teacher.module";
import { AccessibilityModule } from "./accessibility/accessibility.module";
import { PayrollModule } from "./payroll/payroll.module";
import { BillingModule } from "./billing/billing.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { FeesModule } from "./fees/fees.module";
import { GradingModule } from "./grading/grading.module";
import { TimetableModule } from "./timetable/timetable.module";
import { StaffModule } from "./staff/staff.module";
import { DataExchangeModule } from "./data-exchange/data-exchange.module";
import { PdfModule } from "./pdf/pdf.module";
import { MessagingModule } from "./messaging/messaging.module";
import { TenantSecretsModule } from "./common/crypto/tenant-secrets.module";
import { SettingsModule } from "./settings/settings.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: [".env"],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => [
        {
          name: "default",
          ttl: config.get("RATE_LIMIT_TTL_MS", { infer: true }),
          limit: config.get("RATE_LIMIT_LIMIT", { infer: true }),
        },
      ],
    }),
    ControlPrismaModule,
    TenancyModule,
    HealthModule,
    // Platform routes are @Public() (opt out of the tenant JwtAuthGuard
    // below) and carry their own guards — see PlatformAuthModule/SchoolsModule.
    PlatformAuthModule,
    SchoolsModule,
    AuthModule,
    ClassesModule,
    StudentsModule,
    TeachersModule,
    GuardiansModule,
    EnrollmentsModule,
    OnboardingModule,
    CurriculumSettingsModule,
    SubjectsModule,
    SchemesOfWorkModule,
    LessonPlansModule,
    QuizzesModule,
    AiTeacherModule,
    AccessibilityModule,
    PayrollModule,
    TenantSecretsModule,
    SettingsModule,
    BillingModule,
    AttendanceModule,
    FeesModule,
    GradingModule,
    TimetableModule,
    StaffModule,
    DataExchangeModule,
    PdfModule,
    MessagingModule,
  ],
  providers: [
    // Order matters: throttling first, then auth (populates req.user), then
    // role checks (reads req.user) — same reasoning as the shop's app.module.ts.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Runs after guards (interceptor stage), so req.user is already set —
    // see TenantContextInterceptor's own comment for why this matters.
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
