import type {
  AssessmentType,
  CognitiveLevel,
  Difficulty,
  ExamSourceReference,
  ItemDifficulty,
  PlanItem,
  QuestionDesignPattern,
  QuestionProposal,
  QuestionType,
  QuestionVisualSpec,
  QuestionVisualType,
} from "./types.js";
import type { OwnerSession } from "./central-source-store.js";
import type { WathiqRuntimeConfig } from "./runtime-config.js";
import type { LessonCatalogOption } from "./lesson-catalog.js";
import { SCIENCE_ASSESSMENT_POLICY_ID } from "./assessment-policy.js";
import { parseQuestionVisualSpec } from "./question-visual.js";

export const SOURCE_GENERATION_VERSION = "source-grounded-policy-ai-12-advanced-visuals";
export const GENERATION_BATCH_SIZE = 2;

export type QuestionReferenceScopeMode = "page-range" | "page-neighborhood" | "strict-title-fallback" | "legacy-title";

export interface QuestionGenerationReference {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceKind: string;
  pageFrom: number;
  pageTo: number;
  content: string;
  lessonTopic: string;
  lessonScopeMode: QuestionReferenceScopeMode;
  lessonPageFrom?: number;
  lessonPageTo?: number;
}

export interface QuestionRegenerationAnchor {
  stimulus: string;
  text: string;
  answer: string;
  questionForm: QuestionDesignPattern;
}

export interface QuestionGenerationItem {
  planItemId: string;
  questionType: QuestionType;
  cognitiveLevel: CognitiveLevel;
  difficultyLevel?: ItemDifficulty;
  marks: number;
  sourceReferenceId: string;
  lessonLabel: string;
  styleTarget: QuestionDesignPattern;
  visualTarget: QuestionVisualType;
  regenerationAnchor?: QuestionRegenerationAnchor;
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
  stimulus: string;
  text: string;
  options: string[];
  answer: string;
  rationale: string;
  markScheme: string[];
  questionForm: QuestionDesignPattern;
  workingRequired: boolean;
  sourceSupport: string;
  needsReview: boolean;
}

