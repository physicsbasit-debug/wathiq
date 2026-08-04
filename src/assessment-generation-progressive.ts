import type {
  ExamDraft,
  ExamSourceReference,
  ManagedSource,
  PlanItem,
  QuestionDesignPattern,
  QuestionVisualType,
} from "./types.js";
import {
  buildAssessmentBlueprint,
  buildAssessmentItemContracts,
  sourceContentHash,
  type AssessmentBlueprint,
  type AssessmentItemContract,
  type AssessmentItemSeed,
  type AssessmentScenarioTarget,
  type AssessmentSkillTarget,
  type AssessmentSourceSnapshot,
  type AssessmentStimulusTarget,
  type ScientificContractKey,
} from "./assessment-engine/index.js";

export const ASSESSMENT_PROGRESSIVE_GENERATION_VERSION = "assessment-engine-v1-progressive";

export interface ProgressiveGenerationPayload {
  blueprint: AssessmentBlueprint;
  contracts: AssessmentItemContract[];
}

export interface ProgressiveGenerationBuildInput {
  draft: ExamDraft;
  subject: string;
  sources: readonly ManagedSource[];
}

function normalizeArabic(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "")
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function derivePattern(item: PlanItem, index: number, subject: string): QuestionDesignPattern {
  const normalizedSubject = normalizeArabic(subject);
  const physicalScience = normalizedSubject.includes("فيزياء") || normalizedSubject.includes("كيمياء");
  if (item.questionType === "إجابة طويلة") {
    if (item.cognitiveLevel === "استدلال") return "استقصائي";
    if (item.cognitiveLevel === "تطبيق" && physicalScience) return "حسابي";
    return index % 2 === 0 ? "بيانات" : "استقصائي";
  }
  if (item.cognitiveLevel === "استدلال") return (["بيانات", "استقصائي", "مقارنة"] as const)[index % 3] ?? "بيانات";
  if (item.cognitiveLevel === "تطبيق") {
    const cycle = normalizedSubject.includes("فيزياء")
      ? (["سياقي", "حسابي", "بيانات"] as const)
      : normalizedSubject.includes("كيمياء")
        ? (["سياقي", "بيانات", "استقصائي"] as const)
        : (["سياقي", "بيانات", "مقارنة"] as const);
    return cycle[Math.max(0, index - 1) % cycle.length] ?? "سياقي";
  }
  if (item.marks >= 2) return "مقارنة";
  if (item.questionType === "اختيار من متعدد") return index === 0 ? "مفهومي" : index % 2 === 0 ? "بيانات" : "سياقي";
  return index === 0 ? "مفهومي" : index % 3 === 0 ? "بيانات" : "سياقي";
}

function scientificKey(evidence: string): ScientificContractKey {
  const text = normalizeArabic(evidence);
  if (/(عزم|محور دوران|ذراع القوه|نقطه ارتكاز|اتزان دوراني)/u.test(text)) return "moment";
  if (/(كهرباء ساكنه|شحنه|شحنت|الكترون|تجاذب|تنافر|مجال كهربائي)/u.test(text)) return "electrostatic";
  if (/(ضغط|سائل|عمق|كثافه|طفو)/u.test(text)) return "pressure";
  if (/(دائره كهربائيه|بطاريه|مصباح|مقاوم|تيار|جهد|اميتر|فولتميتر)/u.test(text)) return "circuit";
  if (/(انعكاس|انكسار|عدسه|مراه|منشور|شعاع|ضوء)/u.test(text)) return "optics";
  if (/(ترمومتر|ميزان حراره|مخبار|سحاحه|تدريج|قراءه جهاز|مسطره مدرجه)/u.test(text)) return "instrument";
  if (/(رسم بياني|منحنى|محور افقي|محور راسي|اتجاه بياني)/u.test(text)) return "graph";
  if (/(جدول|بيانات|نتائج تجربه|سجل القراءات|قياسات)/u.test(text)) return "table";
  if (/(خطوات|مراحل|تسلسل|تحول|دوره|عمليه|مسار)/u.test(text)) return "process";
  if (/(قوه|قوى|احتكاك|وزن|شد|رد فعل|اتزان|محصله)/u.test(text)) return "force";
  return "generic";
}

const DEFAULT_SCENARIOS: readonly AssessmentScenarioTarget[] = [
  "school_bag", "door_handle", "laboratory_setup", "shopping_trolley", "road_safety", "solar_panel", "water_tank", "bicycle_brake",
];

function scenarioFor(key: ScientificContractKey, pattern: QuestionDesignPattern, index: number): AssessmentScenarioTarget {
  if (pattern === "مفهومي") return "scientific_abstract";
  const cycles: Partial<Record<ScientificContractKey, readonly AssessmentScenarioTarget[]>> = {
    moment: ["door_handle", "playground_seesaw", "wrench_tool", "bicycle_brake", "shopping_trolley"],
    force: ["shopping_trolley", "school_bag", "road_safety", "bicycle_brake", "laboratory_setup"],
    pressure: ["water_tank", "laboratory_setup", "school_bag", "shopping_trolley"],
    circuit: ["solar_panel", "laboratory_setup", "road_safety"],
    optics: ["road_safety", "laboratory_setup", "solar_panel"],
  };
  const cycle = cycles[key] ?? DEFAULT_SCENARIOS;
  return cycle[index % cycle.length] ?? "laboratory_setup";
}

