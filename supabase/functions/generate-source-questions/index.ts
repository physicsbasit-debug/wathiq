import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = requiredEnv("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-2.5-flash";
const GEMINI_IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL")?.trim() || "gemini-3.1-flash-image";
const WATHIQ_APP_URL = requiredEnv("WATHIQ_APP_URL");
const appOrigin = new URL(WATHIQ_APP_URL).origin;
const MAX_BATCH_ITEMS = 2;
const MAX_WHOLE_EXAM_ITEMS = 12;
const MAX_OFFICIAL_ITEMS = 40;
const MAX_REFERENCES = 6;
const MAX_REFERENCE_CHARACTERS = 4_200;
const MAX_TOTAL_REFERENCE_CHARACTERS = 24_000;
const GEMINI_TIMEOUT_MS = 30_000;
const ENRICHMENT_TIMEOUT_MS = 14_000;
const ENRICHMENT_CACHE_TTL_MS = 20 * 60_000;
const ENRICHMENT_MAX_SEGMENTS = 6;
const MARK_SCHEME_REPAIR_TIMEOUT_MS = 12_000;
const MARK_SCHEME_REPAIR_MAX_OUTPUT_TOKENS = 900;
const IMAGE_GENERATION_TIMEOUT_MS = 48_000;
const IMAGE_VALIDATION_TIMEOUT_MS = 18_000;
const QUESTION_VISUAL_BUCKET = "wathiq-question-visuals";
const VISUAL_PROMPT_VERSION = "wathiq-visual-first-2d-v3-scientific-quality";
const MAX_IMAGE_BASE64_CHARACTERS = 16_000_000;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
const GEMINI_IMAGE_API_URL = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(GEMINI_IMAGE_MODEL)}:generateContent`;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type QuestionType = "اختيار من متعدد" | "إجابة قصيرة" | "إجابة طويلة";
type CognitiveLevel = "معرفة" | "تطبيق" | "استدلال";
type Difficulty = "سهل" | "متوسط" | "متقدم";
type ItemDifficulty = "منخفض" | "متوسط" | "مرتفع";
type AssessmentType = "اختبار قصير رسمي" | "امتحان نهاية الفصل الدراسي";
type QuestionDesignPattern = "مفهومي" | "سياقي" | "حسابي" | "بيانات" | "استقصائي" | "مقارنة";
type QuestionVisualType = "none" | "context_scene" | "line_graph" | "bar_chart" | "pressure_diagram" | "circuit_diagram" | "electrostatic_diagram" | "data_table" | "instrument_scale" | "ray_diagram" | "force_diagram" | "flow_diagram";
type QuestionVisualVariant = "default" | "door_handle" | "playground_seesaw" | "wrench_tool" | "bicycle_brake" | "shopping_trolley" | "school_bag" | "water_tank" | "solar_panel" | "laboratory_setup" | "road_safety" | "submerged_object" | "depth_comparison" | "force_area" | "liquid_column" | "series_circuit" | "measurement_circuit" | "charge_transfer" | "attraction_repulsion" | "electric_field" | "trend" | "comparison" | "multi_series" | "table_completion" | "table_comparison" | "thermometer" | "burette" | "measuring_cylinder" | "meter_scale" | "reflection" | "refraction" | "converging_lens" | "prism" | "free_body" | "balanced_forces" | "moments" | "linear_flow" | "cycle_flow" | "state_change";
type QuestionVisualRole = "read" | "calculate" | "interpret" | "compare" | "complete" | "draw" | "evaluate";
type CircuitComponent = "battery" | "switch_open" | "switch_closed" | "lamp" | "resistor" | "motor" | "ammeter" | "voltmeter";
type QuestionScenarioTarget = "scientific_abstract" | "door_handle" | "playground_seesaw" | "wrench_tool" | "bicycle_brake" | "shopping_trolley" | "school_bag" | "water_tank" | "solar_panel" | "laboratory_setup" | "road_safety";
type QuestionStimulusTarget = "concise_text" | "real_life_scene" | "scientific_diagram" | "data_table" | "graph" | "instrument" | "experiment" | "decision_case";
type QuestionSkillTarget = "recognize" | "apply" | "calculate" | "interpret" | "compare" | "evaluate" | "investigate";

interface VisualReferenceNormalization {
  stimulus: string;
  text: string;
  changed: boolean;
  hasReference: boolean;
  prefix: string;
}

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]/gu;
const VISUAL_REFERENCE_PATTERN = /(الشكل|الصوره|الرسم(?: البياني)?|مخطط|المخطط|الدائره|الجدول|التدريج|الجهاز|البيانات الممثله|التمثيل|المشهد)/u;

function normalizeArabic(value: string): string {
  return value
    .normalize("NFKC")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه")
    .replace(/\s+/gu, " ")
    .trim();
}

function hasExplicitVisualReference(value: string): boolean {
  return VISUAL_REFERENCE_PATTERN.test(normalizeArabic(value));
}

function visualReferencePrefix(visualType: string): string {
  switch (visualType) {
    case "context_scene":
      return "بالاستعانة بالمشهد المرفق،";
    case "line_graph":
    case "bar_chart":
      return "بالاستعانة بالرسم البياني المرفق،";
    case "data_table":
      return "بالاستعانة بالجدول المرفق،";
    case "instrument_scale":
      return "بالاستعانة بتدريج الجهاز المرفق،";
    case "circuit_diagram":
      return "بالاستعانة بمخطط الدائرة المرفق،";
    case "force_diagram":
      return "بالاستعانة بمخطط القوى المرفق،";
    case "ray_diagram":
      return "بالاستعانة بمخطط الأشعة المرفق،";
    case "flow_diagram":
      return "بالاستعانة بالمخطط المرفق،";
    default:
      return "بالاستعانة بالشكل المرفق،";
  }
}

function normalizeVisualQuestionReference(
  stimulus: string,
  text: string,
  visualType: string,
): VisualReferenceNormalization {
  const normalizedStimulus = stimulus.trim();
  const normalizedText = text.trim();
  const prefix = visualReferencePrefix(visualType);
  const combined = `${normalizedStimulus} ${normalizedText}`.trim();

  if (visualType === "none" || hasExplicitVisualReference(combined)) {
    return {
      stimulus: normalizedStimulus,
      text: normalizedText,
      changed: false,
      hasReference: visualType === "none" || hasExplicitVisualReference(combined),
      prefix,
    };
  }

  const cleanText = normalizedText.replace(/^[\s،,؛;:.!?؟\-–—]+/u, "");
  const hydratedText = `${prefix} ${cleanText}`.trim();

  return {
    stimulus: normalizedStimulus,
    text: hydratedText,
    changed: true,
    hasReference: hasExplicitVisualReference(hydratedText),
    prefix,
  };
}

const INTERNAL_GENERATION_TOKEN_PATTERN = /\(?\b(?:visual-plan|visual_item|blueprint-item|plan-item)[-_]?\d+\b\)?/giu;

function sanitizeGeneratedDisplayText(value: string): string {
  return value
    .replace(INTERNAL_GENERATION_TOKEN_PATTERN, " ")
    .replace(/\(\s*\)/gu, " ")
    .replace(/\s+([،؛:,.!?؟])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function sanitizeModelMarkScheme(value: ModelGeneratedAlternative["markScheme"]): ModelGeneratedAlternative["markScheme"] {
  if (Array.isArray(value)) return value.map((point) => sanitizeGeneratedDisplayText(String(point ?? "")));
  const record = asRecord(value);
  if (!record) return value;
  return {
    point1: sanitizeGeneratedDisplayText(typeof record.point1 === "string" ? record.point1 : ""),
    point2: sanitizeGeneratedDisplayText(typeof record.point2 === "string" ? record.point2 : ""),
    point3: sanitizeGeneratedDisplayText(typeof record.point3 === "string" ? record.point3 : ""),
    point4: sanitizeGeneratedDisplayText(typeof record.point4 === "string" ? record.point4 : ""),
  };
}


interface QuestionVisualPoint {
  x: number;
  y: number;
  label: string;
}

interface QuestionVisualSeries {
  label: string;
  points: QuestionVisualPoint[];
}

interface QuestionVisualVector {
  label: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  magnitude: number;
}

interface QuestionVisualSpec {
  type: QuestionVisualType;
  visualId: string;
  variant: QuestionVisualVariant;
  purpose: string;
  role: QuestionVisualRole;
  title: string;
  altText: string;
  xAxisLabel: string;
  xAxisUnit: string;
  yAxisLabel: string;
  yAxisUnit: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  points: QuestionVisualPoint[];
  series: QuestionVisualSeries[];
  labels: string[];
  values: number[];
  components: CircuitComponent[];
  annotations: string[];
  tableColumns: string[];
  tableRows: string[];
  tableCells: string[][];
  hiddenCells: string[];
  vectors: QuestionVisualVector[];
}

type LessonScopeMode = "page-range" | "page-neighborhood" | "strict-title-fallback" | "legacy-title";

interface GenerationReference {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceKind: string;
  pageFrom: number;
  pageTo: number;
  content: string;
  lessonTopic: string;
  lessonScopeMode: LessonScopeMode;
  lessonPageFrom?: number;
  lessonPageTo?: number;
}

interface RegenerationAnchor {
  stimulus: string;
  text: string;
  answer: string;
  questionForm: QuestionDesignPattern;
}

interface GenerationItem {
  planItemId: string;
  questionType: QuestionType;
  cognitiveLevel: CognitiveLevel;
  difficultyLevel?: ItemDifficulty;
  marks: number;
  sourceReferenceId: string;
  lessonLabel: string;
  outcomeLabel: string;
  styleTarget: QuestionDesignPattern;
  visualTarget: QuestionVisualType;
  scenarioTarget: QuestionScenarioTarget;
  stimulusTarget: QuestionStimulusTarget;
  skillTarget: QuestionSkillTarget;
  diversityKey: string;
  regenerationAnchor?: RegenerationAnchor;
}

interface LessonCardV2 {
  lessonLabel: string;
  learningOutcomes: string[];
  concepts: string[];
  sourceReferenceIds: string[];
  sourceSummary: string;
}

interface AssessmentBlueprintItemV2 {
  order: number;
  planItemId: string;
  lessonLabel: string;
  learningOutcome: string;
  questionType: string;
  cognitiveLevel: string;
  marks: number;
  styleTarget: QuestionDesignPattern;
  visualTarget: QuestionVisualType;
  scenarioTarget: QuestionScenarioTarget;
  stimulusTarget: QuestionStimulusTarget;
  skillTarget: QuestionSkillTarget;
  diversityKey: string;
}

interface AssessmentBlueprintV2 {
  version: "whole-exam-blueprint-v1";
  totalMarks: number;
  itemCount: number;
  lessons: string[];
  items: AssessmentBlueprintItemV2[];
  globalReviewRules: string[];
}

interface GlobalAssessmentReferenceV2 {
  id: string;
  sourceTitle: string;
  sourceKind: string;
  excerpt: string;
}

interface GenerationRequest {
  generationMode: "legacy_items" | "whole_exam_v2";
  generationVersion: string;
  assessmentType: AssessmentType;
  assessmentPolicyId: "oman-science-assessment-2025-2026";
  topic: string;
  lessons: string[];
  grade: number;
  subject: string;
  difficulty: Difficulty;
  trustedEnrichmentEnabled: boolean;
  references: GenerationReference[];
  officialPlanItems: GenerationItem[];
  items: GenerationItem[];
  lessonCards: LessonCardV2[];
  blueprint: AssessmentBlueprintV2 | null;
  globalAssessmentReferences: GlobalAssessmentReferenceV2[];
}

interface VisualIllustrationRequest {
  action: "generate_visual_illustration";
  draftId: string;
  planItemId: string;
  grade: number;
  subject: string;
  lessonLabel: string;
  questionText: string;
  sourceSupport: string;
  previousAssetPath: string;
  visual: QuestionVisualSpec;
}

interface VisualIllustrationAsset {
  url: string;
  assetPath: string;
  mimeType: string;
  model: string;
  generatedAt: string;
  promptVersion: string;
  validated: true;
  assetKind: "scene_2d" | "scene_2d_overlay";
  renderMode: "replace" | "overlay";
}

interface VisualIllustrationResult {
  status: "ready" | "fallback";
  illustration?: VisualIllustrationAsset;
  reason: string;
}

interface ModelGeneratedMarkSchemeSlots {
  point1: string;
  point2: string;
  point3: string;
  point4: string;
}

interface ModelGeneratedScenarioContract {
  target: QuestionScenarioTarget;
  evidencePhrases: string[];
  scientificLink: string;
  contextIsEssential: boolean;
}

interface ModelGeneratedAlternative {
  stimulus: string;
  text: string;
  options: string[];
  answer: string;
  rationale: string;
  markScheme: ModelGeneratedMarkSchemeSlots | string[];
  questionForm: QuestionDesignPattern;
  workingRequired: boolean;
  sourceEvidenceId: string;
  enrichmentEvidenceId: string;
  scenarioContract?: ModelGeneratedScenarioContract;
  needsReview: boolean;
}

interface ModelGeneratedItem {
  planItemId: string;
  alternatives: ModelGeneratedAlternative[];
}

interface ModelGeneratedPayload {
  items: ModelGeneratedItem[];
}

interface MarkSchemeRepairEntry {
  alternativeIndex: number;
  markScheme: string[];
}

interface MarkSchemeRepairPayload {
  schemes: MarkSchemeRepairEntry[];
}

interface GeneratedAlternative {
  stimulus: string;
  text: string;
  options: string[];
  answer: string;
  rationale: string;
  markScheme: string[];
  questionForm: QuestionDesignPattern;
  workingRequired: boolean;
  sourceSupport: string;
  enrichmentSupport: string;
  enrichmentSourceTitle: string;
  enrichmentSourceUrl: string;
  needsReview: boolean;
}

interface GeneratedItem {
  planItemId: string;
  visual: QuestionVisualSpec;
  alternatives: GeneratedAlternative[];
}

interface GeneratedPayload {
  items: GeneratedItem[];
}

interface ItemValidationFailure {
  planItemId: string;
  message: string;
}

interface ItemValidationBatch {
  items: GeneratedItem[];
  failures: ItemValidationFailure[];
}

interface EvidenceFragment {
  id: string;
  referenceId: string;
  text: string;
}

interface EvidenceCatalog {
  fragments: EvidenceFragment[];
  byId: Map<string, EvidenceFragment>;
  byReferenceId: Map<string, EvidenceFragment[]>;
  referenceContentById: Map<string, string>;
  referenceById: Map<string, GenerationReference>;
}

interface TrustedEnrichmentSegment {
  id: string;
  text: string;
  sourceTitle: string;
  sourceUrl: string;
}

interface TrustedEnrichmentContext {
  segments: TrustedEnrichmentSegment[];
  attempted: boolean;
}

interface EnrichmentCacheEntry {
  expiresAt: number;
  context: TrustedEnrichmentContext;
}

const enrichmentCache = new Map<string, EnrichmentCacheEntry>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const requestId = createRequestId();
  if (req.method !== "POST") return json(req, { error: "هذه الخدمة تقبل POST فقط.", requestId }, 405);

  logStage(requestId, "request_received");
  try {
    const userId = await requireUser(req);
    logStage(requestId, "authentication_passed");
    const rawPayload = await req.json();
    if (asRecord(rawPayload)?.action === "generate_visual_illustration") {
      const illustrationRequest = parseVisualIllustrationRequest(rawPayload);
      const result = await generateControlledVisualIllustration(illustrationRequest, userId, requestId);
      logStage(requestId, "visual_illustration_response_sent", {
        status: result.status,
        visualType: illustrationRequest.visual.type,
        visualVariant: illustrationRequest.visual.variant,
      });
      return json(req, { ...result, requestId });
    }
    const request = parseGenerationRequest(rawPayload);
    logStage(requestId, "payload_validated", {
      itemCount: request.items.length,
      referenceCount: request.references.length,
      lessonCount: request.lessons.length,
    });
    const generated = await generateAndValidate(request, requestId);
    logStage(requestId, "response_sent", { itemCount: generated.items.length, visualOwner: "server" });
    return json(req, {
      items: generated.items,
      model: GEMINI_MODEL,
      generatedAt: new Date().toISOString(),
      requestId,
    });
  } catch (error) {
    logStage(requestId, "request_failed", {
      status: errorStatus(error),
      message: errorMessage(error),
    });
    return json(req, {
      error: errorMessage(error),
      requestId,
      ...(isRetryableGenerationError(error) ? { code: "GENERATION_TEMPORARILY_UNAVAILABLE", retryAfterMs: 6_000 } : {}),
    }, errorStatus(error));
  }
});


function visualIllustrationTextArray(value: unknown, maxItems: number, maxLength = 100): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseVisualIllustrationRequest(value: unknown): VisualIllustrationRequest {
  const record = requireRecord(value, "طلب تحسين الرسم غير صالح.");
  const visualRecord = requireRecord(record.visual, "مواصفة الرسم المطلوب تحسينه غير صالحة.");
  const visualType = requireEnum(visualRecord.type, VISUAL_TYPES, "نوع الرسم المطلوب تحسينه غير صالح.");
  const variant = requireText(visualRecord.variant, "نسخة الرسم المطلوب تحسينها غير محددة.", 60) as QuestionVisualVariant;
  const role = requireText(visualRecord.role, "دور الرسم التقويمي غير محدد.", 40) as QuestionVisualRole;
  const visual: QuestionVisualSpec = {
    ...emptyVisualSpec(),
    type: visualType,
    visualId: requireText(visualRecord.visualId, "معرف الرسم غير صالح.", 80),
    variant,
    role,
    purpose: typeof visualRecord.purpose === "string" ? visualRecord.purpose.trim().slice(0, 180) : "",
    title: requireText(visualRecord.title, "عنوان الرسم غير صالح.", 180),
    altText: requireText(visualRecord.altText, "الوصف البديل للرسم غير صالح.", 280),
    labels: visualIllustrationTextArray(visualRecord.labels, 8, 80),
    annotations: visualIllustrationTextArray(visualRecord.annotations, 8, 100),
  };
  if (!isControlledIllustrationEligible(visual)) {
    throw httpError("هذا الرسم يجب أن يبقى حتميًا لحماية الدقة العلمية والتقويمية.", 422);
  }
  return {
    action: "generate_visual_illustration",
    draftId: requireText(record.draftId, "معرف المسودة غير صالح.", 100),
    planItemId: requireText(record.planItemId, "معرف المفردة غير صالح.", 100),
    grade: requireInteger(record.grade, "الصف الدراسي غير صالح.", 1, 12),
    subject: requireText(record.subject, "المادة غير محددة.", 100),
    lessonLabel: requireText(record.lessonLabel, "الدرس غير محدد.", 180),
    questionText: requireText(record.questionText, "نص السؤال غير محدد.", 1_200),
    sourceSupport: requireText(record.sourceSupport, "دليل المصدر المدرسي غير محدد.", 2_400),
    previousAssetPath: typeof record.previousAssetPath === "string" ? record.previousAssetPath.trim().slice(0, 300) : "",
    visual,
  };
}

function isControlledIllustrationEligible(visual: QuestionVisualSpec): boolean {
  if (visual.type === "context_scene") {
    return ["read", "interpret", "compare", "evaluate"].includes(visual.role);
  }
  if (visual.type === "electrostatic_diagram" && ["charge_transfer", "attraction_repulsion"].includes(visual.variant)) {
    return !["calculate", "complete", "draw"].includes(visual.role);
  }
  if (visual.type === "pressure_diagram" && visual.variant === "submerged_object") {
    return ["read", "interpret", "evaluate"].includes(visual.role);
  }
  if (visual.type === "force_diagram" && ["free_body", "balanced_forces"].includes(visual.variant)) {
    return !["draw", "complete"].includes(visual.role);
  }
  return false;
}

function forceSceneKind(visual: QuestionVisualSpec): "shopping_trolley" | "school_bag" | "crate" {
  const material = `${visual.title} ${visual.altText} ${visual.labels.join(" ")}`.toLowerCase();
  if (/(عربه|عربة|تسوق|trolley|cart)/u.test(material)) return "shopping_trolley";
  if (/(حقيبه|حقيبة|مدرسيه|مدرسية|bag)/u.test(material)) return "school_bag";
  return "crate";
}

function controlledIllustrationScene(request: VisualIllustrationRequest): string {
  if (request.visual.type === "force_diagram") {
    const kind = forceSceneKind(request.visual);
    if (kind === "shopping_trolley") {
      return [
        "One clear 2D side-view shopping trolley on a clean white background.",
        "Show exactly one trolley with basket, handle, and two visible wheels, suitable for an Omani school science assessment.",
        "Do not show any person, arrows, labels, equations, or extra store details.",
      ].join(" ");
    }
    if (kind === "school_bag") {
      return [
        "One clear 2D school bag on a clean white background.",
        "Show exactly one school bag with shoulder straps and a front pocket, large and centered.",
        "Do not show a person, arrows, labels, books outside the bag, or extra objects.",
      ].join(" ");
    }
    return [
      "One clear 2D crate or box on a clean white background.",
      "Show exactly one simple object only, centered and large enough for force arrows to be overlaid later.",
      "Do not show people, arrows, labels, numbers, or extra objects.",
    ].join(" ");
  }
  if (request.visual.type === "context_scene") {
    const sceneByVariant: Partial<Record<QuestionVisualVariant, string>> = {
      door_handle: "A school-age student opens a simple classroom door by pushing or pulling at the handle far from the hinges. Show the door, hinges, handle, and the student's hand clearly.",
      playground_seesaw: "Two school-age children sit safely on opposite sides of a playground seesaw with a clear central pivot. Show visibly different distances from the pivot without any labels.",
      wrench_tool: "A school-age learner uses a correctly sized wrench on a large nut in a supervised workshop-style classroom activity. Show the nut, wrench, hand position, and turning action clearly.",
      bicycle_brake: "A bicycle handlebar with a learner's hand operating a brake lever. Show the lever, cable, handlebar, and bicycle context clearly without text.",
      shopping_trolley: "A learner pushes a shopping trolley along a level store floor. Show the handle, trolley, wheels, and direction of motion through posture only, with no arrows.",
      school_bag: "A school bag with two shoulder straps and books inside, shown beside a student preparing to wear it correctly. Make strap width and load placement visually clear.",
      water_tank: "A clean water tank with a visible outlet pipe or tap at a lower level, in a school or home setting. Show the tank, water level, and outlet clearly.",
      solar_panel: "A clean school or home rooftop solar panel receiving sunlight in Oman. Show the panel, sun, roof, and simple electrical connection without labels.",
      laboratory_setup: "A simple supervised school laboratory setup with one measuring instrument, one sample, and clear safe arrangement on a bench. Do not add extra apparatus.",
      road_safety: "A clear road-safety scene involving a vehicle, mirror or reflective surface, and a school-age observer at a safe distance. Keep the scientific relationship visually obvious.",
    };
    return sceneByVariant[request.visual.variant]
      ?? "A simple everyday school science situation with exactly the objects required by the question, shown clearly and safely.";
  }
  if (request.visual.type === "electrostatic_diagram") {
    if (request.visual.variant === "attraction_repulsion") {
      const unlikeCharges = (request.visual.values[0] ?? 0) >= 0.5;
      return [
        "Two identical lightweight spherical objects or balloons are suspended separately by thin insulating strings against a white background.",
        unlikeCharges
          ? "Their positions clearly show mutual attraction: both strings lean gently inward and the objects move closer without touching."
          : "Their positions clearly show mutual repulsion: both strings lean gently outward and the objects move apart symmetrically.",
        "Show exactly two objects and two strings. Keep the composition symmetric, clean, and scientifically plausible.",
        "Do not show charge signs, arrows, field lines, labels, hands, sparks, or extra objects.",
      ].join(" ");
    }
    return [
      "A plastic ruler is being rubbed firmly with a small dry cloth by one school-age learner's hand.",
      "Several tiny lightweight paper pieces lie close to the ruler and are visibly lifting or tilting toward it.",
      "Show exactly one ruler, one cloth, one hand, and a small group of paper pieces only.",
      "Do not show plus or minus charge symbols, arrows, labels, sparks, or extra laboratory apparatus.",
    ].join(" ");
  }
  return [
    "A transparent classroom science vessel contains a clear liquid with a clearly visible horizontal surface.",
    "One simple solid object is fully submerged below the surface at a visually clear depth.",
    "The vessel, liquid surface, and object must be scientifically plausible and easy to distinguish.",
  ].join(" ");
}

function buildControlledIllustrationPrompt(request: VisualIllustrationRequest, correctionNote = ""): string {
  return [
    "Create a precise 2D educational textbook illustration for a school science assessment in Oman.",
    `Grade: ${request.grade}. Subject: ${request.subject}. Lesson: ${request.lessonLabel}.`,
    `Scientific scene: ${controlledIllustrationScene(request)}`,
    `Question-specific context: ${request.questionText}`,
    `Reference-grounded context: ${request.sourceSupport}`,
    "Visual style: premium 2D science textbook illustration, clean flat shapes with subtle depth, crisp outlines, restrained natural colors, white background, landscape 4:3 composition, high visual hierarchy, suitable for sharp A4 printing.",
    "Composition: the required scientific objects must be large, centered, clearly separated, and immediately understandable at a glance; avoid tiny objects and excessive empty space.",
    "Scientific constraints: preserve the exact object count and relationships; do not invent apparatus, forces, particles, labels, measurements, or effects not requested.",
    "Assessment constraints: no words, no letters, no numbers, no units, no arrows, no captions, no watermarks, no decorative border, and no photorealistic rendering.",
    "Make the scientific action unmistakable through the objects and their positions alone.",
    "Do not reuse the ruler-and-paper composition or any other stock composition unless the requested scene explicitly requires it. Match the requested variant and question-specific context.",
    request.visual.type === "force_diagram" ? "For force diagrams, draw only the real 2D base object. The app will add the scientific arrows and labels itself." : "",
    correctionNote ? `Correction required after scientific review: ${correctionNote}` : "",
  ].filter(Boolean).join("\n");
}

function findGeneratedImagePart(payload: unknown): { data: string; mimeType: string } | null {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.candidates)) return null;
  for (const candidateValue of record.candidates) {
    const candidate = asRecord(candidateValue);
    const content = asRecord(candidate?.content);
    if (!Array.isArray(content?.parts)) continue;
    for (const partValue of content.parts) {
      const part = asRecord(partValue);
      const inline = asRecord(part?.inlineData) ?? asRecord(part?.inline_data);
      const data = typeof inline?.data === "string" ? inline.data.trim() : "";
      const mimeType = typeof inline?.mimeType === "string"
        ? inline.mimeType.trim()
        : typeof inline?.mime_type === "string"
          ? inline.mime_type.trim()
          : "";
      if (data && ["image/png", "image/jpeg", "image/webp"].includes(mimeType)) return { data, mimeType };
    }
  }
  return null;
}

async function requestControlledIllustrationImage(
  request: VisualIllustrationRequest,
  requestId: string,
  correctionNote = "",
): Promise<{ data: string; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_GENERATION_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(GEMINI_IMAGE_API_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildControlledIllustrationPrompt(request, correctionNote) }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "4:3", imageSize: "1K" },
        },
      }),
      signal: controller.signal,
    });
    const payload = await response.json() as unknown;
    if (!response.ok) throw new Error(geminiError(payload, `تعذر إنشاء الصورة (${response.status}).`));
    const image = findGeneratedImagePart(payload);
    if (!image || image.data.length < 1_000 || image.data.length > MAX_IMAGE_BASE64_CHARACTERS) {
      throw new Error("لم يُرجع نموذج الصور ملفًا صالحًا بالحجم المتوقع.");
    }
    logStage(requestId, "visual_image_generated", {
      model: GEMINI_IMAGE_MODEL,
      mimeType: image.mimeType,
      base64Characters: image.data.length,
      durationMs: Date.now() - startedAt,
    });
    return image;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("تأخر نموذج الصور أكثر من المدة المسموحة.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const visualValidationSchema = {
  type: "object",
  properties: {
    approved: { type: "boolean" },
    requiredObjectsPresent: { type: "boolean" },
    objectCountCorrect: { type: "boolean" },
    scientificRelationshipCorrect: { type: "boolean" },
    clear2DComposition: { type: "boolean" },
    printReady: { type: "boolean" },
    forbiddenTextDetected: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["approved", "requiredObjectsPresent", "objectCountCorrect", "scientificRelationshipCorrect", "clear2DComposition", "printReady", "forbiddenTextDetected", "reason"],
  additionalProperties: false,
};

async function validateControlledIllustration(
  request: VisualIllustrationRequest,
  image: { data: string; mimeType: string },
  requestId: string,
): Promise<{ approved: boolean; reason: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_VALIDATION_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "أنت مدقق علمي بصري صارم لصور اختبارات العلوم المدرسية. لا تجامل الصورة." }] },
        contents: [{
          role: "user",
          parts: [
            { text: [
              "افحص الصورة وفق المتطلبات الآتية:",
              controlledIllustrationScene(request),
              "يجب أن تكون صورة ثنائية الأبعاد واضحة ومصقولة بصريًا على خلفية بيضاء، وتبقى مفهومة عند الطباعة على ورقة A4.",
              "تحقق من العدد الدقيق للعناصر المطلوبة، ومن عدم اختفاء أي عنصر أو اندماجه بصريًا مع عنصر آخر.",
              "ارفضها إذا ظهر أي نص أو حرف أو رقم أو وحدة أو سهم أو رمز شحنة أو عنصر علمي زائد.",
              "ارفضها إذا كانت العناصر صغيرة جدًا، أو التكوين غامضًا، أو العلاقات العلمية غير واضحة، أو الصورة أقرب إلى أيقونات مبهمة من رسم تعليمي.",
              "وافق فقط إذا ظهرت العناصر المطلوبة والعلاقة العلمية بينها بوضوح ودون تضليل، وكانت الصورة جاهزة للطباعة التعليمية.",
            ].join("\n") },
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        }],
        generationConfig: {
          candidateCount: 1,
          maxOutputTokens: 400,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseJsonSchema: visualValidationSchema,
        },
      }),
      signal: controller.signal,
    });
    const payload = await response.json() as unknown;
    if (!response.ok) throw new Error(geminiError(payload, `تعذر تدقيق الصورة (${response.status}).`));
    const output = findGenerateContentOutputText(payload);
    if (!output.text) throw new Error("لم يُرجع المدقق البصري نتيجة قابلة للقراءة.");
    const parsed = asRecord(parseGeneratedJson(output.text));
    const approved = parsed?.approved === true
      && parsed.requiredObjectsPresent === true
      && parsed.objectCountCorrect === true
      && parsed.scientificRelationshipCorrect === true
      && parsed.clear2DComposition === true
      && parsed.printReady === true
      && parsed.forbiddenTextDetected === false;
    const reason = typeof parsed?.reason === "string" ? parsed.reason.trim().slice(0, 240) : "";
    logStage(requestId, "visual_image_validated", { approved, reason, durationMs: Date.now() - startedAt });
    return { approved, reason };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("تأخر التدقيق العلمي للصورة أكثر من المدة المسموحة.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function decodeBase64Image(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function storageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
}

function extensionForImageMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

async function ensureQuestionVisualBucket(): Promise<void> {
  const { error } = await admin.storage.getBucket(QUESTION_VISUAL_BUCKET);
  if (!error) return;
  const created = await admin.storage.createBucket(QUESTION_VISUAL_BUCKET, {
    public: true,
    fileSizeLimit: 12 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
  if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
    throw new Error(`تعذر تجهيز مخزن الصور: ${created.error.message}`);
  }
}

async function storeControlledIllustration(
  request: VisualIllustrationRequest,
  userId: string,
  image: { data: string; mimeType: string },
): Promise<VisualIllustrationAsset> {
  await ensureQuestionVisualBucket();
  const extension = extensionForImageMime(image.mimeType);
  const assetPath = `${storageSegment(userId)}/${storageSegment(request.draftId)}/${storageSegment(request.planItemId)}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const uploaded = await admin.storage.from(QUESTION_VISUAL_BUCKET).upload(assetPath, decodeBase64Image(image.data), {
    contentType: image.mimeType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploaded.error) throw new Error(`تعذر حفظ الصورة التعليمية: ${uploaded.error.message}`);
  const publicUrl = admin.storage.from(QUESTION_VISUAL_BUCKET).getPublicUrl(assetPath).data.publicUrl;
  if (!publicUrl?.startsWith("https://")) throw new Error("تعذر إنشاء رابط آمن للصورة التعليمية.");

  const previous = request.previousAssetPath;
  if (previous && previous !== assetPath && previous.startsWith(`${storageSegment(userId)}/`)) {
    void admin.storage.from(QUESTION_VISUAL_BUCKET).remove([previous]);
  }
  const renderMode = request.visual.type === "force_diagram" ? "overlay" : "replace";
  const assetKind = renderMode === "overlay" ? "scene_2d_overlay" : "scene_2d";
  return {
    url: publicUrl,
    assetPath,
    mimeType: image.mimeType,
    model: GEMINI_IMAGE_MODEL,
    generatedAt: new Date().toISOString(),
    promptVersion: VISUAL_PROMPT_VERSION,
    validated: true,
    assetKind,
    renderMode,
  };
}

