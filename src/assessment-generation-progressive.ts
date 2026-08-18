import type { ExamDraft } from "./types.js";
import { stageLabel } from "./cambridge-curriculum.js";
import {
  buildAssessmentBlueprint,
  buildAssessmentItemContracts,
  type AssessmentBlueprint,
  type AssessmentItemContract,
  type AssessmentItemSeed,
} from "./assessment-engine/index.js";

export const ASSESSMENT_PROGRESSIVE_GENERATION_VERSION = "assessment-engine-v4-official-blueprint";

export interface ProgressiveGenerationPayload {
  blueprint: AssessmentBlueprint;
  contracts: AssessmentItemContract[];
}

export interface ProgressiveGenerationBuildInput {
  draft: ExamDraft;
  subject: string;
}

export async function buildProgressiveGenerationPayload(input: ProgressiveGenerationBuildInput): Promise<ProgressiveGenerationPayload> {
  const { draft, subject } = input;
  
  if (draft.grade === null) throw new Error("مرحلة كامبريدج غير محددة.");
  if (!draft.plan || !draft.plan.length) throw new Error("لا توجد خطة اختبار لبناء دورة التوليد.");
  if (!Number.isSafeInteger(draft.generationEpoch) || draft.generationEpoch < 1) throw new Error("رقم دورة التوليد غير صالح.");

  // إنشاء بذور التوليد بذكاء لتدعم (الهيكلة الجديدة) و (المتغيرات القديمة) معاً
  const seeds: AssessmentItemSeed[] = draft.plan.map((item) => {
    // 1. الخصائص الإجبارية للدستور الجديد (V2)
    const baseSeed: AssessmentItemSeed = {
      seedId: item.id || `seed-${Math.random().toString(36).substring(2, 9)}`,
      topic: item.lessonLabel || draft.topic || "موضوع غير محدد",
      curriculum: draft.programmeId === "igcse" ? "CAMBRIDGE_IGCSE" : "OMAN_MINISTRY"
    };

    // 2. الخصائص القديمة (Legacy) للحفاظ على توافق النظام
    const legacyProps = {
      planItemId: item.id,
      lessonId: item.lessonId,
      lessonLabel: item.lessonLabel,
      questionType: item.questionType,
      cognitiveLevel: item.cognitiveLevel,
      ...(item.difficultyLevel ? { difficultyLevel: item.difficultyLevel } : {}),
      ...(item.assessmentFocus ? { assessmentFocus: item.assessmentFocus } : {}),
      marks: item.marks || 1,
    };

    // دمج الإثنين بأمان تام
    return Object.assign(baseSeed, legacyProps) as AssessmentItemSeed;
  });

  const blueprint = await buildAssessmentBlueprint({
    draftId: draft.id,
    generationEpoch: draft.generationEpoch,
    assessmentType: draft.assessmentType,
    assessmentPolicyId: draft.assessmentPolicyId,
    programmeId: draft.programmeId,
    syllabusCode: draft.syllabusCode,
    stageLabel: stageLabel(draft.programmeId as any, draft.grade),
    grade: draft.grade,
    subject,
    topic: draft.topic,
    difficulty: draft.difficulty,
    items: seeds,
  });

  return { 
    blueprint, 
    contracts: await buildAssessmentItemContracts(blueprint) 
  };
}
