import type { QuestionVisualSpec, ScientificDirection, ScientificItemModel, ScientificQuantity, QuestionVisualType, QuestionVisualVariant } from "../types.js";
import type { AssessmentItemContract, ScientificContractKey } from "./contracts.js";

export interface DeterministicScientificContract {
  key: ScientificContractKey;
  facts: string[];
  expectedAnswerTokens: string[];
  scientificItem: ScientificItemModel;
  visual: QuestionVisualSpec;
}

function seededRange(seed: number, minimum: number, span: number, step: number): number {
  return Number((minimum + (seed % Math.max(1, Math.floor(span / step) + 1)) * step).toFixed(3));
}

function quantity(kind: ScientificQuantity["kind"], label: string, value: number, unit: string, direction: ScientificDirection): ScientificQuantity {
  return { kind, label, value, unit, direction };
}

function genericScientificItem(phenomenon: string, expectedResult: string): ScientificItemModel {
  return {
    version: "scientific-item-v1", kind: "generic", phenomenon,
    primaryEntity: phenomenon, secondaryEntity: "", visualObject: phenomenon,
    relationship: "none", primaryCharge: "unknown", secondaryCharge: "unknown",
    transferredParticle: "", quantities: [], resultValue: 0, resultUnit: "",
    resultDirection: "none", expectedResult,
  };
}

function visualSpec(
  contract: AssessmentItemContract,
  type: QuestionVisualType,
  variant: QuestionVisualVariant,
  extra: Partial<QuestionVisualSpec> = {},
): QuestionVisualSpec {
  return {
    type,
    visualId: `engine-v1-${contract.planItemId}`,
    variant,
    purpose: contract.scientificRequirements.join("، "),
    role: contract.skillTarget === "calculate" ? "calculate" : contract.skillTarget === "compare" ? "compare" : "interpret",
    title: contract.lessonLabel,
    altText: `مرئي علمي حتمي حول ${contract.outcomeLabel}.`,
    xAxisLabel: "", xAxisUnit: "", yAxisLabel: "", yAxisUnit: "",
    xMin: 0, xMax: 10, yMin: 0, yMax: 10,
    points: [], series: [], labels: [], values: [], components: [], annotations: [],
    tableColumns: [], tableRows: [], tableCells: [], hiddenCells: [], vectors: [],
    ...extra,
  };
}

function momentContract(contract: AssessmentItemContract): DeterministicScientificContract {
  const force = seededRange(contract.numericSeed, 8, 16, 1);
  const arm = seededRange(contract.numericSeed >>> 5, 0.2, 1.2, 0.1);
  const moment = Number((force * arm).toFixed(2));
  const direction: ScientificDirection = contract.numericSeed % 2 === 0 ? "clockwise" : "counterclockwise";
  const scientificItem: ScientificItemModel = {
    version: "scientific-item-v1", kind: "moment_system", phenomenon: "عزم قوة حول محور دوران",
    primaryEntity: "القوة المؤثرة", secondaryEntity: "محور الدوران", visualObject: contract.scenarioTarget,
    relationship: "moment", primaryCharge: "unknown", secondaryCharge: "unknown", transferredParticle: "",
    quantities: [
      quantity("moment_force", "القوة المؤثرة", force, "N", direction),
      quantity("lever_arm", "ذراع القوة", arm, "m", "none"),
    ],
    resultValue: moment, resultUnit: "N m", resultDirection: direction,
    expectedResult: `${moment} نيوتن متر`,
  };
  const contextual = contract.visualTarget === "context_scene";
  return {
    key: "moment",
    facts: [
      `مقدار القوة ${force} نيوتن.`,
      `المسافة العمودية بين خط عمل القوة ومحور الدوران ${arm} متر.`,
      `العزم الصحيح ${moment} نيوتن متر واتجاهه ${direction}.`,
      "يجب إظهار محور الدوران وموضع تأثير القوة وذراع القوة.",
    ],
    expectedAnswerTokens: [String(moment), "نيوتن", "متر"],
    scientificItem,
    visual: visualSpec(contract, contextual ? "context_scene" : "force_diagram", contextual ? (contract.scenarioTarget as QuestionVisualVariant) : "moments", {
      labels: ["محور الدوران", "موضع تأثير القوة", "ذراع القوة"],
      values: contextual ? [force, arm, moment] : [arm],
      annotations: [`القوة = ${force} N`, `ذراع القوة = ${arm} m`, `العزم = ${moment} N m`, `الاتجاه = ${direction}`],
      vectors: [{ label: "القوة المؤثرة", x: 7, y: 5, dx: 0, dy: direction === "clockwise" ? 3 : -3, magnitude: force }],
    }),
  };
}

function forceContract(contract: AssessmentItemContract): DeterministicScientificContract {
  const applied = seededRange(contract.numericSeed, 12, 24, 1);
  const friction = seededRange(contract.numericSeed >>> 4, 3, Math.max(4, applied - 4), 1);
  const result = Number((applied - friction).toFixed(2));
  const scientificItem: ScientificItemModel = {
    version: "scientific-item-v1", kind: "force_system", phenomenon: "قوة محصلة",
    primaryEntity: "جسم", secondaryEntity: "سطح", visualObject: "مخطط جسم حر",
    relationship: "resultant_force", primaryCharge: "unknown", secondaryCharge: "unknown", transferredParticle: "",
    quantities: [
      quantity("applied_force", "القوة المؤثرة", applied, "N", "right"),
      quantity("friction_force", "قوة الاحتكاك", friction, "N", "left"),
    ],
    resultValue: result, resultUnit: "N", resultDirection: "right", expectedResult: `${result} نيوتن إلى اليمين`,
  };
  return {
    key: "force",
    facts: [`القوة المؤثرة ${applied} نيوتن إلى اليمين.`, `الاحتكاك ${friction} نيوتن إلى اليسار.`, `المحصلة الصحيحة ${result} نيوتن إلى اليمين.`],
    expectedAnswerTokens: [String(result), "نيوتن"],
    scientificItem,
    visual: visualSpec(contract, "force_diagram", "free_body", {
      labels: ["القوة المؤثرة", "قوة الاحتكاك", "القوة المحصلة"],
      values: [applied, friction, result],
      vectors: [
        { label: "القوة المؤثرة", x: 5, y: 5, dx: 3, dy: 0, magnitude: applied },
        { label: "قوة الاحتكاك", x: 5, y: 5, dx: -3, dy: 0, magnitude: friction },
      ],
    }),
  };
}