async function generateControlledVisualIllustration(
  request: VisualIllustrationRequest,
  userId: string,
  requestId: string,
): Promise<VisualIllustrationResult> {
  let correctionNote = "";
  let lastReason = "";
  try {
    logStage(requestId, "visual_illustration_started", {
      visualType: request.visual.type,
      visualVariant: request.visual.variant,
      model: GEMINI_IMAGE_MODEL,
      maxAttempts: 2,
    });
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const image = await requestControlledIllustrationImage(request, requestId, correctionNote);
      const validation = await validateControlledIllustration(request, image, requestId);
      if (validation.approved) {
        const illustration = await storeControlledIllustration(request, userId, image);
        return { status: "ready", illustration, reason: `تم إنشاء صورة تعليمية ثنائية الأبعاد واعتمادها علميًا بعد ${attempt} محاولة.` };
      }
      lastReason = validation.reason || "لم تتحقق جودة الرسم أو دقته العلمية.";
      correctionNote = lastReason;
      logStage(requestId, "visual_illustration_retry", { attempt, reason: lastReason });
    }
    return {
      status: "fallback",
      reason: `${lastReason || "لم تجتز الصورة فحص الدقة العلمية."} استخدم واثق الرسم الثنائي الأبعاد المصقول الآمن.`,
    };
  } catch (error) {
    logStage(requestId, "visual_illustration_fallback", { message: errorMessage(error) });
    return {
      status: "fallback",
      reason: `تعذر اعتماد الصورة المحسنة؛ استخدم واثق الرسم الثنائي الأبعاد المصقول دون تعطيل الاختبار. ${errorMessage(error)}`.slice(0, 360),
    };
  }
}

function trustedEnrichmentCacheKey(request: GenerationRequest): string {
  return JSON.stringify({
    grade: request.grade,
    subject: normalizeForEvidence(request.subject),
    lessons: request.lessons.map(normalizeForEvidence).sort(),
    references: request.references.map((reference) => `${reference.sourceId}:${reference.pageFrom}-${reference.pageTo}`).sort(),
  });
}

function candidateTrustedHost(value: string): string {
  const compact = value.trim().toLowerCase().replace(/^www\./, "");
  if (!compact) return "";
  try {
    return new URL(compact.includes("://") ? compact : `https://${compact}`).hostname.replace(/^www\./, "");
  } catch {
    const match = compact.match(/(?:^|\s|\/)([a-z0-9.-]+\.(?:gov(?:\.[a-z]{2})?|edu(?:\.[a-z]{2})?|ac\.[a-z]{2}|org|int|ch))(?:\s|\/|$)/i);
    return match?.[1]?.replace(/^www\./, "") ?? "";
  }
}

function isTrustedScientificHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^www\./, "");
  if (!normalized) return false;
  const exact = new Set([
    "cambridgeinternational.org", "who.int", "iaea.org", "unesco.org", "un.org", "oecd.org",
    "cern.ch", "royalsociety.org", "physics.org", "rsc.org", "acs.org",
  ]);
  if (exact.has(normalized)) return true;
  const officialSuffix = /(?:^|\.)(?:gov|edu|ac)\.[a-z]{2,3}$/u.test(normalized);
  return normalized.endsWith(".gov")
    || normalized.endsWith(".edu")
    || officialSuffix
    || normalized === "moe.gov.om"
    || [...exact].some((domain) => normalized.endsWith(`.${domain}`));
}

function trustedGroundingChunk(value: unknown): { sourceTitle: string; sourceUrl: string } | null {
  const chunk = asRecord(value);
  const web = asRecord(chunk?.web);
  const sourceUrl = typeof web?.uri === "string" ? web.uri.trim() : "";
  const sourceTitle = typeof web?.title === "string" ? web.title.trim() : "";
  const uriHost = sourceUrl ? candidateTrustedHost(sourceUrl) : "";
  const titleHost = sourceTitle ? candidateTrustedHost(sourceTitle) : "";
  if (!sourceUrl || (!isTrustedScientificHost(uriHost) && !isTrustedScientificHost(titleHost))) return null;
  return { sourceTitle: sourceTitle || titleHost || uriHost, sourceUrl };
}

function extractTrustedEnrichmentContext(payload: unknown): TrustedEnrichmentContext {
  const record = asRecord(payload);
  const candidate = Array.isArray(record?.candidates) ? asRecord(record.candidates[0]) : null;
  const content = asRecord(candidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const responseText = parts.map((part) => {
    const item = asRecord(part);
    return typeof item?.text === "string" ? item.text : "";
  }).join("");
  const grounding = asRecord(candidate?.groundingMetadata);
  const rawChunks = Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [];
  const trustedChunks = rawChunks.map(trustedGroundingChunk);
  const supports = Array.isArray(grounding?.groundingSupports) ? grounding.groundingSupports : [];
  const segments: TrustedEnrichmentSegment[] = [];
  const seen = new Set<string>();

  for (const supportValue of supports) {
    const support = asRecord(supportValue);
    const segment = asRecord(support?.segment);
    let text = typeof segment?.text === "string" ? segment.text.trim() : "";
    if (!text && typeof segment?.startIndex === "number" && typeof segment?.endIndex === "number") {
      text = responseText.slice(segment.startIndex, segment.endIndex).trim();
    }
    const indices = Array.isArray(support?.groundingChunkIndices)
      ? support.groundingChunkIndices.filter((index): index is number => Number.isSafeInteger(index))
      : [];
    const source = indices.map((index) => trustedChunks[index]).find((item) => item !== null) ?? null;
    const normalizedText = normalizeForEvidence(text);
    if (!source || normalizedText.length < 24 || seen.has(normalizedText)) continue;
    seen.add(normalizedText);
    segments.push({
      id: `WEB-${segments.length + 1}`,
      text: text.slice(0, 520),
      sourceTitle: source.sourceTitle.slice(0, 180),
      sourceUrl: source.sourceUrl.slice(0, 1_200),
    });
    if (segments.length >= ENRICHMENT_MAX_SEGMENTS) break;
  }
  return { segments, attempted: true };
}

function enrichmentSearchPrompt(request: GenerationRequest): string {
  const sourceBriefs = request.references.map((reference) => ({
    lesson: reference.lessonTopic,
    source: reference.sourceTitle,
    pages: reference.pageFrom === reference.pageTo ? `${reference.pageFrom}` : `${reference.pageFrom}-${reference.pageTo}`,
    curriculumExcerpt: reference.content.slice(0, 900),
  }));
  return [
    "ابحث عن إثراء علمي قصير يخدم بناء أسئلة مدرسية متوافقة مع المنهج العُماني.",
    "استخدم فقط مصادر حكومية أو جامعية أو منظمات علمية رسمية وموثوقة، ولا تستخدم ويكيبيديا أو المدونات أو مواقع الأسئلة العامة.",
    "قدّم من أربع إلى ست جمل مستقلة فقط، وكل جملة تصلح كسياق واقعي أو بيانات أو تجربة أو تطبيق للدرس.",
    "لا تضف حقيقة يجب على الطالب معرفتها إذا لم تكن مثبتة في مقتطف المنهج. المرجع المدرسي أدناه هو الحاكم للمفهوم والإجابة.",
    "لا تنسخ سؤال اختبار منشورًا، ولا تذكر أرقام صفحات أو أسماء وحدات في الجمل.",
    JSON.stringify({ grade: request.grade, subject: request.subject, lessons: request.lessons, sourceBriefs }),
  ].join("\n");
}

async function prepareTrustedEnrichment(request: GenerationRequest, requestId: string): Promise<TrustedEnrichmentContext> {
  if (!request.trustedEnrichmentEnabled) return { segments: [], attempted: false };
  const key = trustedEnrichmentCacheKey(request);
  const cached = enrichmentCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.context;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENRICHMENT_TIMEOUT_MS);
  try {
    logStage(requestId, "trusted_enrichment_search_started", { lessonCount: request.lessons.length });
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: enrichmentSearchPrompt(request) }] }],
        tools: [{ google_search: {} }],
        store: false,
        generationConfig: { candidateCount: 1, maxOutputTokens: 1_200, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: controller.signal,
    });
    const payload = await response.json() as unknown;
    if (!response.ok) {
      logStage(requestId, "trusted_enrichment_search_skipped", { status: response.status, reason: "provider_error" });
      return { segments: [], attempted: true };
    }
    const context = extractTrustedEnrichmentContext(payload);
    enrichmentCache.set(key, { expiresAt: Date.now() + ENRICHMENT_CACHE_TTL_MS, context });
    return context;
  } catch (error) {
    logStage(requestId, "trusted_enrichment_search_skipped", { reason: errorMessage(error) });
    return { segments: [], attempted: true };
  } finally {
    clearTimeout(timeout);
  }
}

function scopedGenerationRequest(request: GenerationRequest, planItemIds: Set<string>): GenerationRequest {
  const items = request.items.filter((item) => planItemIds.has(item.planItemId));
  const officialPlanItems = (request.officialPlanItems ?? request.items).filter((item) => planItemIds.has(item.planItemId));
  const lessons = [...new Set(items.map((item) => item.lessonLabel))];
  const lessonCards = (request.lessonCards ?? []).filter((card) => lessons.includes(card.lessonLabel));
  const blueprintItems = request.blueprint?.items.filter((item) => planItemIds.has(item.planItemId)) ?? [];
  const blueprint = request.blueprint
    ? {
        ...request.blueprint,
        totalMarks: blueprintItems.reduce((sum, item) => sum + item.marks, 0),
        itemCount: blueprintItems.length,
        lessons,
        items: blueprintItems,
      }
    : null;
  return { ...request, items, officialPlanItems, lessons, lessonCards, blueprint };
}

function itemRepairFeedback(failures: ItemValidationFailure[]): string {
  return failures
    .map((failure) => `${failure.planItemId}: ${failure.message}`)
    .join("\n");
}

function orderedGeneratedPayload(request: GenerationRequest, accepted: Map<string, GeneratedItem>): GeneratedPayload {
  const items = request.items.map((item) => accepted.get(item.planItemId)).filter((item): item is GeneratedItem => Boolean(item));
  if (items.length !== request.items.length) throw retryableError("لم تكتمل جميع مفردات الاختبار بعد الإصلاح الانتقائي.");
  return { items };
}

