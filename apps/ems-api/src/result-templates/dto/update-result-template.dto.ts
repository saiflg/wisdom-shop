import { PartialType } from "@nestjs/swagger";
import { CreateResultTemplateDto } from "./create-result-template.dto";

/**
 * Every field optional, including the components.
 *
 * Omitting components leaves them alone; sending them replaces the whole set,
 * because the weights only mean anything together.
 */
export class UpdateResultTemplateDto extends PartialType(CreateResultTemplateDto) {}
