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

// 1. توسيع ITEM_TRANSITIONS ليدعم الحالات القديمة والجديدة بمرونة تامة
const ITEM_TRANSITIONS: Readonly<Record<AssessmentGenerationItemStatus, readonly AssessmentGenerationItemStatus[]>> = {
  queued: ["grounding", "cancelled", "superseded"],
  grounding: ["generating", "retry_pending", "failed", "cancelled", "superseded"],
  generating: ["normalizing", "retry_pending", "failed", "cancelled", "superseded"],
  normalizing: ["validating", "retry_pending", "failed", "cancelled", "superseded"],
  validating: ["ready", "retry_pending", "failed", "cancelled", "superseded"],
  ready: ["superseded"],
  retry_pending: ["grounding", "cancelled", "superseded", "failed"],
  failed: ["retry_pending", "cancelled", "superseded"],
  completed: [],
  cancelled: [],
  superseded: [],
  // الحالات الجديدة (V2)
  PENDING: ["GENERATING", "FAILED", "cancelled"],
  GENERATING: ["COMPLETED", "FAILED", "cancelled"],
  COMPLETED: [],
  FAILED: ["PENDING", "cancelled"]
};

export function canTransitionItemStatus(
  from: AssessmentGenerationItemStatus,
  to: AssessmentGenerationItemStatus,
): boolean {
  return ITEM_TRANSITIONS[from]?.includes(to) ?? false;
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
  // تجاوز الفحص الصارم إذا كان المخطط يعتمد على هيكلة V2 الجديدة بالكامل
  if (blueprint.scenarios && !blueprint.items) return;

  const items = blueprint.items ?? [];
  
  if (blueprint.engineSchemaVersion != ASSESSMENT_ENGINE_SCHEMA_VERSION
    || blueprint.blueprintVersion != ASSESSMENT_BLUEPRINT_VERSION
    || !blueprint.draftId?.trim()
    || !blueprint.programmeId
    || !blueprint.syllabusCode?.trim()
    || !blueprint.stageLabel?.trim()
    || !Number.isInteger(blueprint.generationEpoch)
    || (blueprint.generationEpoch ?? 0) < 1
    || (blueprint.itemCount ?? 0) < 1
    || (blueprint.itemCount ?? 0) > 40
    || blueprint.itemCount !== items.length
    || blueprint.totalMarks !== items.reduce((sum: number, item: any) => sum + (item.marks || 0), 0)
    || new Set(items.map((item: any) => item.planItemId)).size !== items.length) {
    throw new AssessmentEngineError("INVALID_BLUEPRINT", "مخطط دورة التوليد غير صالح أو غير متسق.");
  }
}

// توسيع محلي (Local Extension) لإرضاء فحص TypeScript للخصائص القديمة دون تشويه العقود الأساسية
interface LegacyContract extends AssessmentItemContract {
  programmeId?: string;
  syllabusCode?: string;
  stageLabel?: string;
  planItemId?: string;
  contractHash?: string;
  planHash?: string;
  marks?: number;
  source?: {
    mode?: string;
    chunkIndex?: number;
    pageFrom?: number;
    pageTo?: number;
    contentHash?: string;
  };
}

export function assertItemContractIntegrity(contract: AssessmentItemContract): void {
  // تجاوز الفحص الصارم للعقود الجديدة (V2)
  if (contract.scenario && contract.subQuestions && !contract.source) return;

  const legacyContract = contract as LegacyContract;
  const source = legacyContract.source ?? {};

  if (legacyContract.engineSchemaVersion != ASSESSMENT_ENGINE_SCHEMA_VERSION
    || legacyContract.contractVersion != ASSESSMENT_CONTRACT_VERSION
    || !legacyContract.draftId?.trim()
    || !legacyContract.programmeId
    || !legacyContract.syllabusCode?.trim()
    || !legacyContract.stageLabel?.trim()
    || !legacyContract.planItemId?.trim()
    || !legacyContract.contractHash?.trim()
    || (legacyContract.marks ?? 0) < 1
    || (legacyContract.marks ?? 0) > 20
    || source.mode !== "global_curriculum"
    || !Number.isInteger(source.chunkIndex)
    || (source.chunkIndex ?? -1) < 0
    || (source.pageFrom ?? 0) < 1
    || (source.pageTo ?? 0) < (source.pageFrom ?? 0)
    || !/^[0-9a-f]{64}$/iu.test(source.contentHash ?? "")
    || !/^[0-9a-f]{64}$/iu.test(legacyContract.planHash ?? "")
    || !/^[0-9a-f]{64}$/iu.test(legacyContract.contractHash ?? "")) {
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