async function generateAndValidate(request: GenerationRequest, requestId: string): Promise<GeneratedPayload> {
  const evidenceCatalog = buildEvidenceCatalog(request.references);
  logStage(requestId, "evidence_catalog_ready", {
    fragmentCount: evidenceCatalog.fragments.length,
    referenceCount: evidenceCatalog.byReferenceId.size,
  });
  const enrichment = await prepareTrustedEnrichment(request, requestId);
  logStage(requestId, "trusted_enrichment_ready", {
    enabled: request.trustedEnrichmentEnabled,
    attempted: enrichment.attempted,
    segmentCount: enrichment.segments.length,
  });
  const accepted = new Map<string, GeneratedItem>();
  let pendingIds = new Set(request.items.map((item) => item.planItemId));
  let repairFeedback = "";
  let lastError: unknown = null;
  const maxRounds = request.generationMode === "whole_exam_v2" ? 4 : 2;

  for (let round = 1; round <= maxRounds; round += 1) {
    const scopedRequest = scopedGenerationRequest(request, pendingIds);
    try {
      const payload = await callGemini(scopedRequest, evidenceCatalog, enrichment, round > 1, requestId, round, repairFeedback);
      const markSchemeSafePayload = await repairGeneratedPayloadMarkSchemes(payload, scopedRequest, requestId);
      const batch = validateGeneratedItemsIndividually(markSchemeSafePayload, scopedRequest, evidenceCatalog, enrichment);
      for (const item of batch.items) accepted.set(item.planItemId, item);

      if (batch.failures.length) {
        pendingIds = new Set(batch.failures.map((failure) => failure.planItemId));
        repairFeedback = itemRepairFeedback(batch.failures);
        logStage(requestId, "per_item_validation_failed", {
          round,
          acceptedCount: accepted.size,
          failedItemIds: [...pendingIds],
          failures: batch.failures,
        });
        if (round === maxRounds) {
          throw retryableError(`تعذر إصلاح المفردات التالية دون المساس ببقية الاختبار:
${repairFeedback}`);
        }
        await delay(500);
        continue;
      }

      pendingIds = new Set(request.items.filter((item) => !accepted.has(item.planItemId)).map((item) => item.planItemId));
      if (pendingIds.size) {
        repairFeedback = [...pendingIds].map((id) => `${id}: لم تصل نتيجة صالحة بعد.`).join("\n");
        continue;
      }

      const complete = orderedGeneratedPayload(request, accepted);
      try {
        if (request.generationMode === "whole_exam_v2") validateWholeExamGeneratedDiversity(complete.items);
        logStage(requestId, "questions_validated", {
          round,
          itemCount: complete.items.length,
          repairedIndividually: round > 1,
        });
        return complete;
      } catch (globalError) {
        lastError = globalError;
        if (round === maxRounds) throw globalError;
        accepted.clear();
        pendingIds = new Set(request.items.map((item) => item.planItemId));
        repairFeedback = `مراجعة الاختبار الكامل: ${errorMessage(globalError)}`;
        logStage(requestId, "whole_exam_global_review_failed", { round, message: repairFeedback });
        await delay(500);
      }
    } catch (error) {
      lastError = error;
      if (round === maxRounds || !isRetryableGenerationError(error) || isTransportRetryExhausted(error)) break;
      if (!repairFeedback) repairFeedback = errorMessage(error);
      await delay(700);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("تعذر إنشاء أسئلة صالحة من المصدر.");
}

function exponentialBackoffWithJitter(attempt: number): number {
  const base = Math.min(4_000, 800 * (2 ** Math.max(0, attempt - 1)));
  return base + Math.floor(Math.random() * 350);
}

function normalizeTransientGeminiMessage(message: string, status: number): string {
  const normalized = message.toLowerCase();
  if (status === 429 || status === 503 || /high demand|overload|resource exhausted|try again later|temporarily unavailable/u.test(normalized)) {
    return "النموذج مشغول مؤقتًا بسبب ارتفاع الطلب. أعاد واثق المحاولة تلقائيًا؛ احتُفظ بالمفردات المكتملة ويمكن الضغط على التالي لاحقًا لإكمال الباقي فقط.";
  }
  if (status === 408 || /timeout|timed out/u.test(normalized)) {
    return "تأخر رد النموذج مؤقتًا. احتُفظ بالمفردات المكتملة ويمكن متابعة الباقي دون إعادة ما اكتمل.";
  }
  return message;
}

async function callGemini(
  request: GenerationRequest,
  evidenceCatalog: EvidenceCatalog,
  enrichment: TrustedEnrichmentContext,
  repairAttempt: boolean,
  requestId: string,
  attempt: number,
  repairFeedback = "",
): Promise<ModelGeneratedPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.generationMode === "whole_exam_v2" ? Math.max(GEMINI_TIMEOUT_MS, 60_000) : GEMINI_TIMEOUT_MS);
  const startedAt = Date.now();
  const legacyThinkingConfig = {
    thinkingBudget: generationThinkingBudget(request.items),
  };
  const requestBody = JSON.stringify({
    systemInstruction: {
      parts: [{ text: buildSystemInstructions(request) }],
    },
    contents: [{
      role: "user",
      parts: [{ text: buildUserPrompt(request, evidenceCatalog, enrichment, repairAttempt, repairFeedback) }],
    }],
    store: false,
    generationConfig: {
      candidateCount: 1,
      maxOutputTokens: generationOutputTokenLimit(request.items, request.generationMode === "whole_exam_v2"),
      thinkingConfig: request.generationMode === "whole_exam_v2"
        ? { thinkingBudget: 1_024 }
        : legacyThinkingConfig,
      responseMimeType: "application/json",
      responseJsonSchema: generationSchema(
        request.items,
        evidenceCatalog,
        enrichment.segments.map((segment) => segment.id),
        request.generationMode === "whole_exam_v2" ? 1 : 3,
      ),
    },
  });
  logStage(requestId, "gemini_request_started", {
    attempt,
    repairAttempt,
    itemCount: request.items.length,
    referenceCount: request.references.length,
    enrichmentCount: enrichment.segments.length,
    api: "generateContent",
  });
  try {
    let payload: unknown = null;
    for (let transportAttempt = 1; transportAttempt <= 3; transportAttempt += 1) {
      const response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: {
          "x-goog-api-key": GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: controller.signal,
      });
      payload = await response.json() as unknown;
      if (response.ok) break;

      const providerMessage = geminiError(payload, `تعذر الاتصال بمولد الأسئلة (${response.status}).`);
      const message = normalizeTransientGeminiMessage(providerMessage, response.status);
      const transient = response.status >= 500 || response.status === 408 || response.status === 429;
      logStage(requestId, "gemini_http_failed", {
        attempt,
        transportAttempt,
        status: response.status,
        transient,
        durationMs: Date.now() - startedAt,
      });
      if (transient && transportAttempt < 3) {
        await delay(exponentialBackoffWithJitter(transportAttempt));
        continue;
      }
      if (transient) throw transportRetryableError(message);
      throw httpError(message, 400);
    }

    const completion = inspectGenerateContentCompletion(payload);
    const output = findGenerateContentOutputText(payload);
    logStage(requestId, "gemini_response_received", {
      attempt,
      finishReason: completion.finishReason,
      textPartCount: output.partCount,
      outputCharacters: output.text.length,
      promptTokens: completion.promptTokens,
      outputTokens: completion.outputTokens,
      totalTokens: completion.totalTokens,
      thoughtsTokens: completion.thoughtsTokens,
      cachedTokens: completion.cachedTokens,
      thinkingBudget: request.generationMode === "whole_exam_v2" ? 1_024 : generationThinkingBudget(request.items),
      visualOwner: "server",
      durationMs: Date.now() - startedAt,
    });
    if (!output.text) {
      throw retryableError(completion.finishMessage || "لم يُرجع مولد الأسئلة بيانات قابلة للقراءة.");
    }
    return parseGeneratedJson(output.text);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw transportRetryableError("تأخر مولد الأسئلة أكثر من المدة المسموحة. احتفظ واثق بالمفردات المكتملة ويمكن متابعة الباقي لاحقًا.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


async function repairGeneratedPayloadMarkSchemes(
  payload: ModelGeneratedPayload,
  request: GenerationRequest,
  requestId: string,
): Promise<ModelGeneratedPayload> {
  if (!payload || !Array.isArray(payload.items)) return payload;
  const requestedById = new Map(request.items.map((item) => [item.planItemId, item]));

  for (const generatedItem of payload.items) {
    if (!generatedItem || typeof generatedItem !== "object" || !Array.isArray(generatedItem.alternatives)) continue;
    const requestedItem = requestedById.get(generatedItem.planItemId);
    if (!requestedItem) continue;
    const invalidIndexes = generatedItem.alternatives
      .map((alternative, index) => hasExactMarkScheme(alternative?.markScheme, requestedItem.marks) ? -1 : index)
      .filter((index) => index >= 0);
    if (!invalidIndexes.length) continue;

    logStage(requestId, "mark_scheme_repair_started", {
      planItemId: requestedItem.planItemId,
      marks: requestedItem.marks,
      alternativeIndexes: invalidIndexes,
    });
    try {
      const repaired = await callGeminiMarkSchemeRepair(
        requestedItem,
        generatedItem.alternatives,
        invalidIndexes,
        requestId,
      );
      for (const [alternativeIndex, markScheme] of repaired) {
        generatedItem.alternatives[alternativeIndex].markScheme = markScheme;
      }
      logStage(requestId, "mark_scheme_repair_completed", {
        planItemId: requestedItem.planItemId,
        repairedCount: repaired.size,
      });
    } catch (error) {
      for (const alternativeIndex of invalidIndexes) {
        const alternative = generatedItem.alternatives[alternativeIndex];
        alternative.markScheme = buildFallbackMarkScheme(alternative, requestedItem.marks);
        alternative.needsReview = true;
      }
      logStage(requestId, "mark_scheme_repair_fallback_used", {
        planItemId: requestedItem.planItemId,
        repairedCount: invalidIndexes.length,
        message: errorMessage(error),
      });
    }
  }
  return payload;
}

async function callGeminiMarkSchemeRepair(
  item: GenerationItem,
  alternatives: ModelGeneratedAlternative[],
  alternativeIndexes: number[],
  requestId: string,
): Promise<Map<number, string[]>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MARK_SCHEME_REPAIR_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const repairAlternatives = alternativeIndexes.map((alternativeIndex) => {
      const alternative = alternatives[alternativeIndex];
      return {
        alternativeIndex,
        marks: item.marks,
        questionType: item.questionType,
        questionForm: alternative?.questionForm ?? item.styleTarget,
        stimulus: typeof alternative?.stimulus === "string" ? alternative.stimulus : "",
        text: typeof alternative?.text === "string" ? alternative.text : "",
        answer: typeof alternative?.answer === "string" ? alternative.answer : "",
        rationale: typeof alternative?.rationale === "string" ? alternative.rationale : "",
        currentMarkScheme: markSchemePoints(alternative?.markScheme),
      };
    });
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "أنت مصحح اختبارات علوم مدرسية.",
              "مهمتك إصلاح نقاط التصحيح فقط دون تغيير السؤال أو الإجابة أو الدرجة.",
              "أعد لكل بديل markScheme بعدد يساوي marks تمامًا.",
              "كل نقطة مستقلة ومحددة وتستحق درجة واحدة، ولا تستخدم نقطة فارغة أو نصف درجة.",
              "لا تضف شرحًا خارج JSON.",
            ].join("\n"),
          }],
        },
        contents: [{
          role: "user",
          parts: [{ text: JSON.stringify({ task: "repair_mark_scheme_only", alternatives: repairAlternatives }) }],
        }],
        store: false,
        generationConfig: {
          candidateCount: 1,
          maxOutputTokens: MARK_SCHEME_REPAIR_MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseJsonSchema: markSchemeRepairSchema(item.marks, alternativeIndexes),
        },
      }),
      signal: controller.signal,
    });
    const payload = await response.json() as unknown;
    if (!response.ok) {
      throw new Error(geminiError(payload, `تعذر إصلاح نموذج التصحيح (${response.status}).`));
    }
    const completion = inspectGenerateContentCompletion(payload);
    const output = findGenerateContentOutputText(payload);
    logStage(requestId, "mark_scheme_repair_response_received", {
      planItemId: item.planItemId,
      finishReason: completion.finishReason,
      promptTokens: completion.promptTokens,
      outputTokens: completion.outputTokens,
      totalTokens: completion.totalTokens,
      thoughtsTokens: completion.thoughtsTokens,
      durationMs: Date.now() - startedAt,
    });
    if (!output.text) throw new Error("لم يُرجع مولد التصحيح نقاطًا قابلة للقراءة.");
    const parsed = parseGeneratedJson(output.text) as unknown as MarkSchemeRepairPayload;
    if (!parsed || !Array.isArray(parsed.schemes) || parsed.schemes.length !== alternativeIndexes.length) {
      throw new Error("استجابة إصلاح نموذج التصحيح غير مكتملة.");
    }
    const repaired = new Map<number, string[]>();
    for (const entry of parsed.schemes) {
      if (!entry || !alternativeIndexes.includes(entry.alternativeIndex) || repaired.has(entry.alternativeIndex)) {
        throw new Error("استجابة إصلاح نموذج التصحيح تحتوي فهرسًا غير صالح.");
      }
      repaired.set(entry.alternativeIndex, normalizeModelMarkScheme(entry.markScheme, item.marks));
    }
    if (repaired.size !== alternativeIndexes.length) {
      throw new Error("استجابة إصلاح نموذج التصحيح لم تشمل جميع البدائل المطلوبة.");
    }
    return repaired;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("تأخر إصلاح نموذج التصحيح أكثر من المدة المسموحة.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function markSchemeRepairSchema(marks: number, alternativeIndexes: number[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      schemes: {
        type: "array",
        minItems: alternativeIndexes.length,
        maxItems: alternativeIndexes.length,
        prefixItems: alternativeIndexes.map((alternativeIndex) => ({
          type: "object",
          properties: {
            alternativeIndex: { type: "integer", enum: [alternativeIndex] },
            markScheme: {
              type: "array",
              minItems: marks,
              maxItems: marks,
              items: {
                type: "string",
                description: "معيار تصحيح مستقل ومحدد وغير فارغ لدرجة واحدة.",
              },
            },
          },
          required: ["alternativeIndex", "markScheme"],
          additionalProperties: false,
        })),
      },
    },
    required: ["schemes"],
    additionalProperties: false,
  };
}

function markSchemePoints(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((point) => typeof point === "string" ? point.trim() : "");
  }
  const record = asRecord(value);
  if (!record) return [];
  return ["point1", "point2", "point3", "point4"].map((key) =>
    typeof record[key] === "string" ? record[key].trim() : ""
  );
}

function hasExactMarkScheme(value: unknown, marks: number): boolean {
  const points = markSchemePoints(value);
  if (Array.isArray(value)) return points.length === marks && points.every(Boolean);
  return points.slice(0, marks).length === marks && points.slice(0, marks).every(Boolean);
}

function buildFallbackMarkScheme(alternative: ModelGeneratedAlternative, marks: number): string[] {
  const existing = markSchemePoints(alternative?.markScheme).filter(Boolean);
  const clauses = [alternative?.answer, alternative?.rationale]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .flatMap((value) => value.split(/[.؛\n]+|،\s*/u))
    .map((value) => value.trim())
    .filter((value) => value.length >= 4);
  const templates = fallbackMarkSchemeTemplates(alternative?.questionForm);
  const candidates = [...existing, ...clauses, ...templates];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.replace(/\s+/g, " ").trim();
    const key = normalizeForEvidence(normalized);
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized.endsWith(".") ? normalized : `${normalized}.`);
    if (unique.length === marks) break;
  }
  while (unique.length < marks) {
    unique.push(`إظهار خطوة علمية صحيحة مستقلة رقم ${unique.length + 1} تؤدي إلى الإجابة النموذجية.`);
  }
  return unique.slice(0, marks);
}

function fallbackMarkSchemeTemplates(questionForm: QuestionDesignPattern | undefined): string[] {
  if (questionForm === "حسابي") {
    return [
      "اختيار العلاقة أو القانون العلمي المناسب",
      "التعويض الصحيح بالقيم والوحدات المعطاة",
      "تنفيذ الحساب بصورة صحيحة",
      "كتابة النتيجة النهائية بالوحدة الصحيحة",
    ];
  }
  if (questionForm === "استقصائي") {
    return [
      "تحديد الفكرة أو المتغير العلمي المطلوب بصورة صحيحة",
      "ربط الإجابة بالملاحظة أو الدليل التجريبي المعطى",
      "تفسير النتيجة تفسيرًا علميًا صحيحًا",
      "صياغة استنتاج أو تحسين مناسب مدعوم بالمعطيات",
    ];
  }
  if (questionForm === "مقارنة") {
    return [
      "ذكر وجه المقارنة الأول بصورة صحيحة",
      "ذكر وجه المقارنة الثاني بصورة صحيحة",
      "ربط المقارنة بالمفهوم العلمي المطلوب",
      "صياغة خلاصة صحيحة من المقارنة",
    ];
  }
  return [
    "ذكر الفكرة العلمية الأساسية المطلوبة",
    "توضيح العلاقة العلمية المرتبطة بالسؤال",
    "تفسير الإجابة بالاستناد إلى المعطيات المقدمة",
    "صياغة استنتاج علمي صحيح ومتكامل",
  ];
}

function parseGeneratedJson(outputText: string): ModelGeneratedPayload {
  const original = outputText.replace(/^\uFEFF/, "").trim();
  const candidates = [original, stripMarkdownFence(original)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as ModelGeneratedPayload;
    } catch {
      // ننتقل إلى استخراج أول كائن JSON متوازن بدل قص النص عند آخر قوس عشوائي.
    }
  }

  const extracted = extractFirstJsonObject(stripMarkdownFence(original));
  if (!extracted) {
    if (original.includes("{")) throw retryableError("أعاد مولد الأسئلة JSON غير مكتمل.");
    throw retryableError("أعاد مولد الأسئلة JSON غير صالح أو مبتور.");
  }
  try {
    return JSON.parse(extracted) as ModelGeneratedPayload;
  } catch {
    throw retryableError("أعاد مولد الأسئلة JSON غير صالح أو مبتور.");
  }
}

function stripMarkdownFence(value: string): string {
  const text = value.trim();
  if (!text.startsWith("```")) return text;
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
      if (depth < 0) return null;
    }
  }
  return null;
}

const SCENARIO_GUIDANCE: Record<QuestionScenarioTarget, string> = {
  scientific_abstract: "موقف علمي مباشر بلا قصة حياتية مصطنعة",
  door_handle: "فتح باب أو بوابة من المقبض ومقارنة أثر موضع القوة",
  playground_seesaw: "أرجوحة توازن في حديقة أو ساحة مدرسة مع نقطة ارتكاز واضحة",
  wrench_tool: "استخدام مفتاح ربط أو أداة يدوية لإدارة صامولة بأمان",
  bicycle_brake: "دراجة أو ذراع مكبح وموقف حركة أو أمان مناسب للطالب",
  shopping_trolley: "دفع عربة تسوق أو نقل أغراض في متجر مع قوة واتجاه واضحين",
  school_bag: "حقيبة مدرسية أو حمالاتها أو توزيع الكتب والضغط على الكتف",
  water_tank: "خزان ماء أو أنبوب أو صنبور في منزل أو مدرسة أو بيئة عُمانية",
  solar_panel: "لوح شمسي أو استخدام الطاقة الشمسية في المدرسة أو المنزل",
  laboratory_setup: "تجربة مدرسية قصيرة بأداة قياس ومتغيرات واضحة",
  road_safety: "موقف طريق أو مركبة أو مرآة أو إضاءة مرتبط بالسلامة اليومية",
};

const STIMULUS_GUIDANCE: Record<QuestionStimulusTarget, string> = {
  concise_text: "نص علمي موجز بلا حشو، لا يقتصر على تعريف محفوظ إلا عند الحاجة",
  real_life_scene: "موقف من حياة الطالب يكون جزءًا من التفكير المطلوب لا زينة لغوية",
  scientific_diagram: "مخطط علمي حتمي لا يمكن حل السؤال دون قراءته",
  data_table: "جدول بيانات بوحدات واضحة يتطلب قراءة أو حسابًا أو استنتاجًا",
  graph: "رسم بياني يتطلب تفسير اتجاه أو مقارنة أو استنتاجًا",
  instrument: "تدريج جهاز قياس مع وحدة وأصغر تدريج واضحين",
  experiment: "إجراء أو تجربة قصيرة تتضمن متغيرًا أو قياسًا أو تحسينًا للطريقة",
  decision_case: "موقف يتطلب اختيارًا أو حكمًا أو مقارنة مع تعليل علمي",
};

const SKILL_GUIDANCE: Record<QuestionSkillTarget, string> = {
  recognize: "تعرّف مفهوم أساسي أو معنى أو وحدة دون نسخ عبارة الكتاب",
  apply: "تطبيق المفهوم في موقف جديد قريب من حياة الطالب",
  calculate: "حساب من معطيات مكتملة مع إظهار الطريقة والوحدة",
  interpret: "تفسير بيانات أو نمط أو ظاهرة اعتمادًا على دليل معطى",
  compare: "مقارنة محددة بمعايير واضحة ونقاط تصحيح مستقلة",
  evaluate: "إصدار حكم أو اقتراح تحسين مع تبرير علمي",
  investigate: "تحديد متغير أو طريقة قياس أو ضبط أو موثوقية تجربة",
};


function assessmentDiversityBlueprint(request: GenerationRequest): Array<Record<string, string | number>> {
  return request.officialPlanItems.map((item, index) => ({
    order: index + 1,
    planItemId: item.planItemId,
    lesson: item.lessonLabel,
    learningOutcome: item.outcomeLabel,
    style: item.styleTarget,
    visual: item.visualTarget,
    scenario: SCENARIO_GUIDANCE[item.scenarioTarget],
    stimulus: STIMULUS_GUIDANCE[item.stimulusTarget],
    skill: SKILL_GUIDANCE[item.skillTarget],
    diversityKey: item.diversityKey,
  }));
}

function buildSystemInstructions(request: GenerationRequest): string {
  const wholeExam = request.generationMode === "whole_exam_v2";
  return [
    "أنت محرر اختبارات علوم مدرسية باللغة العربية لسلطنة عُمان.",
    "التزم أولًا بوثيقة تقويم تعلم الطلبة في مواد العلوم للصفوف 5-10، إصدار 2025/2026؛ فهي المرجع الحاكم للدرجات والأنواع والأهداف والصعوبة.",
    "استلهم جودة بناء مفردات Cambridge Science دون نسخ أسئلة محفوظة: سياق علمي موجز، تدرج من المعرفة إلى التطبيق والاستدلال، بيانات أو تمثيلات عند الحاجة، وأفعال أمر دقيقة مرتبطة بالدرجة.",
    "الكتاب المدرسي والمقاطع المرجعية المرفقة هي المصدر الحاكم للمفهوم والإجابة ونطاق المعرفة المطلوبة من الطالب.",
    "قد يرفق الخادم trustedEnrichment من بحث موثق في مصادر علمية رسمية. استخدمه فقط لإثراء السياق أو البيانات أو المثال أو التجربة، ولا تجعله يضيف معرفة مطلوبة خارج ما يثبته المرجع المدرسي.",
    "إذا استخدمت trustedEnrichment في بديل، أعد enrichmentEvidenceId المطابق. إذا لم تستخدمه فأعد سلسلة فارغة. لا تعتبر ذاكرة النموذج مصدرًا ولا تخترع روابط أو حقائق.",
    wholeExam
      ? "صمم الاختبار كاملًا في ذهنك أولًا، ثم أعد سؤالًا نهائيًا واحدًا عالي الجودة لكل مفردة. راجع الأسئلة معًا قبل الإخراج بوصفها اختبارًا واحدًا لا قطعًا منفصلة."
      : "أنشئ ثلاثة بدائل مختلفة لكل مفردة مرسلة في هذه الدفعة فقط، مع الحفاظ حرفيًا على الدرس ونوع السؤال وهدف التقويم ومستوى الصعوبة والدرجة ونمط styleTarget.",
    "تتضمن كل مفردة learningOutcome وscenarioTarget وstimulusTarget وskillTarget وdiversityKey. اجعل المطلوب والإجابة يقيسان learningOutcome فعليًا؛ فهذه خطة جودة وتنوع للاختبار كله وليست اقتراحات شكلية.",
    "لا تكرر الأسرة السياقية نفسها بين مفردات الاختبار ما دام لكل مفردة diversityKey مختلف. إذا كانت المفردة عن العزم مثلًا، نوّع بين الباب والأرجوحة ومفتاح الربط والدراجة وعربة التسوق بدل إعادة عارضة مجردة.",
    wholeExam
      ? "اجعل كل سؤال في الاختبار مختلفًا فعليًا عن بقية الأسئلة في الفكرة والمثير والسياق وبنية البيانات، ولا تعيد مجموعة الأرقام نفسها أو القالب نفسه تحت قصة جديدة."
      : "اجعل البدائل الثلاثة للمفردة الواحدة مختلفة في تفاصيل الموقف والقيم وطريقة التفكير، لا مجرد تبديل كلمات في السؤال نفسه.",
    "في الاختبار القصير لا تجعل أكثر من مفردة واحدة تعريفًا أو سؤال وحدة مباشرًا، واجعل بقية المفردات تطبيقًا أو تفسيرًا أو بيانات أو قرارًا أو استقصاءً وفق الخطة.",
    "السياق الحياتي يجب أن يكون ضروريًا للإجابة، قصيرًا، واقعيًا، مناسبًا لعمر الطالب، ومتصلًا مباشرة بالمفهوم العلمي؛ لا تضع قصة زخرفية يمكن حذفها دون أن يتغير السؤال.",
    "أعد scenarioContract منظمًا لكل بديل: target مطابق حرفيًا لـscenarioTarget، وevidencePhrases عبارتان إلى أربع عبارات قصيرة منسوخة حرفيًا من stimulus أو text تثبت عناصر السياق، وscientificLink يشرح كيف يخدم السياق هدف التعلم، وcontextIsEssential=true عندما يكون السياق الحياتي أو حالة القرار جزءًا من الحل.",
    "لا تخلط بين الدروس؛ كل مفردة مرتبطة باسم درس ومرجع صفحة محددين في الخطة.",
    "يُمنع إنشاء أسئلة عن اسم الوحدة أو رقمها أو اسم الكتاب أو الصفحة أو موضع الدرس في المنهج؛ المطلوب قياس المحتوى العلمي للدرس فقط.",
    "إذا وُجد regenerationAnchor فأنشئ البدائل الجديدة مشابهة له في المفهوم العلمي ونمط السؤال ومستوى العمق، مع تغيير الصياغة أو القيم فقط عندما يدعم المرجع ذلك. لا تنتقل إلى مفهوم آخر داخل الكتاب.",
    "اجعل السؤال يقيس الفهم العلمي لا حفظ صياغة الكتاب. لا تكثر من أسئلة التعريف المباشر؛ استخدمها فقط عندما يكون styleTarget=مفهومي والمعلومة مصطلحًا أساسيًا.",
    "عند styleTarget=سياقي: قدّم موقفًا واقعيًا قصيرًا ومناسبًا للبيئة العُمانية أو محايدًا ثقافيًا، ثم اسأل عن تطبيق المفهوم.",
    "عند styleTarget=حسابي: ضع المعطيات والوحدات في stimulus، واجعل لكل درجة نقطة تصحيح مستقلة تشمل الطريقة والنتيجة والوحدة عند الحاجة. إذا كانت marks درجتين أو أكثر فأعد workingRequired=true، وإذا كانت درجة واحدة فأعد workingRequired=false؛ ويقوم الخادم بتثبيت هذه القاعدة تلقائيًا.",
    "عند styleTarget=بيانات: قدّم جدولًا نصيًا صغيرًا أو نتائج قياس أو وصف رسم بياني في stimulus، ثم اطلب قراءة نمط أو حسابًا أو استنتاجًا من البيانات.",
    "عند styleTarget=استقصائي: قدّم تجربة أو إجراءً مختصرًا، ثم اسأل عن متغير أو ضبط أو موثوقية أو تفسير نتائج أو تحسين طريقة.",
    "عند styleTarget=مقارنة: حدّد بوضوح الجانبين المطلوبين، واجعل كل فرق أو تشابه نقطة تصحيح مستقلة.",
    wholeExam
      ? "لكل مفردة قد يرفق الخادم fixedVisual جاهزًا وحتميًا. لا تنشئ visual ولا تعدله ولا تعيده في JSON؛ ابنِ السؤال النهائي بالاعتماد عليه عند وجوده."
      : "لكل مفردة قد يرفق الخادم fixedVisual جاهزًا وحتميًا. لا تنشئ visual ولا تعدله ولا تعيده في JSON؛ ابنِ البدائل الثلاثة بالاعتماد على fixedVisual نفسه.",
    "إذا كان fixedVisual.type لا يساوي none، فيجب أن يشير متن السؤال أو المطلوب بوضوح إلى الشكل أو الرسم أو البيانات، وأن تكون الإجابة متسقة حرفيًا مع القيم والعناصر الواردة في fixedVisual.",
    "التزم بدور fixedVisual.role: read للقراءة، calculate للحساب، interpret للتفسير، compare للمقارنة، complete لإكمال جدول أو تسلسل، draw لإضافة جزء إلى الشكل، وevaluate لتقييم طريقة أو بيانات.",
    "في context_scene اجعل المشهد الحياتي المحدد في scenarioTarget مدخلًا حقيقيًا لتطبيق المفهوم، ولا تطلب منه حسابًا يحتاج أرقامًا غير موجودة. في data_table استخدم عناوين الأعمدة والوحدات والخلايا المخفية كما هي. في instrument_scale اطلب قراءة التدريج مع الوحدة. في ray_diagram وforce_diagram وflow_diagram اجعل السؤال غير قابل للحل دون الرجوع إلى الشكل.",
    "لا تضف إلى السؤال قيمة بصرية غير موجودة في fixedVisual، ولا تجعل الرسم يكشف الإجابة مباشرة. الرسم مملوك للخادم ومناسب للطباعة بالأبيض والأسود.",
    "مفردة الاختيار من متعدد درجتها واحدة وتقيس هدفًا واحدًا، ولها أربعة بدائل وإجابة صحيحة واحدة فقط.",
    "ابنِ مشتتات الاختيار من متعدد من أخطاء مفاهيمية أو عددية شائعة، واجعلها متجانسة في النوع والوحدة والطول، ولا تستخدم: جميع ما سبق، لا شيء مما سبق، أو الأول والثاني فقط.",
    "الإجابة القصيرة درجتها درجة أو درجتان، ويجب أن يتناسب مقدار الإجابة مع الدرجة وألا تطلب أكثر من نقاط التصحيح المحددة.",
    "الإجابة الطويلة للصفين 9 و10 فقط ودرجتها ثلاث أو أربع درجات، وتتطلب سياقًا مترابطًا ومهمتين فرعيتين كحد أقصى، لا مجرد سرد أو استرجاع.",
    "استخدم أفعال أمر دقيقة مثل: احسب، حدد، صف، قارن، فسر، استنتج، اقترح، برر. لا تستخدم فعلًا أعلى من الدرجة المتاحة.",
    "استخدم صياغة عربية قصيرة وواضحة، وتجنب النفي قدر الإمكان والنفي المزدوج، ولا تضع معلومات غير لازمة للإجابة.",
    "للإجابة القصيرة والطويلة: اجعل options مصفوفة فارغة، واكتب إجابة نموذجية قابلة للتصحيح.",
    "أعد markScheme كمصفوفة نصية طولها يساوي marks تمامًا. كل عنصر معيار تصحيح مستقل يستحق درجة واحدة، ولا تستخدم نقاطًا فارغة أو أنصاف درجات.",
    "أعد stimulus كسلسلة فارغة للسؤال المفهومي المباشر، ويجوز أن يكون فارغًا في السؤال البصري فقط عندما يحمل fixedVisual المتن أو البيانات ويشير نص السؤال إليه صراحة. في بقية الأنماط السياقية والحسابية والبيانية والاستقصائية يجب أن يوجد سياق كافٍ في stimulus أو داخل نص السؤال نفسه.",
    "لكل بديل اختر sourceEvidenceId واحدًا فقط من allowedEvidenceIds الخاصة بالمفردة نفسها، وأعد enrichmentEvidenceId من allowedEnrichmentIds أو سلسلة فارغة.",
    "لا تنسخ اقتباس المصدر داخل JSON؛ الخادم سيضيف نص الدليل الموثوق من المقطع المختار.",
    "لا تسأل عن أرقام صفحات أو حقوق نشر أو مقدمة الكتاب إلا إذا كان الموضوع المطلوب عنها صراحة.",
    "إذا كان النص المرجعي ضعيفًا لمفردة معينة، أنشئ سؤالًا أبسط على حقيقة صريحة واضبط needsReview=true. لا تخترع.",
    "لا تستخدم عبارات مثل: بالرجوع إلى النص أو وفقًا للمصدر داخل نص السؤال.",
    wholeExam
      ? "إذا كان fixedVisual.type لا يساوي none، فيجب أن يعتمد السؤال عليه اعتمادًا حقيقيًا ويذكر بوضوح الشكل أو الرسم أو الجدول أو التدريج أو البيانات الممثلة."
      : "إذا كان fixedVisual.type لا يساوي none، فيجب أن تعتمد صياغة كل بديل على الشكل اعتمادًا حقيقيًا وتذكر بوضوح: بالشكل المرفق أو الرسم المرفق أو الجدول المرفق أو التدريج أو البيانات الممثلة. لا تكتب سؤالًا يمكن حله دون النظر إلى الشكل.",
    "لا تجعل الشكل يكشف الإجابة مباشرة؛ استخدمه لتقديم التجهيز أو العلاقة أو البيانات التي يحتاج الطالب إلى تحليلها.",
    "لا تضع شروحًا خارج مخطط JSON المطلوب.",
  ].join("\n");
}

