import type { ExamDraft, ExamSourceReference, ManagedSource } from "./types.js";
import { stageLabel } from "./cambridge-curriculum.js";
import {
  buildAssessmentBlueprint,
  buildAssessmentItemContracts,
  sourceContentHash,
  type AssessmentBlueprint,
  type AssessmentItemContract,
  type AssessmentItemSeed,
  type AssessmentSourceSnapshot,
} from "./assessment-engine/index.js";

export const ASSESSMENT_PROGRESSIVE_GENERATION_VERSION = "assessment-engine-v2-cambridge-global";

export interface ProgressiveGenerationPayload { blueprint: AssessmentBlueprint; contracts: AssessmentItemContract[]; }
export interface ProgressiveGenerationBuildInput { draft: ExamDraft; subject: string; sources: readonly ManagedSource[]; }

function referenceChunkIndex(reference: ExamSourceReference): number {
  const prefix = `${reference.sourceId}:`;
  if (!reference.id.startsWith(prefix)) throw new Error(`مرجع المصدر ${reference.id} غير صالح.`);
  const raw = reference.id.slice(prefix.length).split(":", 1)[0] ?? "";
  const chunkIndex = Number(raw);
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0) throw new Error(`تعذر قراءة رقم مقطع المرجع ${reference.id}.`);
  return chunkIndex;
}

async function uploadedSourceSnapshot(reference: ExamSourceReference, source: ManagedSource | undefined): Promise<AssessmentSourceSnapshot> {
  const content = (reference.context ?? reference.excerpt).trim();
  if (!content) throw new Error(`مقطع المرجع ${reference.id} فارغ.`);
  if (!source?.extractionVersion?.trim()) throw new Error(`لا يوجد إصدار استخراج موثق للمصدر ${reference.sourceTitle}.`);
  return {
    mode: "uploaded_source",
    sourceId: reference.sourceId,
    sourceTitle: reference.sourceTitle,
    sourceKind: reference.sourceKind,
    sourceReferenceId: reference.id,
    chunkIndex: referenceChunkIndex(reference),
    pageFrom: reference.pageFrom,
    pageTo: reference.pageTo,
    contentHash: await sourceContentHash(content),
    extractionVersion: source.extractionVersion.trim(),
  };
}

export async function buildProgressiveGenerationPayload(input: ProgressiveGenerationBuildInput): Promise<ProgressiveGenerationPayload> {
  const { draft, subject, sources } = input;
  if (draft.grade === null) throw new Error("مرحلة Cambridge غير محددة.");
  if (!draft.plan.length) throw new Error("لا توجد خطة اختبار لبناء دورة التوليد.");
  if (!Number.isSafeInteger(draft.generationEpoch) || draft.generationEpoch < 1) throw new Error("رقم دورة التوليد غير صالح.");

  const references = new Map(draft.sourceReferences.map((reference) => [reference.id, reference]));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const snapshots = new Map<string, AssessmentSourceSnapshot>();
  const seeds: AssessmentItemSeed[] = [];

  for (const item of draft.plan) {
    let referenceId: string | undefined;
    if (item.sourceReferenceId) {
      const reference = references.get(item.sourceReferenceId);
      if (reference) {
        referenceId = reference.id;
        if (!snapshots.has(reference.id)) snapshots.set(reference.id, await uploadedSourceSnapshot(reference, sourcesById.get(reference.sourceId)));
      }
    }
    seeds.push({
      planItemId: item.id,
      lessonId: item.lessonId,
      lessonLabel: item.lessonLabel,
      questionType: item.questionType,
      cognitiveLevel: item.cognitiveLevel,
      ...(item.difficultyLevel ? { difficultyLevel: item.difficultyLevel } : {}),
      marks: item.marks,
      ...(referenceId ? { sourceReferenceId: referenceId } : {}),
    });
  }

  const blueprint = await buildAssessmentBlueprint({
    draftId: draft.id,
    generationEpoch: draft.generationEpoch,
    assessmentType: draft.assessmentType,
    assessmentPolicyId: draft.assessmentPolicyId,
    programmeId: draft.programmeId,
    syllabusCode: draft.syllabusCode,
    stageLabel: stageLabel(draft.programmeId, draft.grade),
    grade: draft.grade,
    subject,
    topic: draft.topic,
    difficulty: draft.difficulty,
    items: seeds,
    sourcesByReferenceId: snapshots,
  });
  return { blueprint, contracts: await buildAssessmentItemContracts(blueprint) };
}