export interface GeneratedQuestionItem {
  planItemId: string;
  visual: QuestionVisualSpec;
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

const QUESTION_DESIGN_PATTERNS: readonly QuestionDesignPattern[] = [
  "مفهومي", "سياقي", "حسابي", "بيانات", "استقصائي", "مقارنة",
];

function isQuestionDesignPattern(value: unknown): value is QuestionDesignPattern {
  return typeof value === "string" && (QUESTION_DESIGN_PATTERNS as readonly string[]).includes(value);
}

function parseAlternative(value: unknown, expected: QuestionGenerationItem): GeneratedAlternative {
  const record = asRecord(value);
  if (!record) throw new Error("استجابة مولد الأسئلة تحتوي بديلًا غير صالح.");
  const stimulus = typeof record.stimulus === "string" ? record.stimulus.trim() : "";
  const text = typeof record.text === "string" ? record.text.trim() : "";
  const options = Array.isArray(record.options)
    ? record.options.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  const answer = typeof record.answer === "string" ? record.answer.trim() : "";
  const rationale = typeof record.rationale === "string" ? record.rationale.trim() : "";
  const markScheme = Array.isArray(record.markScheme)
    ? record.markScheme.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  const questionForm = isQuestionDesignPattern(record.questionForm) ? record.questionForm : null;
  const workingRequired = record.workingRequired === true;
  const sourceSupport = typeof record.sourceSupport === "string" ? record.sourceSupport.trim() : "";
  const needsReview = record.needsReview === true;

  if (!text || !answer || !rationale || !sourceSupport || !questionForm) {
    throw new Error("استجابة مولد الأسئلة ناقصة ولا تصلح للعرض.");
  }
  if (questionForm !== expected.styleTarget) {
    throw new Error("مولد الأسئلة لم يلتزم بنمط السؤال المحدد في الخطة.");
  }
  if (markScheme.length !== expected.marks) {
    throw new Error("نموذج التصحيح لا يوزع نقطة واضحة لكل درجة.");
  }
  if (["سياقي", "حسابي", "بيانات", "استقصائي"].includes(questionForm) && !stimulus) {
    throw new Error("أحد الأسئلة السياقية لا يحتوي متنًا أو بيانات كافية.");
  }
  if (questionForm === "حسابي" && !workingRequired) {
    throw new Error("السؤال الحسابي لا يطلب إظهار خطوات الحل.");
  }
  if (expected.visualTarget !== "none") {
    const visualReference = normalizeVisualText(`${stimulus} ${text}`);
    if (!/(الشكل|الرسم|المخطط|الدائره|البيانات الممثله|التمثيل)/u.test(visualReference)) {
      throw new Error("السؤال البصري لا يعتمد صراحة على الشكل المرفق.");
    }
  }
  if (expected.questionType === "اختيار من متعدد") {
    if (options.length !== 4 || new Set(options).size !== 4) {
      throw new Error("أحد أسئلة الاختيار من متعدد لا يحتوي أربعة بدائل مختلفة.");
    }
    if (!options.includes(answer)) {
      throw new Error("الإجابة الصحيحة لا تطابق أحد بدائل سؤال الاختيار من متعدد.");
    }
  } else if (options.length !== 0) {
    throw new Error("سؤال غير موضوعي أعاد بدائل اختيار من متعدد على نحو غير صالح.");
  }

  return { stimulus, text, options, answer, rationale, markScheme, questionForm, workingRequired, sourceSupport, needsReview };
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
      visual: parseQuestionVisualSpec(itemRecord.visual, expected.visualTarget),
      alternatives: itemRecord.alternatives.map((alternative) => parseAlternative(alternative, expected)),
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
  let current: T[] = [];
  const isHeavy = (item: T): boolean => {
    if (typeof item !== "object" || item === null) return false;
    const record = item as Record<string, unknown>;
    return record.questionType === "إجابة طويلة"
      || record.cognitiveLevel === "تطبيق"
      || record.cognitiveLevel === "استدلال"
      || (typeof record.marks === "number" && record.marks >= 2)
      || (typeof record.visualTarget === "string" && record.visualTarget !== "none");
  };
  const flush = () => { if (current.length) { batches.push(current); current = []; } };
  for (const item of items) {
    if (isHeavy(item)) {
      flush();
      batches.push([item]);
      continue;
    }
    current.push(item);
    if (current.length >= batchSize) flush();
  }
  flush();
  return batches;
}

function deriveQuestionDesignPattern(
  item: PlanItem,
  officialIndex: number,
  subject: string,
): QuestionDesignPattern {
  const normalizedSubject = subject.trim();
  if (item.questionType === "إجابة طويلة") {
    if (item.cognitiveLevel === "استدلال") return "استقصائي";
    if (normalizedSubject.includes("فيزياء") || normalizedSubject.includes("كيمياء")) return "حسابي";
    return officialIndex % 2 === 0 ? "بيانات" : "استقصائي";
  }
  if (item.cognitiveLevel === "استدلال") return officialIndex % 2 === 0 ? "بيانات" : "استقصائي";
  if (item.cognitiveLevel === "تطبيق") {
    if (normalizedSubject.includes("فيزياء")) return officialIndex % 2 === 0 ? "حسابي" : "بيانات";
    if (normalizedSubject.includes("كيمياء")) return officialIndex % 2 === 0 ? "سياقي" : "بيانات";
    return officialIndex % 2 === 0 ? "بيانات" : "سياقي";
  }
  if (item.marks >= 2) return "مقارنة";
  return item.questionType === "اختيار من متعدد" && officialIndex % 2 === 1 ? "سياقي" : "مفهومي";
}

function normalizeVisualText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

function deriveQuestionVisualTarget(
  item: PlanItem,
  officialIndex: number,
  subject: string,
  referenceContent: string,
): QuestionVisualType {
  const normalizedSubject = normalizeVisualText(subject);
  const evidence = normalizeVisualText(`${item.lessonLabel} ${referenceContent}`);
  const pattern = deriveQuestionDesignPattern(item, officialIndex, subject);
  if (normalizedSubject.includes("فيزياء")) {
    if (/(ترمومتر|ميزان حراره|مخبار|سحاحه|تدريج|قراءه جهاز|اميتر|فولتميتر|مسطره مدرجه)/u.test(evidence)) {
      return "instrument_scale";
    }
    if (/(انعكاس|انكسار|عدسه|مرآه|مراه|شعاع ضوئي|اشعه ضوئيه|ضوء|منشور|بصريات|زاويه السقوط|زاويه الانكسار)/u.test(evidence)) {
      return item.cognitiveLevel === "معرفة" && item.marks === 1 ? "none" : "ray_diagram";
    }
    if (/(قوه|قوى|احتكاك|وزن|شد|رد فعل|اتزان|عزم|نقطه ارتكاز|مخطط جسم حر)/u.test(evidence)) {
      return item.cognitiveLevel === "معرفة" && item.marks === 1 ? "none" : "force_diagram";
    }
    if (/(خطوات|مراحل|تسلسل|تحول|دوره|عمليه|مسار)/u.test(evidence) && item.cognitiveLevel !== "معرفة") {
      return "flow_diagram";
    }
    if (/(جدول|قياسات|نتائج تجربه|سجل القراءات|بيانات التجربه)/u.test(evidence)) {
      return "data_table";
    }
    if (/(كهرباء ساكنه|كهربائيه ساكنه|شحنه|شحنت|الكترون|بروتون|مجال كهربائي|دلك|مسطره|قماش|تجاذب|تنافر|موصل|عازل)/u.test(evidence)) {
      if (item.cognitiveLevel === "معرفة" && item.marks === 1 && pattern === "مفهومي") return "none";
      return "electrostatic_diagram";
    }
    if (/(دائره|بطاريه|مصباح|مقاوم|تيار|جهد|مكثف|اميتر|فولتميتر)/u.test(evidence)) {
      if (item.cognitiveLevel === "معرفة" && item.marks === 1) return "none";
      return "circuit_diagram";
    }
    if (/(ضغط|سائل|عمق|كثافه|طفو)/u.test(evidence)) {
      if (item.cognitiveLevel === "معرفة" || item.marks === 1) return "none";
      if (pattern === "بيانات" || item.cognitiveLevel === "استدلال") return "line_graph";
      if (pattern === "مقارنة" && officialIndex % 2 === 1) return "none";
      return "pressure_diagram";
    }
    if (/(مسافه.{0,30}زمن|سرعه.{0,30}زمن|درجه حراره.{0,30}زمن|زمن.{0,30}(مسافه|سرعه|درجه حراره))/u.test(evidence)) {
      return item.cognitiveLevel === "معرفة" && item.marks === 1 ? "none" : "line_graph";
    }
    if (/(رسم بياني بالاعمده|مخطط اعمده|اعمده بيانيه)/u.test(evidence)) {
      return item.cognitiveLevel === "معرفة" && item.marks === 1 ? "none" : "bar_chart";
    }
  }
  return "none";
}

function generationItem(
  item: PlanItem,
  officialIndex: number,
  subject: string,
  referenceContent: string,
): QuestionGenerationItem {
  if (!item.sourceReferenceId) throw new Error("إحدى مفردات الخطة غير مرتبطة بصفحة مصدر.");
  return {
    planItemId: item.id,
    questionType: item.questionType,
    cognitiveLevel: item.cognitiveLevel,
    ...(item.difficultyLevel ? { difficultyLevel: item.difficultyLevel } : {}),
    marks: item.marks,
    sourceReferenceId: item.sourceReferenceId,
    lessonLabel: item.lessonLabel,
    styleTarget: deriveQuestionDesignPattern(item, officialIndex, subject),
    visualTarget: deriveQuestionVisualTarget(item, officialIndex, subject, referenceContent),
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
  lessonCatalog: readonly LessonCatalogOption[] = [],
): QuestionGenerationRequest {
  const normalizedLessons = lessons.map((lesson) => lesson.trim()).filter(Boolean);
  if (normalizedLessons.length < 2 || normalizedLessons.length > 5) {
    throw new Error("يجب أن يحتوي الاختبار على درسين إلى خمسة دروس.");
  }
  const referenceById = new Map(references.map((reference) => [reference.id, reference]));
  const lessonByReferenceId = new Map<string, string>();
  for (const item of officialPlan) {
    if (item.sourceReferenceId && !lessonByReferenceId.has(item.sourceReferenceId)) {
      lessonByReferenceId.set(item.sourceReferenceId, item.lessonLabel);
    }
  }
  const catalogByLessonAndSource = new Map(
    lessonCatalog.map((lesson) => [`${lesson.sourceId}::${lesson.label}`, lesson] as const),
  );
  const usedReferenceIds = new Set(requestedPlan.map((item) => item.sourceReferenceId).filter((id): id is string => Boolean(id)));
  const requestReferences = [...usedReferenceIds].map((referenceId) => {
    const reference = referenceById.get(referenceId);
    if (!reference) throw new Error("تعذر العثور على مرجع إحدى مفردات الخطة.");
    const lessonTopic = (reference.lessonTopic ?? lessonByReferenceId.get(referenceId) ?? "").trim();
    if (!lessonTopic) throw new Error("تعذر تحديد الدرس المرتبط بمرجع إحدى المفردات.");
    const catalogLesson = catalogByLessonAndSource.get(`${reference.sourceId}::${lessonTopic}`);
    const lessonPageFrom = catalogLesson?.pageStart;
    const lessonPageTo = catalogLesson?.pageEnd ?? lessonPageFrom;
    const overlaps = (from: number, to: number) => reference.pageFrom <= to && reference.pageTo >= from;
    const lessonScopeMode: QuestionReferenceScopeMode = lessonPageFrom && lessonPageTo
      ? overlaps(lessonPageFrom, lessonPageTo)
        ? "page-range"
        : overlaps(Math.max(1, lessonPageFrom - 3), lessonPageTo + 3)
          ? "page-neighborhood"
          : "strict-title-fallback"
      : "legacy-title";
    return {
      id: reference.id,
      sourceId: reference.sourceId,
      sourceTitle: reference.sourceTitle,
      sourceKind: reference.sourceKind,
      pageFrom: reference.pageFrom,
      pageTo: reference.pageTo,
      content: (reference.context ?? reference.excerpt).trim(),
      lessonTopic,
      lessonScopeMode,
      ...(lessonPageFrom && lessonPageTo ? { lessonPageFrom, lessonPageTo } : {}),
    };
  });
  const officialIndexById = new Map(officialPlan.map((item, index) => [item.id, index]));
  return {
    assessmentType,
    assessmentPolicyId: SCIENCE_ASSESSMENT_POLICY_ID,
    topic: topic.trim(),
    lessons: normalizedLessons,
    grade,
    subject,
    difficulty,
    references: requestReferences,
    officialPlanItems: officialPlan.map((item, index) => {
      const reference = item.sourceReferenceId ? referenceById.get(item.sourceReferenceId) : undefined;
      return generationItem(item, index, subject, (reference?.context ?? reference?.excerpt ?? "").trim());
    }),
    items: requestedPlan.map((item) => {
      const officialIndex = officialIndexById.get(item.id);
      if (officialIndex === undefined) throw new Error("إحدى مفردات الدفعة غير موجودة في الخطة الرسمية.");
      const reference = item.sourceReferenceId ? referenceById.get(item.sourceReferenceId) : undefined;
      return generationItem(item, officialIndex, subject, (reference?.context ?? reference?.excerpt ?? "").trim());
    }),
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
      ...(alternative.stimulus ? { stimulus: alternative.stimulus } : {}),
      text: alternative.text,
      options: alternative.options,
      answer: alternative.answer,
      rationale: alternative.rationale,
      markScheme: alternative.markScheme,
      questionForm: alternative.questionForm,
      workingRequired: alternative.workingRequired,
      sourceSupport: alternative.sourceSupport,
      needsReview: alternative.needsReview,
    }));
    return { ...item, visual: generated.visual, proposals };
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