function buildUserPrompt(request: GenerationRequest, evidenceCatalog: EvidenceCatalog, enrichment: TrustedEnrichmentContext, repairAttempt: boolean, repairFeedback = ""): string {
  const references = request.references.map((reference) => ({
    id: reference.id,
    sourceTitle: reference.sourceTitle,
    sourceKind: reference.sourceKind,
    pages: reference.pageFrom === reference.pageTo ? `${reference.pageFrom}` : `${reference.pageFrom}-${reference.pageTo}`,
    evidenceFragments: (evidenceCatalog.byReferenceId.get(reference.id) ?? []).map((fragment) => ({
      id: fragment.id,
      text: fragment.text,
    })),
  }));
  const trustedEnrichment = enrichment.segments.map((segment) => ({
    id: segment.id,
    text: segment.text,
    sourceTitle: segment.sourceTitle,
  }));
  return JSON.stringify({
    task: repairAttempt
      ? (request.generationMode === "whole_exam_v2"
          ? "صحح المفردات المرسلة في هذا الطلب فقط وفق أسباب الرفض المحددة، ولا تعِد أو تغيّر مفردات غير مرسلة. احتفظ بالخطة والدرس والدرجة والسياق المنظم كما هي."
          : "أعد التوليد بدقة أكبر، وصحح سبب رفض المحاولة السابقة تحديدًا مع إبقاء الخطة والدرس والدرجة كما هي.")
      : (request.generationMode === "whole_exam_v2"
          ? "صمم اختبارًا كاملًا قابلًا للاستخدام الفعلي من بطاقات الدروس والمخطط والمراجع، ثم أعد سؤالًا نهائيًا واحدًا لكل مفردة."
          : "أنشئ بدائل الأسئلة الموثقة من مقاطع الأدلة المحددة."),
    previousValidationError: repairAttempt ? repairFeedback : "",
    exam: {
      assessmentType: request.assessmentType,
      assessmentPolicyId: request.assessmentPolicyId,
      topic: request.topic,
      lessons: request.lessons,
      grade: request.grade,
      subject: request.subject,
      difficulty: request.difficulty,
    },
    references,
    trustedEnrichment,
    lessonCards: request.lessonCards ?? [],
    wholeExamBlueprint: request.blueprint ?? null,
    globalAssessmentReferences: request.globalAssessmentReferences ?? [],
    globalAssessmentUseRule: (request.globalAssessmentReferences?.length ?? 0)
      ? "استفد من هندسة القياس والمثيرات والرسوم والأسئلة المتوافقة مع أهداف الدروس، مع إعادة الصياغة بمصطلحات المنهج وعدم إدخال معرفة خارج بطاقة الدرس."
      : "لا توجد مراجع اختبارات عالمية مرسلة في هذا الطلب.",
    assessmentDiversityBlueprint: assessmentDiversityBlueprint(request),
    officialPlanSummary: request.officialPlanItems.map((item) => ({
      planItemId: item.planItemId,
      lessonLabel: item.lessonLabel,
      learningOutcome: item.outcomeLabel,
      questionType: item.questionType,
      cognitiveLevel: item.cognitiveLevel,
      difficultyLevel: item.difficultyLevel ?? null,
      marks: item.marks,
      styleTarget: item.styleTarget,
      visualTarget: item.visualTarget,
      scenarioTarget: item.scenarioTarget,
      scenarioGuidance: SCENARIO_GUIDANCE[item.scenarioTarget],
      scenarioContract: {
        target: item.scenarioTarget,
        evidencePhraseRule: item.scenarioTarget === "scientific_abstract"
          ? "يجوز أن تكون evidencePhrases فارغة إذا لم يكن السؤال حياتيًا."
          : "أعد عبارتين إلى أربع عبارات منسوخة حرفيًا من متن السؤال تثبت عناصر السياق.",
        scientificLinkRule: `اربط السياق بهدف التعلم: ${item.outcomeLabel}`,
        contextIsEssential: item.scenarioTarget !== "scientific_abstract" || ["real_life_scene", "decision_case"].includes(item.stimulusTarget),
      },
      stimulusTarget: item.stimulusTarget,
      stimulusGuidance: STIMULUS_GUIDANCE[item.stimulusTarget],
      skillTarget: item.skillTarget,
      skillGuidance: SKILL_GUIDANCE[item.skillTarget],
      diversityKey: item.diversityKey,
    })),
    batchPlanItems: request.items.map((item) => ({
      ...item,
      fixedVisual: buildServerOwnedVisualSpec(item, request),
      allowedEvidenceIds: (evidenceCatalog.byReferenceId.get(item.sourceReferenceId) ?? []).map((fragment) => fragment.id),
      allowedEnrichmentIds: enrichment.segments.map((segment) => segment.id),
    })),
    outputContract: {
      topLevelType: "object",
      requiredTopLevelKey: "items",
      itemCount: request.items.length,
      alternativesPerItem: request.generationMode === "whole_exam_v2" ? 1 : 3,
      exactPlanItemIds: request.items.map((item) => item.planItemId),
      evidenceRule: "أعد sourceEvidenceId من allowedEvidenceIds الخاصة بالمفردة فقط. أعد enrichmentEvidenceId من allowedEnrichmentIds عند استخدام إثراء خارجي، وإلا فأعد سلسلة فارغة. أعد scenarioContract المنظم، ولا تعتمد على كلمات مفتاحية منفردة لإثبات السياق.",
      styleRule: "اجعل questionForm مطابقًا حرفيًا لـ styleTarget، ونفذ scenarioTarget وstimulusTarget وskillTarget. أعد markScheme كمصفوفة طولها يساوي marks تمامًا، وكل عنصر فيها معيار مستقل غير فارغ لدرجة واحدة. في السؤال الحسابي أعد workingRequired=true فقط عندما تكون marks درجتين أو أكثر، وfalse عندما تكون درجة واحدة. في الأسئلة غير المفهومية اجعل stimulus غير فارغ، إلا إذا كان fixedVisual يحمل السياق أو البيانات ويشير text إليه صراحة، أو كان text نفسه يتضمن السياق كاملًا.",
      visualRule: request.generationMode === "whole_exam_v2"
        ? "لا تعد visual في JSON. إذا كان fixedVisual.type لا يساوي none، يجب أن يعتمد السؤال النهائي عليه اعتمادًا جوهريًا ويذكره صراحة."
        : "لا تعد visual في JSON. إذا كان fixedVisual.type لا يساوي none، يجب أن تعتمد جميع البدائل الثلاثة على الشكل نفسه اعتمادًا جوهريًا وتذكر الشكل أو الرسم أو الجدول أو التدريج في نص السؤال؛ وإلا فستُرفض المفردة.",
    },
  });
}

function generationSchema(requestedItems: GenerationItem[], evidenceSource: EvidenceCatalog | string[], enrichmentIds: string[] = [], alternativesPerItem = 3): Record<string, unknown> {
  return {
    type: "object",
    description: "النتيجة النهائية لتوليد مفردات الاختبار، ويجب أن تحتوي المفتاح items فقط.",
    properties: {
      items: {
        type: "array",
        description: "مفردة مولدة واحدة لكل planItemId مطلوب وبالترتيب نفسه.",
        minItems: requestedItems.length,
        maxItems: requestedItems.length,
        prefixItems: requestedItems.map((requestedItem) => {
          const markCount = Number.isInteger(requestedItem.marks) && requestedItem.marks > 0
            ? requestedItem.marks
            : 1;
          const allowedEvidenceIds = Array.isArray(evidenceSource)
            ? evidenceSource
            : (evidenceSource.byReferenceId.get(requestedItem.sourceReferenceId) ?? []).map((fragment) => fragment.id);
          if (!allowedEvidenceIds.length) {
            throw httpError("لا توجد مقاطع دليل مرتبطة بمرجع إحدى مفردات الاختبار.", 400);
          }
          return ({
            type: "object",
            properties: {
              planItemId: {
                type: "string",
                enum: [requestedItem.planItemId],
                description: "المعرف المطابق حرفيًا لمفردة هذا الموضع في الدفعة.",
              },
              alternatives: {
                type: "array",
                description: alternativesPerItem === 1 ? "سؤال نهائي واحد للمفردة ضمن الاختبار الكامل." : "ثلاث صيغ بديلة مختلفة للمفردة نفسها.",
                minItems: alternativesPerItem,
                maxItems: alternativesPerItem,
                items: {
                  type: "object",
                  properties: {
                    stimulus: {
                      type: "string",
                      description: requestedItem.styleTarget === "مفهومي"
                        ? "متن اختياري للسؤال المفهومي المباشر."
                        : requestedItem.visualTarget !== "none"
                          ? "متن نصي إضافي اختياري؛ يجوز أن يكون فارغًا إذا كان fixedVisual نفسه يحمل السياق أو البيانات ويشير نص السؤال إليه صراحة."
                          : "متن أو سياق أو بيانات السؤال. يجب ألا يكون فارغًا إلا إذا تضمّن نص السؤال نفسه السياق أو المعطيات كاملة.",
                    },
                    text: { type: "string", description: "نص المطلوب بصياغة عربية واضحة وفعل أمر مناسب." },
                    options: {
                      type: "array",
                      description: "أربعة خيارات للاختيار من متعدد، ومصفوفة فارغة لبقية الأنواع.",
                      items: { type: "string" },
                    },
                    answer: { type: "string", description: "الإجابة النموذجية الدقيقة." },
                    rationale: { type: "string", description: "تفسير موجز لصحة الإجابة." },
                    markScheme: {
                      type: "array",
                      description: `نقاط التصحيح للمفردة. يجب أن تحتوي ${markCount} عناصر غير فارغة بالضبط، وكل عنصر يستحق درجة واحدة مستقلة.`,
                      minItems: markCount,
                      maxItems: markCount,
                      items: {
                        type: "string",
                        description: "معيار تصحيح محدد ومستقل وغير فارغ لدرجة واحدة.",
                      },
                    },
                    questionForm: {
                      type: "string",
                      enum: ["مفهومي", "سياقي", "حسابي", "بيانات", "استقصائي", "مقارنة"],
                      description: "يجب أن يطابق styleTarget الخاص بالمفردة.",
                    },
                    workingRequired: {
                      type: "boolean",
                      description: "قيمة مساعدة: true للسؤال الحسابي ذي درجتين أو أكثر، وfalse للسؤال الحسابي ذي الدرجة الواحدة ولغير الحسابي. يثبت الخادم القيمة النهائية تلقائيًا.",
                    },
                    sourceEvidenceId: {
                      type: "string",
                      enum: allowedEvidenceIds,
                      description: "معرف مقطع الدليل المختار من allowedEvidenceIds الخاصة بهذه المفردة فقط.",
                    },
                    enrichmentEvidenceId: {
                      type: "string",
                      enum: ["", ...enrichmentIds],
                      description: "معرف إثراء رسمي مستخدم في السياق، أو سلسلة فارغة عند عدم استخدام إثراء خارجي.",
                    },
                    scenarioContract: {
                      type: "object",
                      description: "إثبات منظم لاستخدام السياق المخصص للمفردة، بدل الاعتماد على مطابقة كلمة واحدة.",
                      properties: {
                        target: {
                          type: "string",
                          enum: [requestedItem.scenarioTarget],
                          description: "السياق المستهدف للمفردة كما أرسله الخادم حرفيًا.",
                        },
                        evidencePhrases: {
                          type: "array",
                          minItems: requestedItem.scenarioTarget === "scientific_abstract" ? 0 : 2,
                          maxItems: 4,
                          items: {
                            type: "string",
                            description: "عبارة قصيرة منسوخة حرفيًا من stimulus أو text تثبت عنصرًا فعليًا من السياق.",
                          },
                        },
                        scientificLink: {
                          type: "string",
                          description: "شرح موجز للعلاقة بين السياق وهدف التعلم أو المهارة العلمية.",
                        },
                        contextIsEssential: {
                          type: "boolean",
                          description: "true عندما يتغير السؤال أو طريقة التفكير بحذف السياق.",
                        },
                      },
                      required: ["target", "evidencePhrases", "scientificLink", "contextIsEssential"],
                      additionalProperties: false,
                    },
                    needsReview: { type: "boolean" },
                  },
                  required: ["stimulus", "text", "options", "answer", "rationale", "markScheme", "questionForm", "workingRequired", "sourceEvidenceId", "enrichmentEvidenceId", "scenarioContract", "needsReview"],
                  additionalProperties: false,
                },
              },
            },
            required: ["planItemId", "alternatives"],
            additionalProperties: false,
          });
        }),
      },
    },
    required: ["items"],
    additionalProperties: false,
  };
}

function parseGenerationRequest(value: unknown): GenerationRequest {
  const record = requireRecord(value, "طلب إنشاء الأسئلة غير صالح.");
  const generationMode = record.action === "generate_exam_v2" ? "whole_exam_v2" : "legacy_items";
  const generationVersion = typeof record.generationVersion === "string" ? record.generationVersion.trim().slice(0, 160) : "";
  const compatibleWholeExamVersions = new Set([
    "source-grounded-policy-ai-17-whole-exam-v2",
    "source-grounded-policy-ai-18-exam-integrity-resume",
    "source-grounded-policy-ai-19-structured-scenario-repair",
  ]);
  if (generationMode === "whole_exam_v2" && !compatibleWholeExamVersions.has(generationVersion)) {
    throw httpError("إصدار محرك الاختبار الكامل غير متوافق.", 400);
  }
  const assessmentType = requireEnum(record.assessmentType, ["اختبار قصير رسمي", "امتحان نهاية الفصل الدراسي"] as const, "نوع التقويم غير صالح.");
  const assessmentPolicyId = requireEnum(record.assessmentPolicyId, ["oman-science-assessment-2025-2026"] as const, "مرجع التقويم غير صالح.");
  const topic = requireText(record.topic, "موضوع الاختبار غير موجود.", 500);
  const subject = requireText(record.subject, "اسم المادة غير موجود.", 120);
  const grade = requireInteger(record.grade, "الصف الدراسي غير صالح.", 1, 12);
  const difficulty = requireEnum(record.difficulty, ["سهل", "متوسط", "متقدم"] as const, "مستوى الصعوبة غير صالح.");
  const trustedEnrichmentEnabled = record.trustedEnrichmentEnabled === true;
  if (!Array.isArray(record.lessons) || record.lessons.length < 2 || record.lessons.length > 5) {
    throw httpError("يجب إرسال درسين إلى خمسة دروس.", 400);
  }
  const lessons = record.lessons.map((lesson) => requireText(lesson, "اسم أحد الدروس غير موجود.", 180));
  const lessonKeys = lessons.map(normalizeForEvidence);
  if (new Set(lessonKeys).size !== lessons.length) throw httpError("توجد دروس مكررة في الطلب.", 400);

  if (!Array.isArray(record.references) || record.references.length < 1 || record.references.length > MAX_REFERENCES) {
    throw httpError(`يجب إرسال مرجع واحد إلى ${MAX_REFERENCES} مراجع للدفعة.`, 400);
  }
  const maximumRequestedItems = generationMode === "whole_exam_v2" ? MAX_WHOLE_EXAM_ITEMS : MAX_BATCH_ITEMS;
  if (!Array.isArray(record.items) || record.items.length < 1 || record.items.length > maximumRequestedItems) {
    throw httpError(generationMode === "whole_exam_v2"
      ? `محرك الاختبار الكامل يدعم من مفردة واحدة إلى ${MAX_WHOLE_EXAM_ITEMS} مفردة في هذه المرحلة.`
      : `يجب إرسال مفردة واحدة إلى ${MAX_BATCH_ITEMS} مفردتين في الدفعة.`, 400);
  }
  if (!Array.isArray(record.officialPlanItems) || record.officialPlanItems.length < 1 || record.officialPlanItems.length > MAX_OFFICIAL_ITEMS) {
    throw httpError(`خطة الاختبار الرسمية يجب أن تحتوي من مفردة واحدة إلى ${MAX_OFFICIAL_ITEMS} مفردة.`, 400);
  }

  let totalReferenceCharacters = 0;
  const references = record.references.map((entry) => {
    const item = requireRecord(entry, "أحد المراجع غير صالح.");
    const content = requireText(item.content, "نص أحد المراجع فارغ.", MAX_REFERENCE_CHARACTERS);
    totalReferenceCharacters += content.length;
    const lessonScopeMode = requireEnum(
      item.lessonScopeMode,
      ["page-range", "page-neighborhood", "strict-title-fallback", "legacy-title"] as const,
      "طريقة إثبات نطاق الدرس غير صالحة.",
    );
    const lessonPageFrom = item.lessonPageFrom === undefined
      ? undefined
      : requireInteger(item.lessonPageFrom, "بداية نطاق صفحات الدرس غير صالحة.", 1, 10_000);
    const lessonPageTo = item.lessonPageTo === undefined
      ? undefined
      : requireInteger(item.lessonPageTo, "نهاية نطاق صفحات الدرس غير صالحة.", 1, 10_000);
    if ((lessonScopeMode === "page-range" || lessonScopeMode === "page-neighborhood")
      && (lessonPageFrom === undefined || lessonPageTo === undefined || lessonPageTo < lessonPageFrom)) {
      throw httpError("مرجع الدرس المقيد بالصفحات لا يحتوي نطاق صفحات صالحًا.", 400);
    }
    return {
      id: requireText(item.id, "معرف المرجع غير موجود.", 220),
      sourceId: requireText(item.sourceId, "معرف مصدر المرجع غير موجود.", 220),
      sourceTitle: requireText(item.sourceTitle, "عنوان المرجع غير موجود.", 220),
      sourceKind: requireText(item.sourceKind, "نوع المرجع غير موجود.", 100),
      pageFrom: requireInteger(item.pageFrom, "بداية صفحات المرجع غير صالحة.", 1, 10_000),
      pageTo: requireInteger(item.pageTo, "نهاية صفحات المرجع غير صالحة.", 1, 10_000),
      content,
      lessonTopic: requireText(item.lessonTopic, "الدرس المرتبط بالمرجع غير موجود.", 180),
      lessonScopeMode,
      ...(lessonPageFrom === undefined ? {} : { lessonPageFrom }),
      ...(lessonPageTo === undefined ? {} : { lessonPageTo }),
    } satisfies GenerationReference;
  });
  if (totalReferenceCharacters > MAX_TOTAL_REFERENCE_CHARACTERS) {
    throw httpError("مجموع نصوص المراجع أكبر من الحد المسموح لدفعة توليد واحدة.", 413);
  }
  const referenceIds = new Set(references.map((reference) => reference.id));
  const referenceById = new Map(references.map((reference) => [reference.id, reference]));
  if (referenceIds.size !== references.length) throw httpError("توجد مراجع مكررة في الطلب.", 400);
  references.forEach((reference) => {
    if (reference.pageTo < reference.pageFrom) throw httpError("نطاق صفحات أحد المراجع غير صالح.", 400);
  });

  const parsePlanItem = (entry: unknown, requireSentReference: boolean): GenerationItem => {
    const item = requireRecord(entry, "إحدى مفردات الخطة غير صالحة.");
    const sourceReferenceId = requireText(item.sourceReferenceId, "مرجع إحدى المفردات غير موجود.", 220);
    if (requireSentReference && !referenceIds.has(sourceReferenceId)) {
      throw httpError("إحدى مفردات الدفعة تشير إلى مرجع غير مرسل.", 400);
    }
    const lessonLabel = requireText(item.lessonLabel, "درس إحدى المفردات غير موجود.", 180);
    if (!lessonKeys.includes(normalizeForEvidence(lessonLabel))) {
      throw httpError("إحدى مفردات الخطة مرتبطة بدرس غير موجود في قائمة الدروس.", 400);
    }
    if (requireSentReference) {
      const reference = referenceById.get(sourceReferenceId);
      if (!reference || normalizeForEvidence(reference.lessonTopic) !== normalizeForEvidence(lessonLabel)) {
        throw httpError("مرجع إحدى المفردات لا يطابق الدرس المحدد.", 400);
      }
      if (!referenceSupportsLessonScope(lessonLabel, reference)) {
        throw httpError("مرجع إحدى المفردات خارج نطاق الدرس الموثق.", 400);
      }
    }
    return {
      planItemId: requireText(item.planItemId, "معرف مفردة الخطة غير موجود.", 120),
      questionType: requireEnum(item.questionType, ["اختيار من متعدد", "إجابة قصيرة", "إجابة طويلة"] as const, "نوع السؤال غير صالح."),
      cognitiveLevel: requireEnum(item.cognitiveLevel, ["معرفة", "تطبيق", "استدلال"] as const, "المستوى المعرفي غير صالح."),
      ...(item.difficultyLevel === undefined
        ? {}
        : { difficultyLevel: requireEnum(item.difficultyLevel, ["منخفض", "متوسط", "مرتفع"] as const, "مستوى صعوبة المفردة غير صالح.") }),
      marks: requireInteger(item.marks, "درجة السؤال غير صالحة.", 1, 20),
      sourceReferenceId,
      lessonLabel,
      outcomeLabel: typeof item.outcomeLabel === "string" && item.outcomeLabel.trim()
        ? item.outcomeLabel.trim().slice(0, 220)
        : lessonLabel,
      styleTarget: requireEnum(item.styleTarget, ["مفهومي", "سياقي", "حسابي", "بيانات", "استقصائي", "مقارنة"] as const, "نمط بناء السؤال غير صالح."),
      visualTarget: requireEnum(item.visualTarget, ["none", "context_scene", "line_graph", "bar_chart", "pressure_diagram", "circuit_diagram", "electrostatic_diagram", "data_table", "instrument_scale", "ray_diagram", "force_diagram", "flow_diagram"] as const, "نوع الرسم التعليمي غير صالح."),
      scenarioTarget: item.scenarioTarget === undefined ? "scientific_abstract" : requireEnum(item.scenarioTarget, ["scientific_abstract", "door_handle", "playground_seesaw", "wrench_tool", "bicycle_brake", "shopping_trolley", "school_bag", "water_tank", "solar_panel", "laboratory_setup", "road_safety"] as const, "سياق السؤال المستهدف غير صالح."),
      stimulusTarget: item.stimulusTarget === undefined ? "concise_text" : requireEnum(item.stimulusTarget, ["concise_text", "real_life_scene", "scientific_diagram", "data_table", "graph", "instrument", "experiment", "decision_case"] as const, "نوع مثير السؤال المستهدف غير صالح."),
      skillTarget: item.skillTarget === undefined ? "recognize" : requireEnum(item.skillTarget, ["recognize", "apply", "calculate", "interpret", "compare", "evaluate", "investigate"] as const, "مهارة السؤال المستهدفة غير صالحة."),
      diversityKey: typeof item.diversityKey === "string" && item.diversityKey.trim() ? item.diversityKey.trim().slice(0, 240) : `legacy:${requireText(item.planItemId, "معرف مفردة الخطة غير موجود.", 120)}`,
      ...(item.regenerationAnchor === undefined ? {} : {
        regenerationAnchor: (() => {
          const anchor = requireRecord(item.regenerationAnchor, "مرساة إعادة التوليد غير صالحة.");
          return {
            stimulus: typeof anchor.stimulus === "string" ? anchor.stimulus.trim().slice(0, 1_200) : "",
            text: requireText(anchor.text, "نص مرساة إعادة التوليد غير موجود.", 1_200),
            answer: requireText(anchor.answer, "إجابة مرساة إعادة التوليد غير موجودة.", 1_000),
            questionForm: requireEnum(anchor.questionForm, ["مفهومي", "سياقي", "حسابي", "بيانات", "استقصائي", "مقارنة"] as const, "نمط مرساة إعادة التوليد غير صالح."),
          };
        })(),
      }),
    };
  };

  const officialPlanItems = record.officialPlanItems.map((entry) => parsePlanItem(entry, false));
  const items = record.items.map((entry) => parsePlanItem(entry, true));
  if (new Set(officialPlanItems.map((item) => item.planItemId)).size !== officialPlanItems.length) {
    throw httpError("توجد مفردات مكررة في خطة الاختبار الرسمية.", 400);
  }
  if (new Set(items.map((item) => item.planItemId)).size !== items.length) {
    throw httpError("توجد مفردات مكررة في دفعة التوليد.", 400);
  }
  validateOfficialAssessmentPlan(assessmentType, grade, officialPlanItems);
  validateOfficialAssessmentDiversity(assessmentType, officialPlanItems);
  for (const lessonKey of lessonKeys) {
    if (!officialPlanItems.some((item) => normalizeForEvidence(item.lessonLabel) === lessonKey)) {
      throw httpError("خطة الاختبار لا توزع المفردات على جميع الدروس المدخلة.", 400);
    }
  }

  const officialById = new Map(officialPlanItems.map((item) => [item.planItemId, item]));
  for (const item of items) {
    const official = officialById.get(item.planItemId);
    if (!official
      || official.questionType !== item.questionType
      || official.cognitiveLevel !== item.cognitiveLevel
      || official.difficultyLevel !== item.difficultyLevel
      || official.marks !== item.marks
      || official.sourceReferenceId !== item.sourceReferenceId
      || normalizeForEvidence(official.outcomeLabel) !== normalizeForEvidence(item.outcomeLabel)
      || official.styleTarget !== item.styleTarget
      || official.visualTarget !== item.visualTarget
      || official.scenarioTarget !== item.scenarioTarget
      || official.stimulusTarget !== item.stimulusTarget
      || official.skillTarget !== item.skillTarget
      || official.diversityKey !== item.diversityKey
      || normalizeForEvidence(official.lessonLabel) !== normalizeForEvidence(item.lessonLabel)) {
      throw httpError("دفعة التوليد لا تطابق خطة الاختبار الرسمية.", 400);
    }
  }
  const lessonCards: LessonCardV2[] = generationMode === "whole_exam_v2" && Array.isArray(record.lessonCards)
    ? record.lessonCards.map((entry) => {
        const card = requireRecord(entry, "إحدى بطاقات الدروس غير صالحة.");
        return {
          lessonLabel: requireText(card.lessonLabel, "عنوان بطاقة الدرس غير موجود.", 180),
          learningOutcomes: Array.isArray(card.learningOutcomes)
            ? card.learningOutcomes.map((outcome) => requireText(outcome, "أحد أهداف بطاقة الدرس غير صالح.", 240)).slice(0, 12)
            : [],
          concepts: Array.isArray(card.concepts)
            ? card.concepts.map((concept) => requireText(concept, "أحد مفاهيم بطاقة الدرس غير صالح.", 100)).slice(0, 16)
            : [],
          sourceReferenceIds: Array.isArray(card.sourceReferenceIds)
            ? card.sourceReferenceIds.map((id) => requireText(id, "معرف مرجع بطاقة الدرس غير صالح.", 220)).slice(0, 8)
            : [],
          sourceSummary: typeof card.sourceSummary === "string" ? card.sourceSummary.trim().slice(0, 2_400) : "",
        };
      })
    : [];
  if (generationMode === "whole_exam_v2" && lessonCards.length !== lessons.length) {
    throw httpError("محرك الاختبار الكامل يحتاج بطاقة واحدة لكل درس محدد.", 400);
  }

  const blueprintRecord = generationMode === "whole_exam_v2" ? requireRecord(record.blueprint, "مخطط الاختبار الكامل غير صالح.") : null;
  const blueprint: AssessmentBlueprintV2 | null = blueprintRecord ? {
    version: requireEnum(blueprintRecord.version, ["whole-exam-blueprint-v1"] as const, "إصدار مخطط الاختبار غير صالح."),
    totalMarks: requireInteger(blueprintRecord.totalMarks, "مجموع درجات المخطط غير صالح.", 1, 100),
    itemCount: requireInteger(blueprintRecord.itemCount, "عدد مفردات المخطط غير صالح.", 1, MAX_WHOLE_EXAM_ITEMS),
    lessons: Array.isArray(blueprintRecord.lessons)
      ? blueprintRecord.lessons.map((lesson) => requireText(lesson, "أحد دروس المخطط غير صالح.", 180))
      : [],
    items: Array.isArray(blueprintRecord.items)
      ? blueprintRecord.items.map((entry) => {
          const blueprintItem = requireRecord(entry, "إحدى مفردات مخطط الاختبار غير صالحة.");
          return {
            order: requireInteger(blueprintItem.order, "ترتيب مفردة المخطط غير صالح.", 1, MAX_WHOLE_EXAM_ITEMS),
            planItemId: requireText(blueprintItem.planItemId, "معرف مفردة المخطط غير صالح.", 120),
            lessonLabel: requireText(blueprintItem.lessonLabel, "درس مفردة المخطط غير صالح.", 180),
            learningOutcome: requireText(blueprintItem.learningOutcome, "هدف مفردة المخطط غير صالح.", 240),
            questionType: requireText(blueprintItem.questionType, "نوع مفردة المخطط غير صالح.", 80),
            cognitiveLevel: requireText(blueprintItem.cognitiveLevel, "مستوى مفردة المخطط غير صالح.", 80),
            marks: requireInteger(blueprintItem.marks, "درجة مفردة المخطط غير صالحة.", 1, 20),
            styleTarget: requireEnum(blueprintItem.styleTarget, ["مفهومي", "سياقي", "حسابي", "بيانات", "استقصائي", "مقارنة"] as const, "نمط مفردة المخطط غير صالح."),
            visualTarget: requireEnum(blueprintItem.visualTarget, ["none", "context_scene", "line_graph", "bar_chart", "pressure_diagram", "circuit_diagram", "electrostatic_diagram", "data_table", "instrument_scale", "ray_diagram", "force_diagram", "flow_diagram"] as const, "رسم مفردة المخطط غير صالح."),
            scenarioTarget: requireEnum(blueprintItem.scenarioTarget, ["scientific_abstract", "door_handle", "playground_seesaw", "wrench_tool", "bicycle_brake", "shopping_trolley", "school_bag", "water_tank", "solar_panel", "laboratory_setup", "road_safety"] as const, "سياق مفردة المخطط غير صالح."),
            stimulusTarget: requireEnum(blueprintItem.stimulusTarget, ["concise_text", "real_life_scene", "scientific_diagram", "data_table", "graph", "instrument", "experiment", "decision_case"] as const, "مثير مفردة المخطط غير صالح."),
            skillTarget: requireEnum(blueprintItem.skillTarget, ["recognize", "apply", "calculate", "interpret", "compare", "evaluate", "investigate"] as const, "مهارة مفردة المخطط غير صالحة."),
            diversityKey: requireText(blueprintItem.diversityKey, "بصمة مفردة المخطط غير صالحة.", 240),
          };
        })
      : [],
    globalReviewRules: Array.isArray(blueprintRecord.globalReviewRules)
      ? blueprintRecord.globalReviewRules.map((rule) => requireText(rule, "إحدى قواعد المراجعة غير صالحة.", 300)).slice(0, 12)
      : [],
  } : null;
  if (blueprint && (blueprint.itemCount !== items.length || blueprint.items.length !== items.length || blueprint.totalMarks !== items.reduce((sum, item) => sum + item.marks, 0))) {
    throw httpError("مخطط الاختبار الكامل لا يطابق الخطة الرسمية.", 400);
  }

  const globalAssessmentReferences: GlobalAssessmentReferenceV2[] = generationMode === "whole_exam_v2" && Array.isArray(record.globalAssessmentReferences)
    ? record.globalAssessmentReferences.map((entry) => {
        const globalReference = requireRecord(entry, "أحد مراجع الاختبارات العالمية غير صالح.");
        return {
          id: requireText(globalReference.id, "معرف المرجع العالمي غير صالح.", 220),
          sourceTitle: requireText(globalReference.sourceTitle, "عنوان المرجع العالمي غير صالح.", 220),
          sourceKind: requireText(globalReference.sourceKind, "نوع المرجع العالمي غير صالح.", 100),
          excerpt: requireText(globalReference.excerpt, "محتوى المرجع العالمي فارغ.", 2_000),
        };
      }).slice(0, 6)
    : [];

  return {
    generationMode,
    generationVersion,
    assessmentType,
    assessmentPolicyId,
    topic,
    lessons,
    grade,
    subject,
    difficulty,
    trustedEnrichmentEnabled,
    references,
    officialPlanItems,
    items,
    lessonCards,
    blueprint,
    globalAssessmentReferences,
  };
}

