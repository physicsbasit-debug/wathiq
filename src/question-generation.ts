import type {
  AssessmentType,
  CognitiveLevel,
  Difficulty,
  ExamSourceReference,
  ItemDifficulty,
  PlanItem,
  QuestionProposal,
  QuestionType,
} from "./types.js";
import type { OwnerSession } from "./central-source-store.js";
import type { WathiqRuntimeConfig } from "./runtime-config.js";
import { SCIENCE_ASSESSMENT_POLICY_ID } from "./assessment-policy.js";

export const SOURCE_GENERATION_VERSION = "source-grounded-policy-ai-7-evidence-anchors";
export const GENERATION_BATCH_SIZE = 2;

export interface QuestionGenerationReference {
  id: string;
  sourceTitle: string;
  sourceKind: string;
  pageFrom: number;
  pageTo: number;
  content: string;
}

export interface QuestionGenerationItem {
  planItemId: string;
  questionType: QuestionType;
  cognitiveLevel: CognitiveLevel;
  difficultyLevel?: ItemDifficulty;
  marks: number;
  sourceReferenceId: string;
  lessonLabel: string;
}

export interface QuestionGenerationRequest {
  assessmentType: AssessmentType;
  assessmentPolicyId: string;
  topic: string;
  lessons: string[];
  grade: number;
  subject: string;
  difficulty: Difficulty;
  references: QuestionGenerationReference[];
  officialPlanItems: QuestionGenerationItem[];
  items: QuestionGenerationItem[];
}

export interface GeneratedAlternative {
  text: string;
  options: string[];
  answer: string;
  rationale: string;
  sourceSupport: string;
  needsReview: boolean;
}

export interface GeneratedQuestionItem {
  planItemId: string;
  alternatives: GeneratedAlternative[];
}

export interface QuestionGenerationResponse {
  items: GeneratedQuestionItem[];
  model: string;
  generatedAt: string;
  requestId: string;
}

type FetchLike = typeof fetch;
type SessionProvider = () => Promise<OwnerSession>;

const browserFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function errorMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  if (!record) return fallback;
  let message = fallback;
  for (const key of ["error", "message", "detail"]) {
    if (typeof record[key] === "string" && record[key]) {
      message = record[key] as string;
      break;
    }
  }
  const requestId = typeof record.requestId === "string" ? record.requestId.trim() : "";
  return requestId ? `${message} رمز التتبع: ${requestId}` : message;
}

function parseAlternative(value: unknown, questionType: QuestionType): GeneratedAlternative {
  const record = asRecord(value);
  if (!record) throw new Error("استجابة مولد الأسئلة تحتوي بديلًا غير صالح.");
  const text = typeof record.text === "string" ? record.text.trim() : "";
  const options = Array.isArray(record.options)
    ? record.options.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  const answer = typeof record.answer === "string" ? record.answer.trim() : "";
  const rationale = typeof record.rationale === "string" ? record.rationale.trim() : "";
  const sourceSupport = typeof record.sourceSupport === "string" ? record.sourceSupport.trim() : "";
  const needsReview = record.needsReview === true;

  if (!text || !answer || !rationale || !sourceSupport) {
    throw new Error("استجابة مولد الأسئلة ناقصة ولا تصلح للعرض.");
  }
  if (questionType === "اختيار من متعدد") {
    if (options.length !== 4 || new Set(options).size !== 4) {
      throw new Error("أحد أسئلة الاختيار من متعدد لا يحتوي أربعة بدائل مختلفة.");
    }
    if (!options.includes(answer)) {
      throw new Error("الإجابة الصحيحة لا تطابق أحد بدائل سؤال الاختيار من متعدد.");
    }
  } else if (options.length !== 0) {
    throw new Error("سؤال غير موضوعي أعاد بدائل اختيار من متعدد على نحو غير صالح.");
  }

  return { text, options, answer, rationale, sourceSupport, needsReview };
}

export function parseQuestionGenerationResponse(
  payload: unknown,
  requestedItems: QuestionGenerationItem[],
): QuestionGenerationResponse {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.items)) {
    throw new Error("استجابة مولد الأسئلة غير صالحة.");
  }
  const expectedById = new Map(requestedItems.map((item) => [item.planItemId, item]));
  const seen = new Set<string>();
  const items: GeneratedQuestionItem[] = record.items.map((rawItem) => {
    const itemRecord = asRecord(rawItem);
    const planItemId = typeof itemRecord?.planItemId === "string" ? itemRecord.planItemId : "";
    const expected = expectedById.get(planItemId);
    if (!expected || seen.has(planItemId) || !Array.isArray(itemRecord?.alternatives)) {
      throw new Error("مولد الأسئلة أعاد مفردة مجهولة أو مكررة.");
    }
    seen.add(planItemId);
    if (itemRecord.alternatives.length !== 3) {
      throw new Error("يجب أن يعيد مولد الأسئلة ثلاثة بدائل لكل مفردة.");
    }
    return {
      planItemId,
      alternatives: itemRecord.alternatives.map((alternative) => parseAlternative(alternative, expected.questionType)),
    };
  });
  if (seen.size !== expectedById.size) {
    throw new Error("مولد الأسئلة لم يُعد جميع مفردات الخطة.");
  }
  return {
    items,
    model: typeof record.model === "string" && record.model.trim() ? record.model.trim() : "غير محدد",
    generatedAt: typeof record.generatedAt === "string" && record.generatedAt.trim()
      ? record.generatedAt.trim()
      : new Date().toISOString(),
    requestId: typeof record.requestId === "string" ? record.requestId.trim() : "",
  };
}

