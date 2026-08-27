import { OmitType, PartialType } from "@nestjs/swagger";
import { CreateBehaviourRecordDto } from "./create-behaviour-record.dto";

/**
 * Everything except which child it is about.
 *
 * Moving a record from one child to another is not an amendment, it is two
 * different facts, and it would leave the first child's history quietly one
 * record short.
 */
export class UpdateBehaviourRecordDto extends PartialType(
  OmitType(CreateBehaviourRecordDto, ["studentProfileId"] as const),
) {}