function validateOfficialAssessmentDiversity(assessmentType: AssessmentType, items: GenerationItem[]): void {
  const modernItems = items.filter((item) => !item.diversityKey.startsWith("legacy:"));
  if (modernItems.length < 4) return;

  const uniqueDiversityKeys = new Set(modernItems.map((item) => item.diversityKey));
  if (uniqueDiversityKeys.size !== modernItems.length) {
    throw httpError("خطة تنوع الاختبار تحتوي بصمات مكررة لمفردات مختلفة.", 400);
  }

  const styleCount = new Set(modernItems.map((item) => item.styleTarget)).size;
  const skillCount = new Set(modernItems.map((item) => item.skillTarget)).size;
  if (modernItems.length >= 6 && styleCount < 4) {
    throw httpError("خطة الاختبار لا تنوع أساليب القياس بما يكفي بين الفهم والتطبيق والبيانات والاستدلال.", 400);
  }
  if (modernItems.length >= 6 && skillCount < 3) {
    throw httpError("خطة الاختبار تكرر المهارة نفسها ولا تقيس تعلم الطلبة بصورة متوازنة.", 400);
  }

  const appliedContexts = modernItems.filter((item) => item.scenarioTarget !== "scientific_abstract");
  const distinctContexts = new Set(appliedContexts.map((item) => item.scenarioTarget)).size;
  const minimumContexts = assessmentType === "اختبار قصير رسمي"
    ? Math.min(3, Math.max(1, Math.floor(modernItems.length / 3)))
    : Math.min(6, Math.max(3, Math.floor(modernItems.length / 6)));
  if (distinctContexts < minimumContexts) {
    throw httpError("خطة الاختبار لا تتضمن تنوعًا كافيًا في مواقف الحياة اليومية والتطبيقات العلمية.", 400);
  }

  const directRecognitionCount = modernItems.filter((item) => item.skillTarget === "recognize").length;
  const directRecognitionLimit = assessmentType === "اختبار قصير رسمي"
    ? 1
    : Math.max(2, Math.ceil(modernItems.length * 0.18));
  if (directRecognitionCount > directRecognitionLimit) {
    throw httpError("خطة الاختبار تعتمد على الاستدعاء المباشر أكثر من الحد المسموح لجودة القياس.", 400);
  }
}

function validateOfficialAssessmentPlan(assessmentType: AssessmentType, grade: number, items: GenerationItem[]): void {
  if (grade < 5 || grade > 10) throw httpError("وثيقة تقويم العلوم الحالية تغطي الصفوف 5-10 فقط.", 400);
  const totalMarks = items.reduce((total, item) => total + item.marks, 0);
  const cognitiveMarks: Record<CognitiveLevel, number> = { معرفة: 0, تطبيق: 0, استدلال: 0 };
  const difficultyMarks: Record<ItemDifficulty, number> = { منخفض: 0, متوسط: 0, مرتفع: 0 };
  const counts = { mcq: 0, short: 0, long: 0 };
  for (const item of items) {
    cognitiveMarks[item.cognitiveLevel] += item.marks;
    if (item.difficultyLevel) difficultyMarks[item.difficultyLevel] += item.marks;
    if (item.questionType === "اختيار من متعدد") {
      counts.mcq += 1;
      if (item.marks !== 1) throw httpError("مفردة الاختيار من متعدد يجب أن تكون بدرجة واحدة.", 400);
    } else if (item.questionType === "إجابة قصيرة") {
      counts.short += 1;
      if (item.marks < 1 || item.marks > 2) throw httpError("مفردة الإجابة القصيرة يجب أن تكون بدرجة أو درجتين.", 400);
    } else {
      counts.long += 1;
      if (grade < 9 || item.marks < 3 || item.marks > 4) throw httpError("مفردة الإجابة الطويلة مسموحة للصفين 9 و10 وبثلاث أو أربع درجات.", 400);
    }
  }

  if (assessmentType === "اختبار قصير رسمي") {
    const expectedMarks = grade === 10 ? 10 : 15;
    const expectedCognitive = grade === 10
      ? { معرفة: 4, تطبيق: 4, استدلال: 2 }
      : { معرفة: 6, تطبيق: 6, استدلال: 3 };
    const minItems = grade === 10 ? 5 : 8;
    const maxItems = grade === 10 ? 7 : 12;
    if (items.length < minItems || items.length > maxItems || totalMarks !== expectedMarks) {
      throw httpError("خطة الاختبار القصير لا تطابق عدد المفردات أو الدرجة الكلية الرسمية.", 400);
    }
    if (cognitiveMarks.معرفة !== expectedCognitive.معرفة || cognitiveMarks.تطبيق !== expectedCognitive.تطبيق || cognitiveMarks.استدلال !== expectedCognitive.استدلال) {
      throw httpError("توزيع درجات المعرفة والتطبيق والاستدلال لا يطابق 40% و40% و20%.", 400);
    }
    if (grade <= 8 && (counts.mcq !== 3 || counts.short < 5 || counts.short > 9 || counts.long !== 0)) {
      throw httpError("أنواع مفردات الصفوف 5-8 لا تطابق وثيقة التقويم.", 400);
    }
    if (grade === 9 && (counts.mcq !== 3 || counts.long !== 1)) {
      throw httpError("أنواع مفردات الصف التاسع لا تطابق وثيقة التقويم.", 400);
    }
    if (grade === 10) {
      const mcqLevels = items.filter((item) => item.questionType === "اختيار من متعدد").map((item) => item.cognitiveLevel).sort();
      if (counts.mcq !== 2 || counts.long !== 1 || mcqLevels.join("|") !== ["تطبيق", "معرفة"].sort().join("|")) {
        throw httpError("اختبار الصف العاشر يحتاج مفردتي اختيار من متعدد للمعرفة والتطبيق ومفردة طويلة واحدة.", 400);
      }
    }
    return;
  }

  const expectedMarks = grade === 10 ? 60 : 40;
  const expectedCognitive = grade === 10
    ? { معرفة: 24, تطبيق: 24, استدلال: 12 }
    : { معرفة: 16, تطبيق: 16, استدلال: 8 };
  const expectedDifficulty = grade === 10
    ? { منخفض: 24, متوسط: 24, مرتفع: 12 }
    : { منخفض: 16, متوسط: 16, مرتفع: 8 };
  const minItems = grade === 10 ? 30 : 25;
  const maxItems = grade === 10 ? 40 : 35;
  const expectedMcq = grade === 10 ? 10 : 8;
  if (items.length < minItems || items.length > maxItems || totalMarks !== expectedMarks) {
    throw httpError("خطة الاختبار النهائي لا تطابق عدد المفردات أو الدرجة الكلية الرسمية.", 400);
  }
  if (cognitiveMarks.معرفة !== expectedCognitive.معرفة || cognitiveMarks.تطبيق !== expectedCognitive.تطبيق || cognitiveMarks.استدلال !== expectedCognitive.استدلال) {
    throw httpError("توزيع أهداف التقويم في الاختبار النهائي لا يطابق 40% و40% و20%.", 400);
  }
  if (difficultyMarks.منخفض !== expectedDifficulty.منخفض || difficultyMarks.متوسط !== expectedDifficulty.متوسط || difficultyMarks.مرتفع !== expectedDifficulty.مرتفع) {
    throw httpError("توزيع مستويات الصعوبة في الاختبار النهائي لا يطابق 40% و40% و20%.", 400);
  }
  if (counts.mcq !== expectedMcq) throw httpError("عدد مفردات الاختيار من متعدد في الاختبار النهائي غير مطابق.", 400);
  if (grade <= 8 && counts.long !== 0) throw httpError("الإجابة الطويلة غير مستخدمة في الاختبار النهائي للصفوف 5-8.", 400);
  if (grade >= 9 && counts.long < 2) throw httpError("الاختبار النهائي للصفين 9 و10 يحتاج مفردتين طويلتين على الأقل.", 400);
}

function buildEvidenceCatalog(references: GenerationReference[]): EvidenceCatalog {
  const fragments: EvidenceFragment[] = [];
  const byReferenceId = new Map<string, EvidenceFragment[]>();

  references.forEach((reference, referenceIndex) => {
    const referenceFragments = splitEvidenceFragments(reference.content).map((text, fragmentIndex) => ({
      id: `EV-${referenceIndex + 1}-${fragmentIndex + 1}`,
      referenceId: reference.id,
      text,
    }));
    if (!referenceFragments.length) {
      throw httpError("تعذر تجهيز مقاطع دليل صالحة من أحد المراجع.", 400);
    }
    fragments.push(...referenceFragments);
    byReferenceId.set(reference.id, referenceFragments);
  });

  return {
    fragments,
    byId: new Map(fragments.map((fragment) => [fragment.id, fragment])),
    byReferenceId,
    referenceContentById: new Map(references.map((reference) => [reference.id, reference.content])),
    referenceById: new Map(references.map((reference) => [reference.id, reference])),
  };
}

function splitEvidenceFragments(content: string): string[] {
  const cleaned = content
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return [];

  const sentenceLike: string[] = [];
  for (const paragraph of cleaned.split(/\n+/u)) {
    const pieces = paragraph.match(/[^.!؟!؛]+(?:[.!؟!؛]+|$)/gu) ?? [paragraph];
    for (const piece of pieces) {
      const trimmed = piece.trim();
      if (trimmed) sentenceLike.push(...splitLongEvidencePiece(trimmed, 340));
    }
  }

  const fragments: string[] = [];
  let current = "";
  for (const piece of sentenceLike) {
    const candidate = current ? `${current} ${piece}` : piece;
    if (candidate.length <= 340) {
      current = candidate;
      if (current.length >= 180) {
        fragments.push(current.trim());
        current = "";
      }
      continue;
    }
    if (current) fragments.push(current.trim());
    current = piece;
  }
  if (current) fragments.push(current.trim());

  if (fragments.length > 1 && fragments.at(-1)!.length < 32) {
    const tail = fragments.pop()!;
    const previous = fragments.pop()!;
    fragments.push(`${previous} ${tail}`.trim());
  }
  return fragments.filter((fragment) => normalizeForEvidence(fragment).length >= 12);
}

function splitLongEvidencePiece(value: string, maxCharacters: number): string[] {
  if (value.length <= maxCharacters) return [value];
  const words = value.split(/\s+/u).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = word;
  }
  if (current) chunks.push(current);
  return chunks;
}

function hydrateGeneratedItem(
  generatedItem: ModelGeneratedItem,
  requested: GenerationItem,
  request: GenerationRequest,
  evidenceCatalog: EvidenceCatalog,
  enrichment: TrustedEnrichmentContext,
): GeneratedItem {
  const expectedAlternativeCount = request.generationMode === "whole_exam_v2" ? 1 : 3;
  if (!Array.isArray(generatedItem.alternatives) || generatedItem.alternatives.length !== expectedAlternativeCount) {
    throw retryableError(request.generationMode === "whole_exam_v2"
      ? "محرك الاختبار الكامل لم يلتزم بسؤال نهائي واحد للمفردة."
      : "مولد الأسئلة لم يلتزم بثلاثة بدائل للمفردة.");
  }
  const visual = buildServerOwnedVisualSpec(requested, request);
  const alternatives = generatedItem.alternatives.map((alternative) =>
    validateAndHydrateAlternative(
      alternative,
      requested.questionType,
      requested.sourceReferenceId,
      evidenceCatalog,
      requested.styleTarget,
      requested.visualTarget,
      requested.marks,
      requested.lessonLabel,
      requested.outcomeLabel,
      requested.regenerationAnchor,
      enrichment,
      visual,
      requested.scenarioTarget,
      requested.stimulusTarget,
      requested.skillTarget,
      requested.diversityKey,
      request.generationVersion === "source-grounded-policy-ai-19-structured-scenario-repair",
    )
  );
  if (alternatives.length > 1) validateAlternativeDiversity(alternatives, requested.diversityKey);
  return { planItemId: requested.planItemId, visual, alternatives };
}

function validateGeneratedItemsIndividually(
  payload: ModelGeneratedPayload,
  request: GenerationRequest,
  evidenceCatalog: EvidenceCatalog,
  enrichment: TrustedEnrichmentContext = { segments: [], attempted: false },
): ItemValidationBatch {
  const generatedById = new Map<string, ModelGeneratedItem[]>();
  if (payload && Array.isArray(payload.items)) {
    for (const generatedItem of payload.items) {
      if (!generatedItem || typeof generatedItem.planItemId !== "string") continue;
      const existing = generatedById.get(generatedItem.planItemId) ?? [];
      existing.push(generatedItem);
      generatedById.set(generatedItem.planItemId, existing);
    }
  }
  const items: GeneratedItem[] = [];
  const failures: ItemValidationFailure[] = [];
  for (const requested of request.items) {
    const candidates = generatedById.get(requested.planItemId) ?? [];
    if (candidates.length !== 1) {
      failures.push({
        planItemId: requested.planItemId,
        message: candidates.length > 1
          ? "أعاد المولد المفردة أكثر من مرة."
          : "لم يُعد المولد هذه المفردة.",
      });
      continue;
    }
    try {
      items.push(hydrateGeneratedItem(candidates[0]!, requested, request, evidenceCatalog, enrichment));
    } catch (error) {
      failures.push({ planItemId: requested.planItemId, message: errorMessage(error) });
    }
  }
  return { items, failures };
}

function validateAndHydrateGeneratedPayload(
  payload: ModelGeneratedPayload,
  request: GenerationRequest,
  evidenceCatalog: EvidenceCatalog,
  enrichment: TrustedEnrichmentContext = { segments: [], attempted: false },
): GeneratedPayload {
  if (!payload || !Array.isArray(payload.items)) throw retryableError("بنية الأسئلة المولدة غير صالحة.");
  const batch = validateGeneratedItemsIndividually(payload, request, evidenceCatalog, enrichment);
  if (batch.failures.length) {
    const first = batch.failures[0]!;
    throw retryableError(`${first.planItemId}: ${first.message}`);
  }
  if (request.generationMode === "whole_exam_v2") validateWholeExamGeneratedDiversity(batch.items);
  return { items: batch.items };
}

function wholeExamQuestionMaterial(item: GeneratedItem): string {
  const alternative = item.alternatives[0];
  return normalizeForEvidence(`${alternative?.stimulus ?? ""} ${alternative?.text ?? ""}`);
}