export function splitQuestionGenerationBatches<T>(items: readonly T[], batchSize = GENERATION_BATCH_SIZE): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("حجم دفعة التوليد غير صالح.");
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

function generationItem(item: PlanItem): QuestionGenerationItem {
  if (!item.sourceReferenceId) throw new Error("إحدى مفردات الخطة غير مرتبطة بصفحة مصدر.");
  return {
    planItemId: item.id,
    questionType: item.questionType,
    cognitiveLevel: item.cognitiveLevel,
    ...(item.difficultyLevel ? { difficultyLevel: item.difficultyLevel } : {}),
    marks: item.marks,
    sourceReferenceId: item.sourceReferenceId,
    lessonLabel: item.lessonLabel,
  };
}

export function buildQuestionGenerationRequest(
  assessmentType: AssessmentType,
  topic: string,
  lessons: readonly string[],
  grade: number,
  subject: string,
  difficulty: Difficulty,
  references: ExamSourceReference[],
  requestedPlan: PlanItem[],
  officialPlan: PlanItem[] = requestedPlan,
): QuestionGenerationRequest {
  const normalizedLessons = lessons.map((lesson) => lesson.trim()).filter(Boolean);
  if (normalizedLessons.length < 2 || normalizedLessons.length > 5) {
    throw new Error("يجب أن يحتوي الاختبار على درسين إلى خمسة دروس.");
  }
  const referenceById = new Map(references.map((reference) => [reference.id, reference]));
  const usedReferenceIds = new Set(requestedPlan.map((item) => item.sourceReferenceId).filter((id): id is string => Boolean(id)));
  const requestReferences = [...usedReferenceIds].map((referenceId) => {
    const reference = referenceById.get(referenceId);
    if (!reference) throw new Error("تعذر العثور على مرجع إحدى مفردات الخطة.");
    return {
      id: reference.id,
      sourceTitle: reference.sourceTitle,
      sourceKind: reference.sourceKind,
      pageFrom: reference.pageFrom,
      pageTo: reference.pageTo,
      content: (reference.context ?? reference.excerpt).trim(),
    };
  });
  return {
    assessmentType,
    assessmentPolicyId: SCIENCE_ASSESSMENT_POLICY_ID,
    topic: topic.trim(),
    lessons: normalizedLessons,
    grade,
    subject,
    difficulty,
    references: requestReferences,
    officialPlanItems: officialPlan.map(generationItem),
    items: requestedPlan.map(generationItem),
  };
}

export function applyGeneratedQuestions(
  plan: PlanItem[],
  response: QuestionGenerationResponse,
): PlanItem[] {
  const generatedById = new Map(response.items.map((item) => [item.planItemId, item]));
  return plan.map((item) => {
    const generated = generatedById.get(item.id);
    if (!generated) throw new Error("تعذر ربط الأسئلة المولدة بخطة الاختبار.");
    const proposals: QuestionProposal[] = generated.alternatives.map((alternative, index) => ({
      id: `${item.id}-proposal-${index + 1}`,
      text: alternative.text,
      options: alternative.options,
      answer: alternative.answer,
      rationale: alternative.rationale,
      sourceSupport: alternative.sourceSupport,
      needsReview: alternative.needsReview,
    }));
    return { ...item, proposals };
  });
}

export class QuestionGenerationService {
  private readonly endpoint: string;
  private readonly publishableKey: string;

  constructor(
    config: WathiqRuntimeConfig,
    private readonly sessionProvider: SessionProvider,
    private readonly fetcher: FetchLike = browserFetch,
  ) {
    this.endpoint = `${config.supabaseUrl}/functions/v1/generate-source-questions`;
    this.publishableKey = config.supabasePublishableKey;
  }

  async generate(request: QuestionGenerationRequest): Promise<QuestionGenerationResponse> {
    const session = await this.sessionProvider();
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 68_000);
    try {
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      let payload: unknown = null;
      const text = await response.text();
      if (text) {
        try { payload = JSON.parse(text) as unknown; }
        catch { payload = { error: text }; }
      }
      if (!response.ok) {
        throw new Error(errorMessage(payload, `تعذر إنشاء الأسئلة (${response.status}).`));
      }
      return parseQuestionGenerationResponse(payload, request.items);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("تأخرت دفعة توليد الأسئلة أكثر من 65 ثانية. أعد المحاولة؛ لن تُفقد الدفعات المكتملة.");
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}