function skillFor(item: PlanItem, pattern: QuestionDesignPattern): AssessmentSkillTarget {
  if (pattern === "حسابي") return "calculate";
  if (pattern === "بيانات") return item.cognitiveLevel === "استدلال" ? "interpret" : "apply";
  if (pattern === "مقارنة") return "compare";
  if (pattern === "استقصائي") return item.cognitiveLevel === "استدلال" ? "evaluate" : "investigate";
  if (pattern === "سياقي") return "apply";
  return "recognize";
}

function visualFor(
  key: ScientificContractKey,
  pattern: QuestionDesignPattern,
  item: PlanItem,
): QuestionVisualType {
  const simpleRecall = item.cognitiveLevel === "معرفة" && item.marks === 1 && pattern === "مفهومي";
  if (simpleRecall) return "none";
  if (key === "moment") return pattern === "سياقي" || pattern === "استقصائي" ? "context_scene" : pattern === "بيانات" ? "data_table" : "force_diagram";
  if (key === "force") return pattern === "سياقي" || pattern === "استقصائي" ? "context_scene" : pattern === "بيانات" ? "data_table" : "force_diagram";
  if (key === "electrostatic") return pattern === "بيانات" ? "data_table" : "electrostatic_diagram";
  if (key === "pressure") return pattern === "سياقي" ? "context_scene" : pattern === "بيانات" || item.cognitiveLevel === "استدلال" ? "data_table" : "pressure_diagram";
  if (key === "circuit") return pattern === "سياقي" ? "context_scene" : pattern === "بيانات" ? "data_table" : "circuit_diagram";
  if (key === "optics") return "ray_diagram";
  if (key === "instrument") return "instrument_scale";
  if (key === "graph") return "line_graph";
  if (key === "table") return "data_table";
  if (key === "process") return "flow_diagram";
  return pattern === "سياقي" && item.cognitiveLevel !== "معرفة" ? "context_scene" : "none";
}

function stimulusFor(pattern: QuestionDesignPattern, visual: QuestionVisualType): AssessmentStimulusTarget {
  if (visual === "context_scene") return "real_life_scene";
  if (visual === "data_table") return "data_table";
  if (visual === "line_graph" || visual === "bar_chart") return "graph";
  if (visual === "instrument_scale") return "instrument";
  if (visual !== "none") return "scientific_diagram";
  if (pattern === "استقصائي") return "experiment";
  if (pattern === "مقارنة") return "decision_case";
  if (pattern === "سياقي") return "real_life_scene";
  return "concise_text";
}

function requirementsFor(key: ScientificContractKey): string[] {
  const requirements: Record<ScientificContractKey, string[]> = {
    moment: ["محور الدوران", "موضع تأثير القوة", "ذراع القوة", "اتجاه العزم"],
    force: ["القوى المؤثرة", "اتجاه كل قوة", "القوة المحصلة"],
    electrostatic: ["نوع الشحنة", "العلاقة بين الشحنات", "اتجاه التأثير"],
    pressure: ["القوة", "المساحة أو العمق", "وحدة الضغط"],
    circuit: ["مصدر الطاقة", "المكونات", "مسار التيار"],
    optics: ["الشعاع", "العمود المقام", "الزاوية أو اتجاه الانحراف"],
    instrument: ["التدريج", "الوحدة", "موضع القراءة"],
    graph: ["المحاور", "الوحدات", "اتجاه التغير"],
    table: ["عناوين الأعمدة", "الوحدات", "القيم اللازمة للإجابة"],
    process: ["ترتيب المراحل", "المدخلات", "الناتج"],
    generic: ["الارتباط المباشر بهدف التعلم", "قابلية الحل من المعطيات الظاهرة"],
  };
  return [...requirements[key]];
}

function visualPriority(seed: AssessmentItemSeed): number {
  if (seed.visualTarget === "none") return 0;
  let score = ["data_table", "line_graph", "bar_chart", "instrument_scale", "ray_diagram", "force_diagram", "circuit_diagram", "pressure_diagram", "electrostatic_diagram", "flow_diagram"].includes(seed.visualTarget) ? 40 : 15;
  if (seed.styleTarget === "بيانات" || seed.styleTarget === "حسابي") score += 25;
  if (seed.cognitiveLevel === "استدلال") score += 12;
  if (seed.marks >= 2) score += 8;
  return score;
}

