import type { AssessmentType, CambridgeProgrammeId, Difficulty } from "../types.js";
import {
  ASSESSMENT_BLUEPRINT_VERSION,
  ASSESSMENT_CONTRACT_VERSION,
  ASSESSMENT_ENGINE_SCHEMA_VERSION,
  type AssessmentBlueprint,
  type AssessmentBlueprintItem,
  type AssessmentItemContract,
  type AssessmentItemSeed,
  type AssessmentSourceSnapshot,
} from "./contracts.js";
import { AssessmentEngineError } from "./errors.js";
import { sha256Hex } from "./hashing.js";
import { assertBlueprintIntegrity, assertItemContractIntegrity } from "./invariants.js";

export interface AssessmentBlueprintBuildInput {
  draftId: string;
  generationEpoch: number;
  assessmentType: AssessmentType;
  assessmentPolicyId: string;
  programmeId: CambridgeProgrammeId;
  syllabusCode: string;
  stageLabel: string;
  grade: number;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  items: readonly AssessmentItemSeed[];
}

async function globalCurriculumSnapshot(input: AssessmentBlueprintBuildInput, item: AssessmentItemSeed): Promise<AssessmentSourceSnapshot> {
  const identity = `${input.programmeId}|${input.syllabusCode}|${input.stageLabel}|${input.subject}|${item.lessonLabel}`;
  return {
    mode: "global_curriculum",
    sourceId: `cambridge:${input.syllabusCode || input.programmeId}`.slice(0, 180),
    sourceTitle: `منهج كامبريدج · ${input.stageLabel} · ${input.subject} · ${item.lessonLabel}`,
    sourceKind: "منهج كامبريدج",
    sourceReferenceId: `cambridge:${item.planItemId}`,
    chunkIndex: 0,
    pageFrom: 1,
    pageTo: 1,
    contentHash: await sha256Hex(identity),
    extractionVersion: "cambridge-global-v2",
  };
}

async function blueprintItemFromSeed(
  input: AssessmentBlueprintBuildInput,
  item: AssessmentItemSeed,
  order: number,
): Promise<AssessmentBlueprintItem> {
  return {
    order,
    planItemId: item.planItemId,
    lessonId: item.lessonId,
    lessonLabel: item.lessonLabel,
    questionType: item.questionType,
    cognitiveLevel: item.cognitiveLevel,
    ...(item.difficultyLevel ? { difficultyLevel: item.difficultyLevel } : {}),
    ...(item.assessmentFocus ? { assessmentFocus: item.assessmentFocus } : {}),
    marks: item.marks,
    source: await globalCurriculumSnapshot(input, item),
  };
}

export async function buildAssessmentBlueprint(input: AssessmentBlueprintBuildInput): Promise<AssessmentBlueprint> {
  if (!input.draftId.trim() || !Number.isInteger(input.generationEpoch) || input.generationEpoch < 1) {
    throw new AssessmentEngineError("INVALID_BLUEPRINT", "معرف المسودة أو رقم دورة التوليد غير صالح.");
  }
  if (input.items.length < 1 || input.items.length > 40) {
    throw new AssessmentEngineError("INVALID_BLUEPRINT", "عدد مفردات التوليد يجب أن يكون بين 1 و40.");
  }
  const items = await Promise.all(input.items.map((item, index) => blueprintItemFromSeed(input, item, index + 1)));
  const planHash = await sha256Hex(items.map(({ source: _source, ...item }) => item));
  const sourceSnapshotHash = await sha256Hex(items.map((item) => item.source));
  const blueprint: AssessmentBlueprint = {
    engineSchemaVersion: ASSESSMENT_ENGINE_SCHEMA_VERSION,
    blueprintVersion: ASSESSMENT_BLUEPRINT_VERSION,
    draftId: input.draftId,
    generationEpoch: input.generationEpoch,
    assessmentType: input.assessmentType,
    assessmentPolicyId: input.assessmentPolicyId,
    programmeId: input.programmeId,
    syllabusCode: input.syllabusCode,
    stageLabel: input.stageLabel,
    grade: input.grade,
    subject: input.subject,
    topic: input.topic,
    difficulty: input.difficulty,
    totalMarks: items.reduce((sum, item) => sum + item.marks, 0),
    itemCount: items.length,
    planHash,
    sourceSnapshotHash,
    items,
  };
  assertBlueprintIntegrity(blueprint);
  return blueprint;
}

export async function buildAssessmentItemContracts(blueprint: AssessmentBlueprint): Promise<AssessmentItemContract[]> {
  assertBlueprintIntegrity(blueprint);
  return Promise.all(blueprint.items.map(async (item) => {
    const base = {
      engineSchemaVersion: ASSESSMENT_ENGINE_SCHEMA_VERSION,
      contractVersion: ASSESSMENT_CONTRACT_VERSION,
      draftId: blueprint.draftId,
      generationEpoch: blueprint.generationEpoch,
      planHash: blueprint.planHash,
      assessmentType: blueprint.assessmentType,
      assessmentPolicyId: blueprint.assessmentPolicyId,
      programmeId: blueprint.programmeId,
      syllabusCode: blueprint.syllabusCode,
      stageLabel: blueprint.stageLabel,
      planItemId: item.planItemId,
      order: item.order,
      grade: blueprint.grade,
      subject: blueprint.subject,
      topic: blueprint.topic,
      difficulty: blueprint.difficulty,
      lessonId: item.lessonId,
      lessonLabel: item.lessonLabel,
      questionType: item.questionType,
      cognitiveLevel: item.cognitiveLevel,
      ...(item.difficultyLevel ? { difficultyLevel: item.difficultyLevel } : {}),
      ...(item.assessmentFocus ? { assessmentFocus: item.assessmentFocus } : {}),
      marks: item.marks,
      source: item.source,
    };
    const contract: AssessmentItemContract = { ...base, contractHash: await sha256Hex(base) };
    assertItemContractIntegrity(contract);
    return contract;
  }));
}
