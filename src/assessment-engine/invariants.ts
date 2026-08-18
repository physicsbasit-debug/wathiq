// @ts-nocheck
import {
  ASSESSMENT_BLUEPRINT_VERSION,
  ASSESSMENT_CONTRACT_VERSION,
  ASSESSMENT_ENGINE_SCHEMA_VERSION,
  MODEL_ALLOWED_OUTPUT_FIELDS,
  type AssessmentBlueprint,
  type AssessmentGenerationItemStatus,
  type AssessmentItemContract,
} from "./contracts.js";
import { AssessmentEngineError } from "./errors.js";

const ITEM_TRANSITIONS: Readonly<Record<AssessmentGenerationItemStatus, readonly AssessmentGenerationItemStatus[]>> = {
  queued: ["grounding", "cancelled", "superseded"],
  grounding: ["generating", "retry_pending", "failed", "cancelled", "superseded"],
  generating: ["normalizing", "retry_pending", "failed", "cancelled", "superseded"],
  normalizing: ["validating", "retry_pending", "failed", "cancelled", "superseded"],
  validating: ["ready", "retry_pending", "failed", "cancelled", "superseded"],
  ready: ["superseded"],
  retry_pending: ["grounding", "cancelled", "superseded", "failed"],
  failed: ["retry_pending", "cancelled", "superseded"],
  cancelled: [],
  superseded: [],
};

export function canTransitionItemStatus(
  from: AssessmentGenerationItemStatus,
  to: AssessmentGenerationItemStatus,
): boolean {
  return ITEM_TRANSITIONS[from].includes(to);
}

export function assertItemStatusTransition(
  from: AssessmentGenerationItemStatus,
  to: AssessmentGenerationItemStatus,
): void {
  if (!canTransitionItemStatus(from, to)) {
    throw new AssessmentEngineError(
      "INTERNAL_ERROR",
      `انتقال حالة مفردة غير مسموح: ${from} ← ${to}.`,
      { from, to },
    );
  }
}

export function assertBlueprintIntegrity(blueprint: AssessmentBlueprint): void {
  if (blueprint.engineSchemaVersion !== ASSESSMENT_ENGINE_SCHEMA_VERSION
    || blueprint.blueprintVersion !== ASSESSMENT_BLUEPRINT_VERSION
    || !blueprint.draftId.trim()
    || !blueprint.programmeId
    || !blueprint.syllabusCode.trim()
    || !blueprint.stageLabel.trim()
    || !Number.isInteger(blueprint.generationEpoch)
    || blueprint.generationEpoch < 1
    || blueprint.itemCount < 1
    || blueprint.itemCount > 40
    || blueprint.itemCount !== blueprint.items.length
    || blueprint.totalMarks !== blueprint.items.reduce((sum, item) => sum + item.marks, 0)
    || new Set(blueprint.items.map((item) => item.planItemId)).size !== blueprint.items.length) {
    throw new AssessmentEngineError("INVALID_BLUEPRINT", "مخطط دورة التوليد غير صالح أو غير متسق.");
  }
}

export function assertItemContractIntegrity(contract: AssessmentItemContract): void {
  const source = contract.source;
  if (contract.engineSchemaVersion !== ASSESSMENT_ENGINE_SCHEMA_VERSION
    || contract.contractVersion !== ASSESSMENT_CONTRACT_VERSION
    || !contract.draftId.trim()
    || !contract.programmeId
    || !contract.syllabusCode.trim()
    || !contract.stageLabel.trim()
    || !contract.planItemId.trim()
    || !contract.contractHash.trim()
    || contract.marks < 1
    || contract.marks > 20
    || source.mode !== "global_curriculum"
    || !Number.isInteger(source.chunkIndex)
    || source.chunkIndex < 0
    || source.pageFrom < 1
    || source.pageTo < source.pageFrom
    || !/^[0-9a-f]{64}$/iu.test(source.contentHash)
    || !/^[0-9a-f]{64}$/iu.test(contract.planHash)
    || !/^[0-9a-f]{64}$/iu.test(contract.contractHash)) {
    throw new AssessmentEngineError("INVALID_ITEM_CONTRACT", "عقد مفردة التوليد غير صالح.");
  }
}

export function assertModelOutputOwnership(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AssessmentEngineError("MODEL_INVALID_JSON", "إخراج النموذج ليس كائنًا صالحًا.");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set<string>(MODEL_ALLOWED_OUTPUT_FIELDS);
  const unknown = Object.keys(record).filter((field) => !allowed.has(field));
  if (unknown.length) {
    throw new AssessmentEngineError(
      "MODEL_ASSESSMENT_MISMATCH",
      "أعاد النموذج حقولًا خارج عقد المحتوى المسموح.",
      { unknown },
    );
  }
}
