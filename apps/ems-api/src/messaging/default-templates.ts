import type { MessageChannel, MessageEvent } from "ems-tenant-client";

export interface DefaultTemplate {
  event: MessageEvent;
  channel: MessageChannel;
  subject?: string;
  body: string;
}

/**
 * The wording a school starts with, seeded at provisioning.
 *
 * Kept here rather than inline in the provisioning service so one test can
 * check every default against `EVENT_PLACEHOLDERS`. Rendering fails closed,
 * so a placeholder typo in a seeded template is not a cosmetic bug — it is a
 * notification that can never send, discovered the morning a register is
 * taken. The coupling is real, so it is verified rather than trusted.
 */
export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    event: "ATTENDANCE_ABSENT",
    channel: "EMAIL",
    subject: "{{studentName}} was marked absent on {{date}}",
    body:
      "Dear {{guardianName}},\n\n{{studentName}} was marked absent from {{className}} on {{date}}.\n\n" +
      "If this is unexpected, please contact the school.\n\n{{schoolName}}",
  },
  {
    event: "ATTENDANCE_ABSENT",
    channel: "SMS",
    body: "{{schoolName}}: {{studentName}} was marked absent on {{date}}. Please contact us if unexpected.",
  },
  {
    event: "FEE_INVOICE_ISSUED",
    channel: "EMAIL",
    subject: "Fee invoice {{invoiceNumber}} for {{studentName}}",
    body:
      "Dear {{guardianName}},\n\nInvoice {{invoiceNumber}} for {{studentName}} is now due: {{amount}}.\n\n" +
      "{{schoolName}}",
  },
  {
    event: "FEE_INVOICE_ISSUED",
    channel: "SMS",
    body: "{{schoolName}}: invoice {{invoiceNumber}} for {{studentName}} is due — {{amount}}.",
  },
  {
    event: "RESULTS_PUBLISHED",
    channel: "EMAIL",
    subject: "{{studentName}}'s results for {{term}} are ready",
    body:
      "Dear {{guardianName}},\n\n{{studentName}}'s results for {{term}} ({{academicYear}}) have been " +
      "published and are available in the parent portal.\n\n{{schoolName}}",
  },
  {
    event: "RESULTS_PUBLISHED",
    channel: "SMS",
    body: "{{schoolName}}: {{studentName}}'s {{term}} results are now available.",
  },
];