function applyVisualBudget(seeds: AssessmentItemSeed[]): AssessmentItemSeed[] {
  const maxVisuals = seeds.length <= 6 ? 4 : seeds.length <= 10 ? 5 : 6;
  const essential = new Set(seeds.map((seed, index) => ({ seed, index }))
    .filter(({ seed }) => seed.scientificContractKey === "moment" && seed.skillTarget !== "recognize")
    .map(({ index }) => index));
  const remaining = Math.max(0, maxVisuals - essential.size);
  const selected = new Set([
    ...essential,
    ...seeds.map((seed, index) => ({ index, score: essential.has(index) ? 0 : visualPriority(seed) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, remaining)
      .map(({ index }) => index),
  ]);
  return seeds.map((seed, index) => seed.visualTarget === "none" || selected.has(index)
    ? seed
    : {
      ...seed,
      visualTarget: "none",
      stimulusTarget: stimulusFor(seed.styleTarget, "none"),
      diversityKey: `${seed.styleTarget}|none|${seed.scenarioTarget}|${seed.skillTarget}|${index + 1}`,
    });
}

function referenceChunkIndex(reference: ExamSourceReference): number {
  const prefix = `${reference.sourceId}:`;
  if (!reference.id.startsWith(prefix)) throw new Error(`مرجع المصدر ${reference.id} لا يتبع معرف المصدر ${reference.sourceId}.`);
  const raw = reference.id.slice(prefix.length).split(":", 1)[0] ?? "";
  const chunkIndex = Number(raw);
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0) throw new Error(`تعذر قراءة رقم مقطع المرجع ${reference.id}.`);
  return chunkIndex;
}

async function sourceSnapshot(
  reference: ExamSourceReference,
  source: ManagedSource | undefined,
): Promise<AssessmentSourceSnapshot> {
  const content = (reference.context ?? reference.excerpt).trim();
  if (!content) throw new Error(`مقطع المرجع ${reference.id} فارغ.`);
  if (!source?.extractionVersion?.trim()) throw new Error(`لا يوجد إصدار استخراج موثق للمصدر ${reference.sourceTitle}.`);
  return {
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

export async function buildProgressiveGenerationPayload(
  input: ProgressiveGenerationBuildInput,
): Promise<ProgressiveGenerationPayload> {
  const { draft, subject, sources } = input;
  if (draft.grade === null) throw new Error("الصف الدراسي غير محدد.");
  if (!draft.plan.length) throw new Error("لا توجد خطة اختبار لبناء دورة التوليد.");
  if (!Number.isSafeInteger(draft.generationEpoch) || draft.generationEpoch < 1) throw new Error("رقم دورة التوليد غير صالح.");
  const references = new Map(draft.sourceReferences.map((reference) => [reference.id, reference]));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const snapshots = new Map<string, AssessmentSourceSnapshot>();
  const rawSeeds: AssessmentItemSeed[] = [];

  for (let index = 0; index < draft.plan.length; index += 1) {
    const item = draft.plan[index];
    if (!item?.sourceReferenceId) throw new Error(`المفردة ${index + 1} غير مرتبطة بمصدر.`);
    const reference = references.get(item.sourceReferenceId);
    if (!reference) throw new Error(`تعذر العثور على مرجع المفردة ${index + 1}.`);
    if (!snapshots.has(reference.id)) snapshots.set(reference.id, await sourceSnapshot(reference, sourcesById.get(reference.sourceId)));
    const evidence = `${item.lessonLabel} ${item.outcomeLabel} ${reference.context ?? reference.excerpt}`;
    const pattern = derivePattern(item, index, subject);
    const key = scientificKey(evidence);
    const scenario = scenarioFor(key, pattern, index);
    const skill = skillFor(item, pattern);
    const visual = visualFor(key, pattern, item);
    rawSeeds.push({
      planItemId: item.id,
      lessonId: item.lessonId,
      lessonLabel: item.lessonLabel,
      outcomeId: item.outcomeId,
      outcomeLabel: item.outcomeLabel,
      questionType: item.questionType,
      cognitiveLevel: item.cognitiveLevel,
      ...(item.difficultyLevel ? { difficultyLevel: item.difficultyLevel } : {}),
      marks: item.marks,
      styleTarget: pattern,
      visualTarget: visual,
      scenarioTarget: scenario,
      stimulusTarget: stimulusFor(pattern, visual),
      skillTarget: skill,
      diversityKey: `${pattern}|${visual}|${scenario}|${skill}|${index + 1}`,
      sourceReferenceId: reference.id,
      scientificContractKey: key,
      scientificRequirements: requirementsFor(key),
    });
  }

  const blueprint = await buildAssessmentBlueprint({
    draftId: draft.id,
    generationEpoch: draft.generationEpoch,
    assessmentType: draft.assessmentType,
    assessmentPolicyId: draft.assessmentPolicyId,
    grade: draft.grade,
    subject,
    topic: draft.topic,
    difficulty: draft.difficulty,
    items: applyVisualBudget(rawSeeds),
    sourcesByReferenceId: snapshots,
  });
  return { blueprint, contracts: await buildAssessmentItemContracts(blueprint) };
}