function electrostaticContract(contract: AssessmentItemContract): DeterministicScientificContract {
  const same = contract.numericSeed % 2 === 0;
  const relation = same ? "تنافر" : "تجاذب";
  const relationship = same ? "repulsion" : "attraction";
  const scientificItem: ScientificItemModel = {
    version: "scientific-item-v1", kind: "electrostatic_system", phenomenon: "تفاعل شحنتين",
    primaryEntity: "الجسم الأول", secondaryEntity: "الجسم الثاني", visualObject: "جسمان مشحونان",
    relationship, primaryCharge: "positive", secondaryCharge: same ? "positive" : "negative", transferredParticle: "",
    quantities: [], resultValue: 0, resultUnit: "", resultDirection: same ? "away" : "toward", expectedResult: relation,
  };
  return {
    key: "electrostatic",
    facts: [`شحنة الجسم الأول موجبة والثاني ${same ? "موجبة" : "سالبة"}.`, `العلاقة الصحيحة ${relation}.`],
    expectedAnswerTokens: [relation],
    scientificItem,
    visual: visualSpec(contract, "electrostatic_diagram", "attraction_repulsion", {
      labels: ["الجسم الأول", "الجسم الثاني", relation], values: [same ? 0 : 1],
      annotations: [relationship, "positive", same ? "positive" : "negative"],
    }),
  };
}

function pressureContract(contract: AssessmentItemContract): DeterministicScientificContract {
  const force = seededRange(contract.numericSeed, 20, 60, 5);
  const area = seededRange(contract.numericSeed >>> 6, 2, 8, 1);
  const pressure = Number((force / area).toFixed(2));
  return {
    key: "pressure",
    facts: [`القوة ${force} نيوتن.`, `المساحة ${area} متر مربع.`, `الضغط الصحيح ${pressure} باسكال.`],
    expectedAnswerTokens: [String(pressure), "باسكال"],
    scientificItem: genericScientificItem("الضغط", `${pressure} باسكال`),
    visual: visualSpec(contract, "pressure_diagram", "force_area", { labels: ["القوة", "المساحة", "الضغط"], values: [force, area, pressure] }),
  };
}

function genericContract(contract: AssessmentItemContract): DeterministicScientificContract {
  let type: QuestionVisualType = contract.visualTarget;
  let variant: QuestionVisualVariant = contract.scenarioTarget === "scientific_abstract" ? "default" : contract.scenarioTarget as QuestionVisualVariant;
  const extra: Partial<QuestionVisualSpec> = {};
  if (contract.scientificContractKey === "circuit") { type = "circuit_diagram"; variant = "series_circuit"; extra.components = ["battery", "switch_closed", "lamp", "ammeter"]; }
  if (contract.scientificContractKey === "optics") { type = "ray_diagram"; variant = "reflection"; extra.values = [35, 35]; extra.annotations = ["الشعاع الساقط", "العمود المقام", "الشعاع المنعكس"]; }
  if (contract.scientificContractKey === "instrument") { type = "instrument_scale"; variant = "measuring_cylinder"; extra.values = [42]; extra.annotations = ["قراءة التدريج = 42"]; }
  if (contract.scientificContractKey === "graph") { type = "line_graph"; variant = "trend"; extra.xAxisLabel = "الزمن"; extra.xAxisUnit = "s"; extra.yAxisLabel = "الكمية المقاسة"; extra.points = [{ x: 0, y: 1, label: "A" }, { x: 1, y: 3, label: "B" }, { x: 2, y: 5, label: "C" }]; }
  if (contract.scientificContractKey === "table") { type = "data_table"; variant = "table_comparison"; extra.tableColumns = ["الحالة", "القيمة"]; extra.tableRows = ["أ", "ب", "ج"]; extra.tableCells = [["أ", "2"], ["ب", "4"], ["ج", "6"]]; }
  if (contract.scientificContractKey === "process") { type = "flow_diagram"; variant = "linear_flow"; extra.labels = ["البداية", "التحول", "الناتج"]; }
  return {
    key: contract.scientificContractKey,
    facts: [`المفردة تقيس الهدف: ${contract.outcomeLabel}.`, `المفهوم العلمي المركزي: ${contract.lessonLabel}.`, ...contract.scientificRequirements.map((entry) => `متطلب علمي: ${entry}.`)],
    expectedAnswerTokens: [],
    scientificItem: genericScientificItem(contract.lessonLabel, `إجابة مرتبطة بهدف التعلم: ${contract.outcomeLabel}`),
    visual: visualSpec(contract, type, variant, extra),
  };
}

export function buildDeterministicScientificContract(contract: AssessmentItemContract): DeterministicScientificContract {
  if (contract.scientificContractKey === "moment") return momentContract(contract);
  if (contract.scientificContractKey === "force") return forceContract(contract);
  if (contract.scientificContractKey === "electrostatic") return electrostaticContract(contract);
  if (contract.scientificContractKey === "pressure") return pressureContract(contract);
  return genericContract(contract);
}