function validateWholeExamGeneratedDiversity(items: GeneratedItem[]): void {
  const signatures = new Set<string>();
  const numericFingerprints = new Set<string>();
  let directRecallCount = 0;
  for (const item of items) {
    const alternative = item.alternatives[0];
    if (!alternative) throw retryableError("الاختبار الكامل يحتوي مفردة بلا سؤال.");
    const material = wholeExamQuestionMaterial(item);
    const signature = material.split(/\s+/u).filter((token) => token.length >= 3).slice(0, 18).join(" ");
    if (signature && signatures.has(signature)) {
      throw retryableError("الاختبار الكامل يحتوي سؤالين متطابقين أو شبه متطابقين.");
    }
    signatures.add(signature);
    const numbers = `${alternative.stimulus} ${alternative.text}`.match(/[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?/g) ?? [];
    if (numbers.length >= 3) {
      const fingerprint = numbers.join("|");
      if (numericFingerprints.has(fingerprint)) {
        throw retryableError("الاختبار الكامل يعيد مجموعة البيانات العددية نفسها في أكثر من سؤال.");
      }
      numericFingerprints.add(fingerprint);
    }
    if (/(ما المقصود|عرف|اكتب تعريف|اذكر وحده|ما وحده قياس|حدد المصطلح)/u.test(material)) directRecallCount += 1;
  }
  if (items.length >= 5 && directRecallCount > 1) {
    throw retryableError("الاختبار الكامل يعتمد على الاستدعاء المباشر أكثر من اللازم.");
  }
  const visualSignatures = items
    .filter((item) => item.visual.type !== "none")
    .map((item) => `${item.visual.type}|${item.visual.variant}|${item.visual.role}`);
  if (visualSignatures.length >= 4 && new Set(visualSignatures).size < Math.ceil(visualSignatures.length / 2)) {
    throw retryableError("الاختبار الكامل يكرر بنية الرسم نفسها أكثر من اللازم.");
  }
}

const VISUAL_TYPES: readonly QuestionVisualType[] = ["none", "context_scene", "line_graph", "bar_chart", "pressure_diagram", "circuit_diagram", "electrostatic_diagram", "data_table", "instrument_scale", "ray_diagram", "force_diagram", "flow_diagram"];
const CIRCUIT_COMPONENTS: readonly CircuitComponent[] = ["battery", "switch_open", "switch_closed", "lamp", "resistor", "motor", "ammeter", "voltmeter"];

function emptyVisualSpec(): QuestionVisualSpec {
  return {
    type: "none",
    visualId: "",
    variant: "default",
    purpose: "",
    role: "read",
    title: "",
    altText: "",
    xAxisLabel: "",
    xAxisUnit: "",
    yAxisLabel: "",
    yAxisUnit: "",
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    points: [],
    series: [],
    labels: [],
    values: [],
    components: [],
    annotations: [],
    tableColumns: [],
    tableRows: [],
    tableCells: [],
    hiddenCells: [],
    vectors: [],
  };
}

function visualSeed(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeVisualContext(value: string): string {
  return normalizeForEvidence(value);
}

function referenceForVisual(item: GenerationItem, request: GenerationRequest): GenerationReference | undefined {
  return request.references.find((reference) => reference.id === item.sourceReferenceId);
}

function graphProfile(context: string): {
  title: string;
  xAxisLabel: string;
  xAxisUnit: string;
  yAxisLabel: string;
  yAxisUnit: string;
  xValues: number[];
  yValues: number[];
} {
  if (/(ضغط|عمق|سائل|كثاف)/u.test(context)) {
    return {
      title: "العلاقة بين العمق والضغط",
      xAxisLabel: "العمق",
      xAxisUnit: "m",
      yAxisLabel: "الضغط",
      yAxisUnit: "kPa",
      xValues: [0, 1, 2, 3, 4],
      yValues: [0, 10, 20, 30, 40],
    };
  }
  if (/(جهد|تيار|مقاوم|كهرب)/u.test(context)) {
    return {
      title: "العلاقة بين فرق الجهد وشدة التيار",
      xAxisLabel: "فرق الجهد",
      xAxisUnit: "V",
      yAxisLabel: "شدة التيار",
      yAxisUnit: "A",
      xValues: [0, 1, 2, 3, 4],
      yValues: [0, 0.5, 1, 1.5, 2],
    };
  }
  if (/(حرار|درجه|تبريد|تسخين)/u.test(context)) {
    return {
      title: "تغير درجة الحرارة مع الزمن",
      xAxisLabel: "الزمن",
      xAxisUnit: "min",
      yAxisLabel: "درجة الحرارة",
      yAxisUnit: "°C",
      xValues: [0, 1, 2, 3, 4],
      yValues: [20, 30, 42, 51, 58],
    };
  }
  if (/(سرع|مساف|حرك|زمن)/u.test(context)) {
    return {
      title: "تغير المسافة مع الزمن",
      xAxisLabel: "الزمن",
      xAxisUnit: "s",
      yAxisLabel: "المسافة",
      yAxisUnit: "m",
      xValues: [0, 1, 2, 3, 4],
      yValues: [0, 2, 4, 6, 8],
    };
  }
  return {
    title: "نتائج قياسات تجربة",
    xAxisLabel: "رقم القياس",
    xAxisUnit: "",
    yAxisLabel: "القيمة المقاسة",
    yAxisUnit: "",
    xValues: [1, 2, 3, 4, 5],
    yValues: [2, 4, 5, 7, 8],
  };
}

function inferLiquidName(context: string): string {
  if (/زيت/u.test(context)) return "الزيت";
  if (/(ماء|الماء)/u.test(context)) return "الماء";
  if (/زئبق/u.test(context)) return "الزئبق";
  return "السائل";
}

function visualRoleForItem(item: GenerationItem): QuestionVisualRole {
  if (item.styleTarget === "حسابي") return "calculate";
  if (item.styleTarget === "مقارنة") return "compare";
  if (item.styleTarget === "استقصائي") return "evaluate";
  if (item.styleTarget === "بيانات") return item.cognitiveLevel === "استدلال" ? "interpret" : "read";
  return item.cognitiveLevel === "تطبيق" ? "interpret" : "read";
}

interface ScientificTableProfile {
  columns: string[];
  rows: string[];
  cells: string[][];
  title: string;
  purpose: string;
  altText: string;
  annotations: string[];
  allowHiddenCell: boolean;
}

function scientificTableProfile(context: string, seed: number): ScientificTableProfile {
  if (/(موصل|عازل|توصيل كهرب|مرور التيار.*ماد|مواد.*تيار)/u.test(context)) {
    const materialSets = [
      [["النحاس", "يمر"], ["الألومنيوم", "يمر"], ["البلاستيك", "لا يمر"], ["الخشب الجاف", "لا يمر"]],
      [["الحديد", "يمر"], ["الجرافيت", "يمر"], ["المطاط", "لا يمر"], ["الزجاج", "لا يمر"]],
    ];
    return {
      columns: ["المادة", "نتيجة اختبار مرور التيار"],
      rows: ["1", "2", "3", "4"],
      cells: materialSets[seed % materialSets.length]!,
      title: "نتائج اختبار التوصيل الكهربائي",
      purpose: "تصنيف المواد إلى موصلات وعوازل من نتائج اختبار مرور التيار",
      altText: "جدول يعرض أسماء مواد مختلفة ونتيجة اختبار مرور التيار الكهربائي خلالها",
      annotations: ["استند إلى اسم المادة ونتيجة الاختبار عند الإجابة"],
      allowHiddenCell: false,
    };
  }
  if (/(عدد الالكترون|شحنه.*الكترون|الكترون.*شحنه|اكتسب.*الكترون|فقد.*الكترون|بالون.*شحن)/u.test(context)) {
    const electronCounts = [20, 25, 30, 40];
    const count = electronCounts[seed % electronCounts.length]!;
    const bodyCharge = Number((count * 1.6).toFixed(1));
    return {
      columns: ["الكمية", "القيمة"],
      rows: ["1", "2"],
      cells: [["شحنة الجسم", `−${bodyCharge} × 10⁻¹⁹ C`], ["شحنة الإلكترون", "−1.6 × 10⁻¹⁹ C"]],
      title: "بيانات الشحنة الكهربائية",
      purpose: "حساب عدد الإلكترونات من شحنة جسم وشحنة الإلكترون الواحد",
      altText: "جدول يعرض شحنة جسم مشحون وشحنة الإلكترون الواحد بوحدة الكولوم",
      annotations: ["عدد الإلكترونات = مقدار شحنة الجسم ÷ مقدار شحنة الإلكترون"],
      allowHiddenCell: false,
    };
  }
  if (/(زنبرك|استطاله|قانون هوك|حمل.*نابض|نابض)/u.test(context)) {
    const k = [20, 25, 40][seed % 3]!;
    const forces = [1, 2, 3, 4, 5];
    return {
      columns: ["القوة (N)", "الاستطالة (cm)"],
      rows: ["1", "2", "3", "4", "5"],
      cells: forces.map((force) => [String(force), (force * 100 / k).toFixed(1)]),
      title: "القوة واستطالة الزنبرك",
      purpose: "تحليل العلاقة بين القوة واستطالة زنبرك ضمن حد المرونة",
      altText: "جدول يعرض قوى مختلفة والاستطالة المقابلة لكل قوة في زنبرك",
      annotations: ["القوة بالنيوتن والاستطالة بالسنتيمتر"],
      allowHiddenCell: true,
    };
  }
  if (/(عزم|ارتكاز|ذراع القوه)/u.test(context)) {
    const offset = seed % 4;
    return {
      columns: ["الموقف", "القوة (N)", "المسافة العمودية عن الارتكاز (m)"],
      rows: ["أ", "ب", "ج", "د"],
      cells: [["فتح باب", String(18 + offset), "0.75"], ["مفتاح ربط", String(30 + offset * 2), "0.25"], ["أرجوحة", String(220 + offset * 10), "1.2"], ["ذراع مكبح", String(12 + offset), "0.08"]],
      title: "القوة والمسافة عن محور الدوران",
      purpose: "مقارنة عزوم قوى في مواقف حياتية مختلفة",
      altText: "جدول يعرض القوة والمسافة العمودية عن محور الدوران لأربعة مواقف",
      annotations: ["العزم = القوة × المسافة العمودية"],
      allowHiddenCell: false,
    };
  }
  if (/(تسارع|قوه دفع|كتله.*قوه|قوه.*كتله)/u.test(context)) {
    const mass = [4, 5, 8][seed % 3]!;
    const forces = [8, 12, 16, 20, 24];
    return {
      columns: ["القوة المحصلة (N)", "الكتلة (kg)"],
      rows: ["1", "2", "3", "4", "5"],
      cells: forces.map((force) => [String(force), String(mass)]),
      title: "قوة الدفع وكتلة الجسم",
      purpose: "حساب التسارع من القوة المحصلة والكتلة باستخدام قانون نيوتن الثاني",
      altText: "جدول يعرض خمس قيم للقوة المحصلة مع كتلة جسم ثابتة",
      annotations: ["التسارع = القوة المحصلة ÷ الكتلة"],
      allowHiddenCell: false,
    };
  }
  if (/(حرار|تبريد|تسخين|درجه)/u.test(context)) {
    const start = 20 + (seed % 4);
    return {
      columns: ["الزمن (min)", "درجة الحرارة (°C)"],
      rows: ["1", "2", "3", "4", "5"],
      cells: [["0", String(start)], ["1", String(start + 9)], ["2", String(start + 17)], ["3", String(start + 24)], ["4", String(start + 29)]],
      title: "تغير درجة الحرارة مع الزمن",
      purpose: "قراءة نمط تغير درجة الحرارة أثناء تجربة",
      altText: "جدول يعرض الزمن بالدقائق ودرجة الحرارة بالدرجة المئوية",
      annotations: ["قارن مقدار التغير بين القياسات"],
      allowHiddenCell: true,
    };
  }
  if (/(فرق الجهد|شده التيار|قانون اوم|مقاومه كهرب|جهد.*تيار|تيار.*جهد)/u.test(context)) {
    const resistance = [5, 10, 20][seed % 3]!;
    const voltages = [1, 2, 3, 4, 5];
    return {
      columns: ["فرق الجهد (V)", "شدة التيار (A)"],
      rows: ["1", "2", "3", "4", "5"],
      cells: voltages.map((voltage) => [voltage.toFixed(1), (voltage / resistance).toFixed(2)]),
      title: "فرق الجهد وشدة التيار",
      purpose: "تحليل العلاقة بين فرق الجهد وشدة التيار لمقاومة ثابتة",
      altText: "جدول يعرض فرق الجهد وشدة التيار المقابلة في دائرة كهربائية",
      annotations: ["الوحدات: الفولت والأمبير"],
      allowHiddenCell: true,
    };
  }
  if (/(ضغط|عمق|سائل)/u.test(context)) {
    const factor = [8, 10, 12][seed % 3]!;
    const depths = [0.5, 1, 1.5, 2, 2.5];
    return {
      columns: ["العمق (m)", "الضغط (kPa)"],
      rows: ["1", "2", "3", "4", "5"],
      cells: depths.map((depth) => [depth.toFixed(1), String(depth * factor)]),
      title: "العمق والضغط في سائل",
      purpose: "تحليل أثر العمق في ضغط السائل",
      altText: "جدول يعرض عمق نقاط مختلفة والضغط المقابل لها",
      annotations: ["العمق بالمتر والضغط بالكيلوباسكال"],
      allowHiddenCell: true,
    };
  }
  const base = 2 + (seed % 5) * 0.3;
  return {
    columns: ["رقم القياس", "القيمة المقاسة (وحدة)"],
    rows: ["1", "2", "3", "4", "5"],
    cells: Array.from({ length: 5 }, (_, index) => [String(index + 1), (base + index * 1.1).toFixed(1)]),
    title: "نتائج قياسات تجربة",
    purpose: "قراءة نمط قياسات علمية مرتبة",
    altText: "جدول يعرض خمسة قياسات علمية متتابعة مع وحدتها",
    annotations: ["استخدم القيم الظاهرة فقط"],
    allowHiddenCell: true,
  };
}

function instrumentProfile(context: string, seed: number): {
  variant: QuestionVisualVariant;
  device: string;
  unit: string;
  values: number[];
} {
  if (/(سحاحه|معايره)/u.test(context)) {
    return { variant: "burette", device: "سحاحة", unit: "cm³", values: [0, 50, 1, 18 + (seed % 12)] };
  }
  if (/(مخبار|حجم سائل|اسطوانه مدرجه)/u.test(context)) {
    return { variant: "measuring_cylinder", device: "مخبار مدرج", unit: "cm³", values: [0, 100, 10, 40 + (seed % 5) * 10] };
  }
  if (/(اميتر|فولتميتر|تيار|جهد)/u.test(context)) {
    const volt = /فولتميتر|جهد/u.test(context);
    return { variant: "meter_scale", device: volt ? "فولتميتر" : "أميتر", unit: volt ? "V" : "A", values: [0, volt ? 10 : 5, 1, volt ? 6 : 3] };
  }
  return { variant: "thermometer", device: "ميزان حرارة", unit: "°C", values: [-10, 100, 10, 20 + (seed % 6) * 10] };
}

function buildServerOwnedVisualSpec(item: GenerationItem, request: GenerationRequest): QuestionVisualSpec {
  if (item.visualTarget === "none") return emptyVisualSpec();

  const reference = referenceForVisual(item, request);
  const focusedContext = normalizeVisualContext(`${item.outcomeLabel} ${item.lessonLabel} ${SCENARIO_GUIDANCE[item.scenarioTarget]} ${STIMULUS_GUIDANCE[item.stimulusTarget]} ${SKILL_GUIDANCE[item.skillTarget]}`);
  const broadContext = normalizeVisualContext(`${request.subject} ${request.topic} ${reference?.content ?? ""}`);
  const context = `${focusedContext} ${broadContext}`.trim();
  const seed = visualSeed(`${item.planItemId}|${item.lessonLabel}|${item.outcomeLabel}|${item.visualTarget}|${item.styleTarget}`);
  const titleSuffix = "";
  const visualId = `visual-${item.planItemId}`;
  const role = visualRoleForItem(item);

  if (item.visualTarget === "context_scene") {
    const variant = item.scenarioTarget === "scientific_abstract" ? "laboratory_setup" : item.scenarioTarget;
    const sceneLabels: Record<QuestionScenarioTarget, [string, string]> = {
      scientific_abstract: ["موقف علمي", "عنصران مرتبطان"],
      door_handle: ["الباب", "المقبض"],
      playground_seesaw: ["نقطة الارتكاز", "أرجوحة التوازن"],
      wrench_tool: ["الصامولة", "مفتاح الربط"],
      bicycle_brake: ["الدراجة", "ذراع المكبح"],
      shopping_trolley: ["عربة التسوق", "قوة الدفع"],
      school_bag: ["الحقيبة المدرسية", "الحمالات"],
      water_tank: ["خزان الماء", "مخرج الماء"],
      solar_panel: ["اللوح الشمسي", "ضوء الشمس"],
      laboratory_setup: ["التجربة المدرسية", "أداة القياس"],
      road_safety: ["موقف الطريق", "عنصر السلامة"],
    };
    return {
      ...emptyVisualSpec(),
      type: "context_scene",
      visualId,
      variant,
      role: ["calculate", "complete", "draw"].includes(role) ? "interpret" : role,
      purpose: `تطبيق المفهوم العلمي في ${SCENARIO_GUIDANCE[item.scenarioTarget]}`,
      title: "موقف علمي من الحياة اليومية",
      altText: `مشهد ثنائي الأبعاد يوضح ${SCENARIO_GUIDANCE[item.scenarioTarget]}`,
      labels: sceneLabels[item.scenarioTarget],
      annotations: [SKILL_GUIDANCE[item.skillTarget]],
    };
  }

  if (item.visualTarget === "data_table") {
    const profile = scientificTableProfile(focusedContext, seed);
    const hiddenCells = profile.allowHiddenCell && (item.styleTarget === "بيانات" || item.cognitiveLevel === "استدلال")
      ? [`r${1 + (seed % Math.max(1, Math.min(3, profile.rows.length - 1)))}c${Math.max(0, profile.columns.length - 1)}`]
      : [];
    return {
      ...emptyVisualSpec(),
      type: "data_table",
      visualId,
      variant: hiddenCells.length ? "table_completion" : "table_comparison",
      role: hiddenCells.length ? "complete" : role,
      purpose: hiddenCells.length ? `${profile.purpose}، مع إكمال قيمة واحدة ناقصة` : profile.purpose,
      title: `${profile.title}${titleSuffix}`,
      altText: profile.altText,
      tableColumns: profile.columns,
      tableRows: profile.rows,
      tableCells: profile.cells,
      hiddenCells,
      annotations: profile.annotations,
    };
  }

  if (item.visualTarget === "instrument_scale") {
    const profile = instrumentProfile(focusedContext, seed);
    return {
      ...emptyVisualSpec(),
      type: "instrument_scale",
      visualId,
      variant: profile.variant,
      role: "read",
      purpose: "قراءة تدريج جهاز قياس علمي بدقة مع مراعاة الوحدة",
      title: `قراءة ${profile.device}${titleSuffix}`,
      altText: `تدريج ${profile.device} بقيمة محددة يطلب من الطالب قراءتها`,
      labels: [profile.device, profile.unit],
      values: profile.values,
      annotations: ["حدد قيمة أصغر تدريج قبل تسجيل القراءة"],
    };
  }

  if (item.visualTarget === "ray_diagram") {
    const variant: QuestionVisualVariant = /منشور/u.test(focusedContext)
      ? "prism"
      : /عدسه/u.test(focusedContext)
        ? "converging_lens"
        : /انكسار/u.test(focusedContext)
          ? "refraction"
          : "reflection";
    return {
      ...emptyVisualSpec(),
      type: "ray_diagram",
      visualId,
      variant,
      role: item.styleTarget === "استقصائي" ? "draw" : role,
      purpose: variant === "reflection" ? "قراءة أو إكمال مسار شعاع منعكس" : variant === "refraction" ? "قراءة أو إكمال مسار شعاع منكسر" : "تتبع مسار الضوء خلال عنصر بصري",
      title: `مخطط أشعة ضوئية${titleSuffix}`,
      altText: "مخطط بصريات خطي يوضح شعاعًا وعنصرًا بصريًا ومحورًا أو عمودًا مقامًا",
      labels: [variant],
      values: [35 + (seed % 20), 20 + (seed % 15)],
      annotations: ["اتجاه انتشار الضوء"],
    };
  }

  if (item.visualTarget === "force_diagram") {
    const variant: QuestionVisualVariant = /عزم|ارتكاز/u.test(focusedContext)
      ? "moments"
      : item.styleTarget === "مقارنة"
        ? "balanced_forces"
        : "free_body";
    const momentDistance1 = Number((1.0 + (seed % 3) * 0.25).toFixed(2));
    const momentDistance2 = Number((1.5 + (seed % 3) * 0.25).toFixed(2));
    const momentForce1 = 120 + (seed % 4) * 20;
    const momentForce2 = 80 + (seed % 3) * 20;
    const vectors: QuestionVisualVector[] = variant === "moments"
      ? [
        { label: "قوة 1", x: -130, y: 40, dx: 0, dy: -85, magnitude: momentForce1 },
        { label: "قوة 2", x: 130, y: 40, dx: 0, dy: -65, magnitude: momentForce2 },
      ]
      : [
        { label: "الوزن", x: 0, y: 10, dx: 0, dy: 90, magnitude: 10 },
        { label: "رد الفعل", x: 0, y: -10, dx: 0, dy: -90, magnitude: 10 },
        { label: "القوة المؤثرة", x: 55, y: 0, dx: 90, dy: 0, magnitude: 8 },
        { label: "الاحتكاك", x: -55, y: 0, dx: -70, dy: 0, magnitude: variant === "balanced_forces" ? 8 : 6 },
      ];
    return {
      ...emptyVisualSpec(),
      type: "force_diagram",
      visualId,
      variant,
      role: variant === "moments" ? "calculate" : role,
      purpose: variant === "moments" ? "حساب ومقارنة عزوم قوتين حول نقطة ارتكاز" : "تحليل اتجاهات القوى ومقاديرها على جسم",
      title: variant === "moments" ? `قوتان حول نقطة ارتكاز${titleSuffix}` : `مخطط قوى${titleSuffix}`,
      altText: variant === "moments"
        ? "عارضة حول نقطة ارتكاز تظهر عليها قوتان مع مقدار كل قوة والمسافة العمودية عن محور الدوران"
        : "جسم تظهر عليه أسهم قوى مسماة في اتجاهات مختلفة",
      labels: ["الجسم"],
      vectors,
      values: variant === "moments" ? [momentDistance1, momentDistance2] : [],
      annotations: variant === "moments"
        ? [`بعد القوة 1 عن الارتكاز = ${momentDistance1} m`, `بعد القوة 2 عن الارتكاز = ${momentDistance2} m`]
        : ["اتجاه السهم يبين اتجاه القوة"],
    };
  }

  if (item.visualTarget === "flow_diagram") {
    const stateChange = /(انصهار|تجمد|تبخر|تكثف|حالات الماده|تحول حاله)/u.test(focusedContext);
    const energy = /(طاقه|تحول الطاقه)/u.test(focusedContext);
    const labels = stateChange
      ? ["صلب", "سائل", "غاز"]
      : energy
        ? ["طاقة مخزنة", "تحويل الطاقة", "طاقة مفيدة", "طاقة مهدرة"]
        : ["المرحلة الأولى", "المرحلة الثانية", "المرحلة الثالثة", "النتيجة"];
    return {
      ...emptyVisualSpec(),
      type: "flow_diagram",
      visualId,
      variant: stateChange ? "state_change" : item.styleTarget === "مقارنة" ? "cycle_flow" : "linear_flow",
      role: item.cognitiveLevel === "استدلال" ? "interpret" : "complete",
      purpose: "تتبع مراحل عملية علمية أو إكمال تسلسلها",
      title: `مخطط عملية علمية${titleSuffix}`,
      altText: "مخطط صناديق وأسهم يوضح مراحل عملية علمية مترابطة",
      labels,
      annotations: stateChange ? ["انصهار", "تبخر"] : ["ثم", "ثم", "ينتج"],
    };
  }

  if (item.visualTarget === "pressure_diagram") {
    const liquid = inferLiquidName(context);
    const liquidLevel = 0.68 + ((seed % 9) / 100);
    const base = {
      ...emptyVisualSpec(),
      type: "pressure_diagram" as const,
      visualId,
      role,
      labels: [liquid, "الجسم"],
    };
    if (item.styleTarget === "حسابي") {
      return {
        ...base,
        variant: "force_area",
        purpose: "تمثيل القوة العمودية ومساحة التلامس في علاقة الضغط",
        title: `القوة والمساحة في حساب الضغط${titleSuffix}`,
        altText: "جسم يؤثر بقوة عمودية على سطح ذي مساحة تلامس محددة",
        values: [80 + (seed % 5) * 10, Number((0.02 + (seed % 3) * 0.01).toFixed(2))],
        annotations: ["القوة F", "المساحة A"],
      };
    }
    if (item.styleTarget === "مقارنة" || item.cognitiveLevel === "استدلال") {
      const firstDepth = 0.28 + ((seed % 9) / 100);
      return {
        ...base,
        variant: "depth_comparison",
        purpose: "مقارنة الضغط عند عمقين مختلفين داخل السائل",
        title: `مقارنة الضغط عند عمقين${titleSuffix}`,
        altText: `جسمان داخل ${liquid} عند عمقين مختلفين أسفل السطح`,
        values: [liquidLevel, firstDepth, Math.min(0.84, firstDepth + 0.34)],
        annotations: ["العمق h₁", "العمق h₂"],
      };
    }
    if (seed % 3 === 0) {
      return {
        ...base,
        variant: "liquid_column",
        purpose: "ربط ارتفاع عمود السائل بالضغط عند قاعدته",
        title: `عمود سائل وقياس الضغط${titleSuffix}`,
        altText: `عمود من ${liquid} متصل بمقياس ضغط عند القاعدة`,
        values: [liquidLevel, 0.5],
        annotations: ["ارتفاع العمود h", "مقياس الضغط P"],
      };
    }
    const objectDepth = 0.38 + ((seed % 19) / 100);
    return {
      ...base,
      variant: "submerged_object",
      purpose: "تحديد عمق جسم مغمور أسفل سطح السائل",
      title: `جسم مغمور داخل ${liquid}${titleSuffix}`,
      altText: `وعاء يحتوي ${liquid} وجسمًا عند عمق محدد أسفل السطح`,
      values: [liquidLevel, Math.min(0.68, objectDepth)],
      annotations: ["سطح السائل", "العمق h"],
    };
  }

  if (item.visualTarget === "circuit_diagram") {
    const measurement = item.styleTarget === "بيانات" || item.styleTarget === "استقصائي" || item.cognitiveLevel === "استدلال";
    const components: CircuitComponent[] = ["battery", seed % 2 === 0 ? "switch_closed" : "switch_open"];
    components.push(/محرك|عربه كهربائي|دراجه كهربائي/u.test(focusedContext) ? "motor" : /مقاوم/u.test(focusedContext) ? "resistor" : "lamp");
    if (measurement) components.push("ammeter");
    return {
      ...emptyVisualSpec(),
      type: "circuit_diagram",
      visualId,
      role,
      variant: measurement ? "measurement_circuit" : "series_circuit",
      purpose: measurement ? "قراءة أو تحليل دائرة كهربائية مزودة بجهاز قياس" : "تحديد مكونات ومسار دائرة كهربائية بسيطة",
      title: `${measurement ? "دائرة قياس كهربائية" : "دائرة كهربائية بسيطة"}${titleSuffix}`,
      altText: measurement
        ? `دائرة كهربائية تحتوي بطارية ومفتاحًا و${components.includes("motor") ? "محرك" : components.includes("resistor") ? "مقاومة" : "مصباح"} وأميترًا`
        : `دائرة كهربائية تحتوي بطارية ومفتاحًا و${components.includes("motor") ? "محرك" : components.includes("resistor") ? "مقاومة" : "مصباح"}`,
      components,
      annotations: components.map((component) => ({
        battery: "بطارية",
        switch_open: "مفتاح مفتوح",
        switch_closed: "مفتاح مغلق",
        lamp: "مصباح",
        resistor: "مقاومة",
        motor: "محرك",
        ammeter: "أميتر",
        voltmeter: "فولتميتر",
      } as Record<CircuitComponent, string>)[component]),
    };
  }

  if (item.visualTarget === "electrostatic_diagram") {
    const variant: QuestionVisualVariant = item.styleTarget === "مقارنة" || item.skillTarget === "compare" || /تجاذب|تنافر|شحنات متماثله|شحنات مختلفه/u.test(focusedContext)
      ? "attraction_repulsion"
      : item.styleTarget === "استقصائي" || item.skillTarget === "investigate" || /دلك|قماش|مسطره/u.test(focusedContext)
        ? "charge_transfer"
        : "electric_field";
    if (variant === "charge_transfer") {
      return {
        ...emptyVisualSpec(),
        type: "electrostatic_diagram",
        visualId,
        role,
        variant,
        purpose: "تمثيل شحن جسم بالدلك وانجذاب قصاصات ورقية خفيفة",
        title: `شحن جسم بالدلك${titleSuffix}`,
        altText: "مسطرة بلاستيكية تُدلك بقطعة قماش ثم تقرّب من قصاصات ورق خفيفة دون إظهار نوع الشحنة",
        labels: ["المسطرة البلاستيكية", "قطعة القماش"],
        values: [seed % 2],
        annotations: ["الدلك", "قصاصات ورق"],
      };
    }
    if (variant === "attraction_repulsion") {
      const unlike = seed % 2;
      return {
        ...emptyVisualSpec(),
        type: "electrostatic_diagram",
        visualId,
        role,
        variant,
        purpose: "مقارنة اتجاه القوة بين جسمين مشحونين",
        title: `تفاعل جسمين مشحونين${titleSuffix}`,
        altText: unlike ? "كرتان مشحونتان بشحنتين مختلفتين" : "كرتان مشحونتان بشحنتين متماثلتين",
        labels: ["الجسم س", "الجسم ص"],
        values: [unlike],
        annotations: [unlike ? "تجاذب" : "تنافر"],
      };
    }
    return {
      ...emptyVisualSpec(),
      type: "electrostatic_diagram",
      visualId,
      role,
      variant: "electric_field",
      purpose: "قراءة اتجاه خطوط المجال الكهربائي بين شحنتين",
      title: `خطوط المجال الكهربائي${titleSuffix}`,
      altText: "خطوط مجال كهربائي بين شحنة موجبة وأخرى سالبة",
      labels: ["الشحنة الموجبة", "الشحنة السالبة"],
      values: [1, -1],
      annotations: ["اتجاه المجال من الموجب إلى السالب"],
    };
  }

  const profile = graphProfile(context);
  const scale = 1 + ((seed % 3) * 0.25);
  const xValues = profile.xValues.map((value) => Number((value * scale).toFixed(2)));
  const yValues = profile.yValues.map((value, index) => Number((value * scale + (index > 0 ? seed % 2 : 0)).toFixed(2)));
  if (item.visualTarget === "line_graph") {
    const points = xValues.map((x, index) => ({ x, y: yValues[index] ?? 0, label: "" }));
    const xMax = Math.max(...xValues);
    const yMax = Math.max(...yValues);
    return {
      ...emptyVisualSpec(),
      type: "line_graph",
      visualId,
      role,
      variant: item.styleTarget === "مقارنة" ? "multi_series" : "trend",
      purpose: "قراءة اتجاه العلاقة بين متغيرين علميين",
      title: `${profile.title}${titleSuffix}`,
      altText: `رسم بياني خطي يوضح ${profile.title}`,
      xAxisLabel: profile.xAxisLabel,
      xAxisUnit: profile.xAxisUnit,
      yAxisLabel: profile.yAxisLabel,
      yAxisUnit: profile.yAxisUnit,
      xMin: Math.min(0, ...xValues),
      xMax: xMax > 0 ? xMax : 1,
      yMin: Math.min(0, ...yValues),
      yMax: yMax > 0 ? yMax : 1,
      points,
      series: item.styleTarget === "مقارنة"
        ? [
          { label: "الحالة أ", points },
          { label: "الحالة ب", points: points.map((point, index) => ({ ...point, y: Number((point.y * 0.72 + index * 0.35).toFixed(2)) })) },
        ]
        : [],
      annotations: ["بيانات تجربة معطاة في السؤال"],
    };
  }

  const barValues = yValues.slice(1, 5);
  const yMax = Math.max(...barValues);
  return {
    ...emptyVisualSpec(),
    type: "bar_chart",
    visualId,
    role,
    variant: "comparison",
    purpose: "مقارنة نتائج قياس بين أربع حالات",
    title: `مقارنة نتائج القياس${titleSuffix}`,
    altText: "رسم أعمدة يقارن أربع نتائج قياس مستقلة",
    yAxisLabel: profile.yAxisLabel,
    yAxisUnit: profile.yAxisUnit,
    yMin: 0,
    yMax: yMax > 0 ? Math.ceil(yMax * 1.2) : 10,
    labels: ["الحالة أ", "الحالة ب", "الحالة ج", "الحالة د"],
    values: barValues,
    annotations: ["بيانات تجربة معطاة في السؤال"],
  };
}

function generationThinkingBudget(items: GenerationItem[]): number {
  const heavy = items.some((item) => item.questionType === "إجابة طويلة" || item.cognitiveLevel === "استدلال" || item.marks >= 3);
  return heavy ? 768 : 0;
}

function generationOutputTokenLimit(items: GenerationItem[], wholeExam = false): number {
  const markTotal = items.reduce((sum, item) => sum + item.marks, 0);
  if (wholeExam) return Math.min(8_192, Math.max(4_200, 2_400 + (items.length * 620) + (markTotal * 260)));
  return Math.min(5_200, Math.max(2_400, 1_900 + (items.length * 450) + (markTotal * 350)));
}

function normalizeModelMarkScheme(value: unknown, marks: number): string[] {
  if (Array.isArray(value)) {
    const points = value.map((point) => typeof point === "string" ? point.trim() : "");
    if (points.length !== marks || points.some((point) => !point)) {
      throw retryableError("نموذج التصحيح لا يوزع نقطة مستقلة لكل درجة.");
    }
    return points;
  }

  const record = asRecord(value);
  if (!record) throw retryableError("نموذج التصحيح لا يطابق البنية المطلوبة.");
  const slots = ["point1", "point2", "point3", "point4"].map((key) =>
    typeof record[key] === "string" ? record[key].trim() : ""
  );
  const requiredPoints = slots.slice(0, marks);
  if (requiredPoints.length !== marks || requiredPoints.some((point) => !point)) {
    throw retryableError("نموذج التصحيح لا يوزع نقطة مستقلة لكل درجة.");
  }
  return requiredPoints;
}

function hasSufficientQuestionContext(
  stimulus: string,
  text: string,
  questionForm: QuestionDesignPattern,
  visualTarget: QuestionVisualType,
): boolean {
  if (!["سياقي", "حسابي", "بيانات", "استقصائي"].includes(questionForm)) return true;
  if (stimulus.trim().length >= 12) return true;

  const normalized = normalizeForEvidence(text);
  const referencesVisual = /(الشكل|الصوره|الرسم|مخطط|المخطط|الدائره|الجدول|البيانات الممثله|التمثيل|التدريج|المشهد)/u.test(normalized);
  if (visualTarget !== "none" && referencesVisual) return true;

  const digitCount = (text.match(/[0-9٠-٩]/g) ?? []).length;
  if (questionForm === "حسابي") {
    return digitCount >= 2
      && /(احسب|اوجد|حدد)/u.test(normalized)
      && /(نيوتن|باسكال|متر|سم|ملم|ثانيه|دقيقه|فولت|امبير|اوم|جول|واط|كجم|جرام|درجه)/u.test(normalized);
  }
  if (questionForm === "بيانات") {
    return digitCount >= 2 || /(جدول|بيانات|نتائج|قيم|قراءه|قياسات)/u.test(normalized);
  }
  if (questionForm === "استقصائي") {
    return normalized.length >= 38
      && /(تجرب|متغير|قياس|اداه|خطوات|نتائج|دقه|موثوقيه|تحكم|ثابت)/u.test(normalized);
  }
  return normalized.length >= 42
    && /(عندما|اثناء|لاحظ|قام|استخدم|وضع|تعرض|في موقف|لدى|يمر|يعمل)/u.test(normalized);
}

const CALCULATION_NUMBER_PATTERN = /[+-]?[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?(?:\s*[×xX]\s*10\s*(?:\^|⁻|-)??\s*[0-9٠-٩]+)?/gu;
const CALCULATION_UNIT_PATTERN = /(?:N\s*m|N\s*\/\s*m|kg|g|mg|km|cm|mm|m(?:²|2|³|3)?|s|min|h|V|A|mA|C|Pa|kPa|J|W|Hz|°C|%|نيوتن|كيلوجرام|كجم|جرام|متر|سنتيمتر|مليمتر|ثانيه|دقيقه|ساعه|فولت|امبير|مللي\s*امبير|كولوم|باسكال|جول|واط|هرتز|درجه\s*مئويه)/iu;

function fixedVisualContainsCalculationData(visual: QuestionVisualSpec): boolean {
  if (visual.type === "force_diagram" && visual.role === "calculate") {
    return visual.vectors.length >= 2 && visual.vectors.every((vector) => vector.magnitude > 0);
  }
  if (visual.type === "pressure_diagram" && visual.variant === "force_area" && visual.role === "calculate") {
    return visual.values.length >= 2 && visual.values[0] > 0 && visual.values[1] > 0;
  }
  if (visual.type === "data_table" && visual.role === "calculate") {
    const visibleCells = visual.tableCells.flatMap((row, rowIndex) => row.map((_, columnIndex) => visibleTableCell(visual, rowIndex, columnIndex)));
    const numericValues = visibleCells.flatMap((cell) => cell.match(/[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?/gu) ?? []);
    const unitMaterial = `${visual.tableColumns.join(" ")} ${visibleCells.join(" ")}`;
    return numericValues.length >= 2 && CALCULATION_UNIT_PATTERN.test(unitMaterial);
  }
  return true;
}


function calculationVisualMaterial(visual: QuestionVisualSpec): string {
  const visibleCells = visual.tableCells.flatMap((row, rowIndex) => row.map((_, columnIndex) => visibleTableCell(visual, rowIndex, columnIndex)));
  return [
    visual.title,
    visual.purpose,
    visual.altText,
    visual.xAxisLabel,
    visual.yAxisLabel,
    ...visual.labels,
    ...visual.annotations,
    ...visual.tableColumns,
    ...visibleCells,
    ...visual.values.map((value) => String(value)),
    ...visual.vectors.flatMap((vector) => [vector.label, `${vector.magnitude} N`]),
  ].join(" ");
}

function calculationPromptContainsRequiredData(
  alternative: ModelGeneratedAlternative,
  visual: QuestionVisualSpec,
): boolean {
  const questionMaterial = `${alternative.stimulus} ${alternative.text}`;
  const visualMaterial = calculationVisualMaterial(visual);
  const combined = `${questionMaterial} ${visualMaterial}`;
  const numericValues = combined.match(CALCULATION_NUMBER_PATTERN) ?? [];
  if (numericValues.length < 2) return false;

  if (visual.type === "force_diagram" && visual.role === "calculate") {
    const hasForce = /(?:N|نيوتن)/iu.test(combined);
    if (visual.variant === "moments") {
      const hasDistance = /(?:km|cm|mm|m|متر|سنتيمتر|مليمتر)/iu.test(questionMaterial);
      return hasForce && hasDistance && numericValues.length >= 3;
    }
    return hasForce && visual.vectors.filter((vector) => vector.magnitude > 0).length >= 2;
  }

  if (visual.type === "pressure_diagram" && visual.variant === "force_area" && visual.role === "calculate") {
    const hasForce = /(?:N|نيوتن)/iu.test(combined);
    const hasArea = /(?:m(?:²|2)|cm(?:²|2)|متر\s*مربع|سنتيمتر\s*مربع)/iu.test(combined);
    return hasForce && hasArea;
  }

  if (visual.type === "data_table" && visual.role === "calculate") {
    const dimensionlessCount = /(عدد\s*(?:الالكترونات|الإلكترونات|الجسيمات)|نسبه|نسبة|معدل)/u.test(combined);
    return CALCULATION_UNIT_PATTERN.test(combined) || dimensionlessCount;
  }

  return CALCULATION_UNIT_PATTERN.test(combined)
    || /(عدد\s*(?:الالكترونات|الإلكترونات|الجسيمات)|نسبه|نسبة|معدل)/u.test(combined);
}

const VISUAL_SEMANTIC_STOP_WORDS = new Set([
  "الشكل", "الرسم", "المخطط", "الجدول", "المشهد", "المرفق", "المرفقه", "بيانات", "قيم", "قيمه",
  "قياس", "رقم", "الحاله", "استخدم", "بالاستعانه", "اعتمادا", "اجب", "السوال", "النتيجه", "علمي", "علميه",
  "وحده", "الوحدات", "عنصر", "عناصر", "يوضح", "يعرض", "اقرا", "قراءه",
]);

function semanticTokens(value: string): Set<string> {
  return new Set(normalizeForEvidence(value)
    .split(/\s+/u)
    .map(canonicalEvidenceToken)
    .filter((token) => token.length >= 3 && !VISUAL_SEMANTIC_STOP_WORDS.has(token) && !/^\d+(?:[.,]\d+)?$/u.test(token)));
}

function semanticOverlap(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

function visualSemanticCorpus(visual: QuestionVisualSpec): string {
  const componentNames: Record<CircuitComponent, string> = {
    battery: "بطارية",
    switch_open: "مفتاح مفتوح",
    switch_closed: "مفتاح مغلق",
    lamp: "مصباح",
    resistor: "مقاومة",
    motor: "محرك",
    ammeter: "أميتر شدة التيار",
    voltmeter: "فولتميتر فرق الجهد",
  };
  return [
    visual.title,
    visual.purpose,
    visual.altText,
    visual.xAxisLabel,
    visual.yAxisLabel,
    ...visual.labels,
    ...visual.annotations,
    ...visual.tableColumns,
    ...visual.tableRows,
    ...visual.tableCells.flat(),
    ...visual.vectors.map((vector) => vector.label),
    ...visual.components.map((component) => componentNames[component]),
  ].join(" ");
}

function visibleTableCell(visual: QuestionVisualSpec, rowIndex: number, columnIndex: number): string {
  return visual.hiddenCells.includes(`r${rowIndex}c${columnIndex}`) ? "" : (visual.tableCells[rowIndex]?.[columnIndex] ?? "");
}

function validateTableRowReferences(material: string, visual: QuestionVisualSpec): void {
  const normalized = normalizeForEvidence(material);
  const ordinalMap: Array<[RegExp, number]> = [
    [/(?:القياس|الصف|الحاله)\s+(?:السادس|سادس)/u, 6],
    [/(?:القياس|الصف|الحاله)\s+(?:السابع|سابع)/u, 7],
    [/(?:القياس|الصف|الحاله)\s+(?:الثامن|ثامن)/u, 8],
  ];
  for (const [pattern, index] of ordinalMap) {
    if (pattern.test(normalized) && index > visual.tableRows.length) {
      throw retryableError(`السؤال يشير إلى صف أو قياس رقم ${index} غير موجود في الجدول المرفق.`);
    }
  }
}

function validateNoTableDataDump(alternative: ModelGeneratedAlternative, visual: QuestionVisualSpec): void {
  const questionText = `${alternative.stimulus} ${alternative.text}`;
  const visibleValues = new Set(
    visual.tableCells.flatMap((row, rowIndex) => row.flatMap((cell, columnIndex) => {
      const value = visibleTableCell(visual, rowIndex, columnIndex);
      return value.match(/[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?/gu) ?? [];
    })).filter((value) => !["0", "1", "2", "3", "4", "5"].includes(value)),
  );
  const repeated = [...visibleValues].filter((value) => questionText.includes(value));
  if (repeated.length >= 4) {
    throw retryableError("نص السؤال يكرر سلسلة طويلة من قيم الجدول؛ اذكر الجدول فقط واترك البيانات داخله دون نسخها إلى السؤال.");
  }
}

function validateTableScientificContract(material: string, visual: QuestionVisualSpec): void {
  const question = normalizeForEvidence(material);
  const table = normalizeForEvidence(`${visual.title} ${visual.purpose} ${visual.tableColumns.join(" ")} ${visual.annotations.join(" ")}`);
  const requires = (pattern: RegExp, tablePattern: RegExp, message: string) => {
    if (pattern.test(question) && !tablePattern.test(table)) throw retryableError(message);
  };
  requires(/عزم|ارتكاز|دوران/u, /عزم|مسافه|ارتكاز|ذراع/u, "سؤال العزم يحتاج جدولًا يتضمن القوة والمسافة عن محور الدوران.");
  requires(/تسارع|قانون نيوتن الثاني/u, /قوه.*كتله|كتله.*قوه|تسارع/u, "سؤال التسارع يحتاج بيانات القوة المحصلة والكتلة.");
  requires(/موصل|عازل|مرور التيار/u, /ماده|موصل|عازل|مرور التيار/u, "سؤال الموصلات يحتاج جدولًا يعرض موادًا ونتيجة اختبار التوصيل.");
  requires(/عدد الالكترون|عدد الإلكترون|اكتسب.*الكترون|فقد.*الكترون/u, /شحنه.*الكترون|الكترون.*شحنه/u, "سؤال عدد الإلكترونات يحتاج بيانات شحنة الجسم وشحنة الإلكترون.");
  requires(/قانون هوك|استطاله|زنبرك|نابض/u, /قوه.*استطاله|استطاله.*قوه/u, "سؤال قانون هوك يحتاج جدول القوة والاستطالة بوحداتهما.");
}

function validateDataTableSemanticBinding(
  alternative: ModelGeneratedAlternative,
  markScheme: string[],
  visual: QuestionVisualSpec,
): void {
  const material = `${alternative.stimulus} ${alternative.text} ${alternative.answer} ${alternative.rationale} ${markScheme.join(" ")}`;
  validateTableRowReferences(material, visual);
  validateNoTableDataDump(alternative, visual);
  validateTableScientificContract(material, visual);
  const materialTokens = semanticTokens(material);
  const tableCore = [visual.title, visual.purpose, ...visual.tableColumns, ...visual.tableCells.flat()].join(" ");
  const tableTokens = semanticTokens(tableCore);
  const overlap = semanticOverlap(materialTokens, tableTokens);
  const visibleNumbers = visual.tableCells.flatMap((row, rowIndex) => row.flatMap((cell, columnIndex) => {
    const value = visibleTableCell(visual, rowIndex, columnIndex);
    return value.match(/[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?/gu) ?? [];
  }));
  const materialNumbers = new Set(material.match(/[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?/gu) ?? []);
  const numericOverlap = visibleNumbers.some((number) => materialNumbers.has(number));
  if (overlap < 1 && !numericOverlap) {
    throw retryableError("السؤال لا يستخدم معنى أعمدة الجدول أو بياناته؛ أعد بناء السؤال والإجابة مباشرة من الجدول المرفق.");
  }
  if (visual.hiddenCells.length) {
    const [hiddenKey] = visual.hiddenCells;
    const match = /^r(\d+)c(\d+)$/u.exec(hiddenKey ?? "");
    if (match) {
      const expected = visual.tableCells[Number(match[1])]?.[Number(match[2])] ?? "";
      const asksToComplete = /(اكمل|أكمل|احسب|اوجد|أوجد|توقع|استنتج|حدد القيمه الناقصه)/u.test(normalizeForEvidence(`${alternative.stimulus} ${alternative.text}`));
      if (!asksToComplete || (expected && !normalizeForEvidence(`${alternative.answer} ${markScheme.join(" ")}`).includes(normalizeForEvidence(expected)))) {
        throw retryableError("الجدول يحتوي خلية ناقصة لكن السؤال أو نموذج التصحيح لا يطلب إكمالها بالقيمة الصحيحة.");
      }
    }
  }
}

function validateVisualSemanticBinding(
  alternative: ModelGeneratedAlternative,
  markScheme: string[],
  visual: QuestionVisualSpec,
): void {
  if (visual.type === "none") return;
  if (visual.type === "data_table") {
    validateDataTableSemanticBinding(alternative, markScheme, visual);
    return;
  }
  const material = `${alternative.stimulus} ${alternative.text} ${alternative.answer} ${alternative.rationale} ${markScheme.join(" ")}`;
  const overlap = semanticOverlap(semanticTokens(material), semanticTokens(visualSemanticCorpus(visual)));
  if (visual.type === "circuit_diagram") {
    if (overlap < 1) throw retryableError("السؤال أو الإجابة لا يتعاملان مع أي مكوّن ظاهر في مخطط الدائرة المرفق.");
    return;
  }
  if (["line_graph", "bar_chart", "instrument_scale"].includes(visual.type)) {
    if (overlap < 1) throw retryableError("السؤال لا يستخدم المتغير أو الوحدة أو القراءة الظاهرة في المثير البصري المرفق.");
    return;
  }
  if (["context_scene", "electrostatic_diagram", "pressure_diagram", "ray_diagram", "force_diagram", "flow_diagram"].includes(visual.type) && overlap < 1) {
    throw retryableError("السؤال لا يرتبط دلاليًا بعناصر الرسم المرفق؛ أعد صياغته من محتوى الرسم نفسه.");
  }
}

function sanitizeScenarioContract(value: unknown): ModelGeneratedScenarioContract {
  const record = asRecord(value);
  if (!record) throw retryableError("السؤال لا يحتوي عقد السياق المنظم المطلوب.");
  const target = requireEnum(record.target, ["scientific_abstract", "door_handle", "playground_seesaw", "wrench_tool", "bicycle_brake", "shopping_trolley", "school_bag", "water_tank", "solar_panel", "laboratory_setup", "road_safety"] as const, "سياق السؤال المنظم غير صالح.");
  const evidencePhrases = Array.isArray(record.evidencePhrases)
    ? record.evidencePhrases
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => sanitizeGeneratedDisplayText(entry).trim())
      .filter(Boolean)
      .slice(0, 4)
    : [];
  const scientificLink = typeof record.scientificLink === "string"
    ? sanitizeGeneratedDisplayText(record.scientificLink).trim()
    : "";
  return {
    target,
    evidencePhrases,
    scientificLink,
    contextIsEssential: record.contextIsEssential === true,
  };
}

function normalizedContainsPhrase(material: string, phrase: string): boolean {
  const normalizedPhrase = normalizeForEvidence(phrase);
  if (normalizedPhrase.length < 4) return false;
  return normalizeForEvidence(material).includes(normalizedPhrase);
}

function validateStructuredScenarioContract(
  alternative: ModelGeneratedAlternative,
  scenarioTarget: QuestionScenarioTarget,
  stimulusTarget: QuestionStimulusTarget,
  skillTarget: QuestionSkillTarget,
  outcomeLabel: string,
  fixedVisual: QuestionVisualSpec,
): void {
  const contract = alternative.scenarioContract;
  if (!contract || contract.target !== scenarioTarget) {
    throw retryableError("عقد السياق لا يطابق السياق المخصص لهذه المفردة.");
  }
  const requiresContext = scenarioTarget !== "scientific_abstract"
    || ["real_life_scene", "decision_case"].includes(stimulusTarget);
  if (!requiresContext) return;
  if (!contract.contextIsEssential) {
    throw retryableError("عقد السياق يصرح بأن الموقف زخرفي وليس جزءًا من التفكير المطلوب.");
  }
  if (contract.evidencePhrases.length < 2) {
    throw retryableError("عقد السياق لا يقدم عبارتين فعليتين من متن السؤال تثبتان الموقف الحياتي.");
  }
  const material = `${alternative.stimulus} ${alternative.text}`;
  if (contract.evidencePhrases.some((phrase) => !normalizedContainsPhrase(material, phrase))) {
    throw retryableError("عقد السياق يستشهد بعبارة غير موجودة حرفيًا في متن السؤال.");
  }
  const expectedCorpus = [
    SCENARIO_GUIDANCE[scenarioTarget],
    outcomeLabel,
    SKILL_GUIDANCE[skillTarget],
    fixedVisual.purpose,
    fixedVisual.title,
    fixedVisual.altText,
    fixedVisual.labels.join(" "),
  ].join(" ");
  const evidenceCorpus = `${contract.evidencePhrases.join(" ")} ${contract.scientificLink}`;
  const scenarioOverlap = Math.max(
    semanticOverlap(semanticTokens(evidenceCorpus), semanticTokens(expectedCorpus)),
    semanticOverlap(semanticTokens(material), semanticTokens(expectedCorpus)),
  );
  if (scenarioOverlap < 1) {
    throw retryableError("عقد السياق لا يثبت علاقة دلالية بالسياق وهدف التعلم المخصصين للمفردة.");
  }
  const scientificLinkOverlap = semanticOverlap(
    semanticTokens(contract.scientificLink),
    semanticTokens(`${outcomeLabel} ${material} ${SKILL_GUIDANCE[skillTarget]}`),
  );
  if (contract.scientificLink.length < 12 || scientificLinkOverlap < 1) {
    throw retryableError("الرابط العلمي في عقد السياق غير كافٍ لشرح دور الموقف في قياس هدف التعلم.");
  }
}

function validateAssessmentQuality(
  alternative: ModelGeneratedAlternative,
  scenarioTarget: QuestionScenarioTarget,
  stimulusTarget: QuestionStimulusTarget,
  skillTarget: QuestionSkillTarget,
  diversityKey: string,
): void {
  if (!diversityKey || diversityKey.startsWith("legacy:")) return;
  const material = normalizeForEvidence(`${alternative.stimulus} ${alternative.text}`);
  const directRecall = /(ما المقصود|عرف|اكتب تعريف|اذكر وحده|ما وحده قياس|حدد المصطلح)/u.test(material);
  if (skillTarget !== "recognize" && directRecall) {
    throw retryableError("السؤال يعيد استدعاء تعريف أو وحدة بدل قياس المهارة التقويمية المحددة.");
  }
  if (["real_life_scene", "decision_case"].includes(stimulusTarget)) {
    if (`${alternative.stimulus} ${alternative.text}`.trim().length < 48) {
      throw retryableError("الموقف الحياتي قصير أو شكلي ولا يقدم سياقًا كافيًا للتفكير.");
    }
  }
  if (stimulusTarget === "experiment" && !/(تجرب|متغير|قياس|اداه|خطوه|نتيج|ضبط|موثوق)/u.test(material)) {
    throw retryableError("السؤال الاستقصائي لا يتضمن تجربة أو قياسًا أو متغيرًا واضحًا.");
  }
  if (skillTarget === "compare" && !/(قارن|مقارنه|فرق|تشابه|ايهما|أيهما)/u.test(material)) {
    throw retryableError("السؤال لا يطلب مقارنة واضحة رغم أن الخطة تستهدف المقارنة.");
  }
  if (skillTarget === "evaluate" && !/(قيم|قيّم|برر|اقترح|حكم|ناقش|فسر|فسّر)/u.test(material)) {
    throw retryableError("السؤال لا يطلب تقييمًا أو تبريرًا مناسبًا لمستوى الاستدلال.");
  }
  const usesMomentConcept = /(عزم|دوران)/u.test(material);
  const momentScenario = ["door_handle", "wrench_tool", "bicycle_brake", "shopping_trolley", "playground_seesaw"].includes(scenarioTarget);
  if (usesMomentConcept && momentScenario
    && !/(محور|ارتكاز|مقبض|ذراع|المسافه|المسافة|البعد|نقطه تاثير|نقطة تأثير|عجلات|دواسه|دواسة)/u.test(material)) {
    throw retryableError("سؤال العزم في الموقف الحياتي لا يحدد محور الدوران أو ذراع القوة أو موضع تأثيرها بصورة تسمح بتبرير الإجابة علميًا.");
  }
  if (skillTarget === "investigate" && !/(تجرب|متغير|قياس|تحكم|ثابت|موثوق|دقه|دقة|خطوات)/u.test(material)) {
    throw retryableError("السؤال لا يقيس مهارة استقصائية كما تحددها الخطة.");
  }
}

function alternativeTokenSet(alternative: GeneratedAlternative): Set<string> {
  const stop = new Set(["في", "من", "الى", "إلى", "على", "عن", "مع", "ثم", "او", "أو", "ما", "هو", "هي", "الذي", "التي", "المرفق", "المرفقه"]);
  return new Set(normalizeForEvidence(`${alternative.stimulus} ${alternative.text}`)
    .split(/\s+/u)
    .filter((token) => token.length >= 3 && !stop.has(token)));
}

function validateAlternativeDiversity(alternatives: GeneratedAlternative[], diversityKey: string): void {
  if (!diversityKey || diversityKey.startsWith("legacy:")) return;
  for (let first = 0; first < alternatives.length; first += 1) {
    const firstTokens = alternativeTokenSet(alternatives[first]!);
    for (let second = first + 1; second < alternatives.length; second += 1) {
      const secondTokens = alternativeTokenSet(alternatives[second]!);
      const union = new Set([...firstTokens, ...secondTokens]);
      const overlap = [...firstTokens].filter((token) => secondTokens.has(token)).length;
      const similarity = union.size ? overlap / union.size : 1;
      if (similarity >= 0.78) {
        throw retryableError("البدائل الثلاثة متشابهة أكثر من اللازم؛ المطلوب مواقف وصياغات مختلفة حقيقيًا.");
      }
    }
  }
}

function shouldRequireCalculationWorking(questionForm: QuestionDesignPattern, marks: number): boolean {
  return questionForm === "حسابي" && Number.isFinite(marks) && marks >= 2;
}

function validateAndHydrateAlternative(
  alternative: ModelGeneratedAlternative,
  questionType: QuestionType,
  sourceReferenceId: string,
  evidenceCatalog: EvidenceCatalog,
  requestedStyleTarget: QuestionDesignPattern,
  requestedVisualTarget: QuestionVisualType,
  marks: number,
  lessonLabel: string,
  outcomeLabel: string,
  regenerationAnchor?: RegenerationAnchor,
  enrichment: TrustedEnrichmentContext = { segments: [], attempted: false },
  fixedVisual: QuestionVisualSpec = emptyVisualSpec(),
  scenarioTarget: QuestionScenarioTarget = "scientific_abstract",
  stimulusTarget: QuestionStimulusTarget = "concise_text",
  skillTarget: QuestionSkillTarget = "recognize",
  diversityKey = "legacy:item",
  structuredScenarioRequired = false,
): GeneratedAlternative {
  if (!alternative || typeof alternative !== "object") throw retryableError("أحد بدائل الأسئلة غير صالح.");
  for (const field of ["text", "answer", "rationale", "sourceEvidenceId"] as const) {
    if (typeof alternative[field] !== "string" || !alternative[field].trim()) {
      throw retryableError("أحد بدائل الأسئلة يحتوي حقلًا نصيًا فارغًا.");
    }
  }
  if (typeof alternative.stimulus !== "string"
    || !Array.isArray(alternative.options)
    || (!Array.isArray(alternative.markScheme) && !asRecord(alternative.markScheme))
    || typeof alternative.workingRequired !== "boolean"
    || typeof alternative.needsReview !== "boolean") {
    throw retryableError("أحد بدائل الأسئلة لا يطابق البنية المطلوبة.");
  }
  if (alternative.questionForm !== requestedStyleTarget) {
    throw retryableError("مولد الأسئلة لم يلتزم بنمط السؤال المحدد في الخطة.");
  }
  alternative = {
    ...alternative,
    stimulus: sanitizeGeneratedDisplayText(alternative.stimulus),
    text: sanitizeGeneratedDisplayText(alternative.text),
    options: alternative.options.map((option) => sanitizeGeneratedDisplayText(typeof option === "string" ? option : "")),
    answer: sanitizeGeneratedDisplayText(alternative.answer),
    rationale: sanitizeGeneratedDisplayText(alternative.rationale),
    markScheme: sanitizeModelMarkScheme(alternative.markScheme),
    scenarioContract: asRecord(alternative.scenarioContract)
      ? sanitizeScenarioContract(alternative.scenarioContract)
      : undefined,
  };
  const visualReference = normalizeVisualQuestionReference(
    alternative.stimulus,
    alternative.text,
    requestedVisualTarget,
  );
  if (requestedVisualTarget !== "none" && !visualReference.hasReference) {
    throw retryableError("تعذر ربط السؤال تلقائيًا بالرسم المرفق.");
  }
  alternative = {
    ...alternative,
    stimulus: visualReference.stimulus,
    text: visualReference.text,
  };
  const markScheme = normalizeModelMarkScheme(alternative.markScheme, marks);
  if (!hasSufficientQuestionContext(
    alternative.stimulus,
    alternative.text,
    alternative.questionForm,
    requestedVisualTarget,
  )) {
    throw retryableError("أحد الأسئلة السياقية لا يحتوي متنًا أو بيانات كافية.");
  }
  const workingRequired = shouldRequireCalculationWorking(alternative.questionForm, marks);
  if (alternative.questionForm === "حسابي" && !calculationPromptContainsRequiredData(alternative, fixedVisual)) {
    throw retryableError("السؤال الحسابي ومثيره لا يحتويان جميع القيم والوحدات اللازمة للحل.");
  }
  validateVisualSemanticBinding(alternative, markScheme, fixedVisual);
  if (structuredScenarioRequired) {
    validateStructuredScenarioContract(alternative, scenarioTarget, stimulusTarget, skillTarget, outcomeLabel, fixedVisual);
  }
  validateAssessmentQuality(alternative, scenarioTarget, stimulusTarget, skillTarget, diversityKey);
  if (questionType === "اختيار من متعدد") {
    const options = alternative.options.map((option) => typeof option === "string" ? option.trim() : "");
    if (options.some((option) => !option) || options.length !== 4 || new Set(options).size !== 4) {
      throw retryableError("سؤال اختيار من متعدد لا يحتوي أربعة بدائل مختلفة.");
    }
    if (!options.includes(alternative.answer.trim())) {
      throw retryableError("إجابة سؤال اختيار من متعدد لا تطابق أحد البدائل.");
    }
  } else if (alternative.options.length !== 0) {
    throw retryableError("سؤال غير موضوعي يحتوي بدائل اختيار من متعدد.");
  }

  if (isMetaSourceQuestion(`${alternative.stimulus} ${alternative.text}`)) {
    throw retryableError("أنشأ مولد الأسئلة سؤالًا عن بنية الكتاب بدل المحتوى العلمي للدرس.");
  }
  const evidence = evidenceCatalog.byId.get(alternative.sourceEvidenceId.trim());
  if (!evidence || evidence.referenceId !== sourceReferenceId) {
    throw retryableError("اختار مولد الأسئلة دليلًا لا ينتمي إلى مرجع المفردة.");
  }
  const reference = evidenceCatalog.referenceById.get(sourceReferenceId);
  if (!reference || !referenceSupportsLessonScope(lessonLabel, reference)) {
    throw retryableError("المرجع المختار لا يثبت ارتباط السؤال بالدرس المحدد.");
  }
  const questionMaterial = `${alternative.stimulus} ${alternative.text} ${alternative.answer} ${alternative.rationale}`;
  const fullReferenceContent = evidenceCatalog.referenceContentById.get(sourceReferenceId) ?? evidence.text;
  const directEvidenceAffinity = hasEvidenceAffinity(questionMaterial, evidence.text, lessonLabel);
  const fullReferenceAffinity = hasEvidenceAffinity(questionMaterial, fullReferenceContent, lessonLabel);
  if (!directEvidenceAffinity && !fullReferenceAffinity) {
    throw retryableError("السؤال المولد لا يرتبط بصورة كافية بدليل المرجع المدرسي المحدد.");
  }
  if (regenerationAnchor && !hasRegenerationSimilarity(questionMaterial, regenerationAnchor, lessonLabel)) {
    throw retryableError("إعادة التوليد ابتعدت عن مفهوم السؤال المختار بدل تقديم صياغة مشابهة.");
  }
  const enrichmentEvidenceId = typeof alternative.enrichmentEvidenceId === "string"
    ? alternative.enrichmentEvidenceId.trim()
    : "";
  const enrichmentSegment = enrichmentEvidenceId
    ? enrichment.segments.find((segment) => segment.id === enrichmentEvidenceId)
    : undefined;
  if (enrichmentEvidenceId && !enrichmentSegment) {
    throw retryableError("اختار مولد الأسئلة إثراءً خارجيًا غير موثق أو غير مسموح.");
  }
  const weakAffinity = !directEvidenceAffinity && fullReferenceAffinity;
  const commandReview = questionType !== "اختيار من متعدد" && !hasAppropriateCommandWord(alternative.text, marks);
  return {
    stimulus: alternative.stimulus,
    text: alternative.text,
    options: alternative.options.map((option) => option.trim()),
    answer: alternative.answer.trim(),
    rationale: alternative.rationale.trim(),
    markScheme,
    questionForm: alternative.questionForm,
    workingRequired,
    sourceSupport: evidence.text,
    enrichmentSupport: enrichmentSegment?.text ?? "",
    enrichmentSourceTitle: enrichmentSegment?.sourceTitle ?? "",
    enrichmentSourceUrl: enrichmentSegment?.sourceUrl ?? "",
    needsReview: alternative.needsReview || weakAffinity || commandReview,
  };
}

function isMetaSourceQuestion(value: string): boolean {
  const normalized = normalizeForEvidence(value);
  const patterns = [
    "في اي وحده", "اسم الوحده", "رقم الوحده", "اي فصل", "اسم الفصل",
    "كتاب الطالب", "في الكتاب", "اسم الكتاب", "رقم الصفحه", "في اي صفحه", "موضع الدرس", "يتناول المنهج",
  ];
  return patterns.some((pattern) => normalized.includes(normalizeForEvidence(pattern)));
}

function canonicalEvidenceToken(token: string): string {
  let value = token;
  if (value.length > 4 && /^[وف]/u.test(value)) value = value.slice(1);
  if (value.length > 5 && value.startsWith("لل")) value = value.slice(2);
  else if (value.length > 4 && /^[بكل]/u.test(value)) value = value.slice(1);
  if (value.length > 4 && value.startsWith("ال")) value = value.slice(2);
  return value;
}

function lessonTitleMatchesEvidence(lessonLabel: string, evidenceText: string): boolean {
  const stopWords = new Set(["درس", "الوحده", "موضوع", "في", "من", "الى", "على", "كل", "مكان", "داخل", "خارج"]);
  const lessonTokens = normalizeForEvidence(lessonLabel)
    .split(/\s+/u)
    .map(canonicalEvidenceToken)
    .filter((token) => token.length >= 3 && !stopWords.has(token) && !/^\d+$/.test(token));
  if (!lessonTokens.length) return true;
  const evidenceTokens = new Set(normalizeForEvidence(evidenceText).split(/\s+/u).map(canonicalEvidenceToken));
  const matched = lessonTokens.filter((token) => evidenceTokens.has(token)).length;
  return matched >= Math.min(2, lessonTokens.length);
}

function pageRangesOverlap(fromA: number, toA: number, fromB: number, toB: number): boolean {
  return fromA <= toB && toA >= fromB;
}

function referenceSupportsLessonScope(
  lessonLabel: string | undefined,
  referenceOrText: GenerationReference | string,
): boolean {
  if (!lessonLabel?.trim()) return true;
  if (typeof referenceOrText === "string") {
    return lessonTitleMatchesEvidence(lessonLabel, referenceOrText);
  }

  const reference = referenceOrText;
  const scopedLessonTopic = typeof reference.lessonTopic === "string" ? reference.lessonTopic.trim() : "";
  const scopeMode = reference.lessonScopeMode ?? "legacy-title";
  if (scopedLessonTopic && normalizeForEvidence(scopedLessonTopic) !== normalizeForEvidence(lessonLabel)) return false;

  if (scopeMode === "page-range" || scopeMode === "page-neighborhood") {
    if (typeof reference.sourceId !== "string" || !reference.sourceId.trim()
      || reference.lessonPageFrom === undefined || reference.lessonPageTo === undefined) return false;
    const padding = scopeMode === "page-neighborhood" ? 3 : 0;
    return pageRangesOverlap(
      reference.pageFrom,
      reference.pageTo,
      Math.max(1, reference.lessonPageFrom - padding),
      reference.lessonPageTo + padding,
    );
  }

  return lessonTitleMatchesEvidence(lessonLabel, reference.content);
}

function hasRegenerationSimilarity(questionMaterial: string, anchor: RegenerationAnchor, lessonLabel: string): boolean {
  const anchorMaterial = `${anchor.stimulus} ${anchor.text} ${anchor.answer}`;
  const stopWords = new Set([
    "الذي", "التي", "هذا", "هذه", "ذلك", "تلك", "على", "الى", "في", "من", "عن", "مع",
    "او", "ثم", "ما", "ماذا", "كيف", "لماذا", "هو", "هي", "ان", "كان", "تكون", "يكون",
    "اكتب", "حدد", "اذكر", "اختر", "احسب", "صف", "فسر", "اشرح", "استنتج", "اقترح", "برر",
  ]);
  const tokenSet = (value: string) => new Set(
    normalizeForEvidence(value).split(/\s+/u).map(canonicalEvidenceToken)
      .filter((token) => token.length >= 3 && !stopWords.has(token) && !/^\d+(?:\.\d+)?$/u.test(token)),
  );
  const generated = tokenSet(questionMaterial);
  const anchored = tokenSet(anchorMaterial);
  const lesson = tokenSet(lessonLabel);
  let shared = 0;
  for (const token of generated) {
    if (!anchored.has(token)) continue;
    shared += 1;
    if (!lesson.has(token) && token.length >= 5) return true;
    if (shared >= 2) return true;
  }
  return false;
}

function hasAppropriateCommandWord(questionText: string, marks: number): boolean {
  const normalized = normalizeForEvidence(questionText);
  const oneMark = ["اكتب", "حدد", "اذكر", "اختر", "سم", "عين", "احسب", "استخرج"];
  const multiMark = ["احسب", "صف", "قارن", "فسر", "اشرح", "استنتج", "اقترح", "برر", "حلل", "قيم", "وضح"];
  return (marks === 1 ? oneMark : multiMark).some((command) => normalized.includes(normalizeForEvidence(command)));
}

function hasEvidenceAffinity(questionMaterial: string, evidenceText: string, lessonLabel = ""): boolean {
  const stopWords = new Set([
    "الذي", "التي", "هذا", "هذه", "ذلك", "تلك", "على", "الى", "في", "من", "عن", "مع",
    "او", "ثم", "ما", "ماذا", "كيف", "لماذا", "هو", "هي", "ان", "كان", "تكون", "يكون",
    "وفقا", "احد", "احدى", "الاجابه", "السوال", "الصحيحه", "الاتيه", "التاليه",
  ]);
  const tokens = (value: string) => new Set(
    normalizeForEvidence(value)
      .split(/\s+/u)
      .map(canonicalEvidenceToken)
      .filter((token) => token.length >= 3 && !stopWords.has(token)),
  );
  const questionTokens = tokens(questionMaterial);
  const evidenceTokens = tokens(evidenceText);
  const lessonTokens = tokens(lessonLabel);
  let shared = 0;
  for (const token of questionTokens) {
    if (!evidenceTokens.has(token)) continue;
    shared += 1;
    if (lessonTokens.has(token)) return true;
    if (shared >= 2) return true;
  }
  return shared >= 1 && (questionTokens.size <= 4 || evidenceTokens.size <= 6);
}

function normalizeForEvidence(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

interface GenerateContentCompletion {
  finishReason: string;
  finishMessage: string;
  promptTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  thoughtsTokens: number | null;
  cachedTokens: number | null;
}

function findGenerateContentOutputText(payload: unknown): { text: string; partCount: number } {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.candidates) || record.candidates.length < 1) {
    return { text: "", partCount: 0 };
  }
  const candidate = asRecord(record.candidates[0]);
  const content = asRecord(candidate?.content);
  if (!content || !Array.isArray(content.parts)) return { text: "", partCount: 0 };
  const textParts: string[] = [];
  for (const part of content.parts) {
    const partRecord = asRecord(part);
    if (typeof partRecord?.text === "string" && partRecord.text) textParts.push(partRecord.text);
  }
  return { text: textParts.join(""), partCount: textParts.length };
}

function inspectGenerateContentCompletion(payload: unknown): GenerateContentCompletion {
  const record = asRecord(payload);
  const promptFeedback = asRecord(record?.promptFeedback);
  const blockReason = typeof promptFeedback?.blockReason === "string" ? promptFeedback.blockReason : "";
  if (blockReason && blockReason !== "BLOCK_REASON_UNSPECIFIED") {
    throw httpError(`رفض Gemini الطلب قبل التوليد (${blockReason}).`, 422);
  }
  if (!record || !Array.isArray(record.candidates) || record.candidates.length < 1) {
    throw retryableError("لم يُرجع Gemini أي نتيجة مرشحة.");
  }
  const candidate = asRecord(record.candidates[0]);
  const finishReason = typeof candidate?.finishReason === "string" ? candidate.finishReason : "FINISH_REASON_UNSPECIFIED";
  const finishMessage = typeof candidate?.finishMessage === "string" ? candidate.finishMessage.trim() : "";
  const usage = asRecord(record.usageMetadata);
  const promptTokens = typeof usage?.promptTokenCount === "number" ? usage.promptTokenCount : null;
  const outputTokens = typeof usage?.candidatesTokenCount === "number" ? usage.candidatesTokenCount : null;
  const totalTokens = typeof usage?.totalTokenCount === "number" ? usage.totalTokenCount : null;
  const thoughtsTokens = typeof usage?.thoughtsTokenCount === "number" ? usage.thoughtsTokenCount : null;
  const cachedTokens = typeof usage?.cachedContentTokenCount === "number" ? usage.cachedContentTokenCount : null;

  if (finishReason === "STOP" || finishReason === "FINISH_REASON_UNSPECIFIED") {
    return { finishReason, finishMessage, promptTokens, outputTokens, totalTokens, thoughtsTokens, cachedTokens };
  }
  if (finishReason === "MAX_TOKENS" || finishReason === "MALFORMED_RESPONSE" || finishReason === "OTHER") {
    throw retryableError(finishMessage || `لم يكتمل ناتج Gemini (${finishReason}).`);
  }
  throw httpError(finishMessage || `أوقف Gemini التوليد (${finishReason}).`, 422);
}

function geminiError(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  const error = asRecord(record?.error);
  return typeof error?.message === "string" && error.message ? error.message : fallback;
}

async function requireUser(req: Request): Promise<string> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw httpError("يلزم تسجيل دخول مالك المنصة.", 401);
  const token = authorization.slice("Bearer ".length);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw httpError("جلسة مالك المنصة غير صالحة أو منتهية.", 401);
  return data.user.id;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) throw httpError(message, 400);
  return record;
}

function requireText(value: unknown, message: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw httpError(message, 400);
  const text = value.trim();
  if (text.length > maxLength) throw httpError(`${message} تجاوز الحد المسموح.`, 400);
  return text;
}

function requireInteger(value: unknown, message: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw httpError(message, 400);
  }
  return value;
}

function requireEnum<const T extends readonly string[]>(value: unknown, allowed: T, message: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) throw httpError(message, 400);
  return value as T[number];
}

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin === appOrigin ? origin : appOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function json(req: Request, payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: corsHeaders(req) });
}

function createRequestId(): string {
  return `WQ-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function logStage(requestId: string, stage: string, details: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ requestId, stage, ...details }));
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`متغير الخادم ${name} غير مضبوط.`);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع في مولد الأسئلة.";
}

function httpError(message: string, status: number): Error & { status: number; retryable?: boolean } {
  return Object.assign(new Error(message), { status });
}

function retryableError(message: string): Error & { status: number; retryable: boolean } {
  return Object.assign(new Error(message), { status: 502, retryable: true });
}

function transportRetryableError(message: string): Error & { status: number; retryable: boolean; transportRetryExhausted: boolean } {
  return Object.assign(new Error(message), { status: 503, retryable: true, transportRetryExhausted: true });
}

function isTransportRetryExhausted(error: unknown): boolean {
  return typeof error === "object" && error !== null
    && "transportRetryExhausted" in error
    && (error as { transportRetryExhausted?: unknown }).transportRetryExhausted === true;
}

function errorStatus(error: unknown): number {
  if (typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number") {
    return (error as { status: number }).status;
  }
  return 500;
}

function isRetryableGenerationError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "retryable" in error && (error as { retryable?: unknown }).retryable === true;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
