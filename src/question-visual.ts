import type {
  CircuitComponent,
  QuestionVisualPoint,
  QuestionVisualRole,
  QuestionVisualSeries,
  QuestionVisualSpec,
  QuestionVisualType,
  QuestionVisualVariant,
  QuestionVisualVector,
} from "./types.js";

export const QUESTION_VISUAL_TYPES: readonly QuestionVisualType[] = [
  "none",
  "line_graph",
  "bar_chart",
  "pressure_diagram",
  "circuit_diagram",
  "electrostatic_diagram",
  "data_table",
  "instrument_scale",
  "ray_diagram",
  "force_diagram",
  "flow_diagram",
];

export const QUESTION_VISUAL_VARIANTS: readonly QuestionVisualVariant[] = [
  "default",
  "submerged_object",
  "depth_comparison",
  "force_area",
  "liquid_column",
  "series_circuit",
  "measurement_circuit",
  "charge_transfer",
  "attraction_repulsion",
  "electric_field",
  "trend",
  "comparison",
  "multi_series",
  "table_completion",
  "table_comparison",
  "thermometer",
  "burette",
  "measuring_cylinder",
  "meter_scale",
  "reflection",
  "refraction",
  "converging_lens",
  "prism",
  "free_body",
  "balanced_forces",
  "moments",
  "linear_flow",
  "cycle_flow",
  "state_change",
];

export const CIRCUIT_COMPONENTS: readonly CircuitComponent[] = [
  "battery",
  "switch_open",
  "switch_closed",
  "lamp",
  "resistor",
  "ammeter",
  "voltmeter",
];

export const QUESTION_VISUAL_ROLES: readonly QuestionVisualRole[] = ["read", "calculate", "interpret", "compare", "complete", "draw", "evaluate"];

const VISUAL_LABELS: Record<QuestionVisualType, string> = {
  none: "دون رسم",
  line_graph: "رسم بياني خطي",
  bar_chart: "رسم أعمدة",
  pressure_diagram: "مخطط ضغط ثنائي الأبعاد",
  circuit_diagram: "دائرة كهربائية مبسطة",
  electrostatic_diagram: "مخطط كهرباء ساكنة ثنائي الأبعاد",
  data_table: "جدول بيانات علمي",
  instrument_scale: "تدريج جهاز قياس",
  ray_diagram: "مخطط أشعة وبصريات",
  force_diagram: "مخطط قوى وحركة",
  flow_diagram: "مخطط عملية أو تسلسل",
};

export function questionVisualTypeLabel(type: QuestionVisualType): string {
  return VISUAL_LABELS[type];
}

export function isQuestionVisualType(value: unknown): value is QuestionVisualType {
  return typeof value === "string" && (QUESTION_VISUAL_TYPES as readonly string[]).includes(value);
}

export function isQuestionVisualVariant(value: unknown): value is QuestionVisualVariant {
  return typeof value === "string" && (QUESTION_VISUAL_VARIANTS as readonly string[]).includes(value);
}

export function isQuestionVisualRole(value: unknown): value is QuestionVisualRole {
  return typeof value === "string" && (QUESTION_VISUAL_ROLES as readonly string[]).includes(value);
}

export function isCircuitComponent(value: unknown): value is CircuitComponent {
  return typeof value === "string" && (CIRCUIT_COMPONENTS as readonly string[]).includes(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanText(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanHttpsUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function parseQuestionVisualIllustration(value: unknown): QuestionVisualSpec["illustration"] {
  const record = asRecord(value);
  if (!record) return undefined;
  const url = cleanHttpsUrl(record.url);
  const assetPath = cleanText(record.assetPath, 240);
  const mimeType = cleanText(record.mimeType, 40);
  const model = cleanText(record.model, 100);
  const generatedAt = cleanText(record.generatedAt, 60);
  const promptVersion = cleanText(record.promptVersion, 80);
  if (!url || !assetPath || !model || !generatedAt || !promptVersion || record.validated !== true
    || !["image/png", "image/jpeg", "image/webp"].includes(mimeType)) return undefined;
  return { url, assetPath, mimeType, model, generatedAt, promptVersion, validated: true };
}

function cleanTextArray(value: unknown, maxItems: number, maxLength = 80): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanNumberArray(value: unknown, maxItems: number): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
    .slice(0, maxItems);
}

function cleanPoints(value: unknown): QuestionVisualPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record || typeof record.x !== "number" || !Number.isFinite(record.x)
      || typeof record.y !== "number" || !Number.isFinite(record.y)) return [];
    return [{ x: record.x, y: record.y, label: cleanText(record.label, 40) }];
  }).slice(0, 10);
}

function cleanSeries(value: unknown): QuestionVisualSeries[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) return [];
    const label = cleanText(record.label, 50);
    const points = cleanPoints(record.points);
    return label && points.length >= 2 ? [{ label, points }] : [];
  }).slice(0, 4);
}

function cleanStringMatrix(value: unknown, maxRows = 8, maxColumns = 6): string[][] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxRows).flatMap((row) => {
    if (!Array.isArray(row)) return [];
    return [[...row.slice(0, maxColumns).map((cell) => cleanText(cell, 80))]];
  });
}

function cleanVectors(value: unknown): QuestionVisualVector[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) return [];
    const fields = [record.x, record.y, record.dx, record.dy, record.magnitude];
    if (fields.some((field) => typeof field !== "number" || !Number.isFinite(field))) return [];
    return [{
      label: cleanText(record.label, 50),
      x: record.x as number,
      y: record.y as number,
      dx: record.dx as number,
      dy: record.dy as number,
      magnitude: record.magnitude as number,
    }];
  }).slice(0, 8);
}

export function emptyQuestionVisualSpec(): QuestionVisualSpec {
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

export function parseQuestionVisualSpec(value: unknown, expectedType?: QuestionVisualType): QuestionVisualSpec {
  const record = asRecord(value);
  if (!record || !isQuestionVisualType(record.type)) {
    throw new Error("مواصفة الرسم التعليمي غير صالحة.");
  }
  if (expectedType && record.type !== expectedType) {
    throw new Error("مولد الأسئلة لم يلتزم بنوع الرسم المطلوب.");
  }

  const illustration = parseQuestionVisualIllustration(record.illustration);
  const spec: QuestionVisualSpec = {
    type: record.type,
    visualId: cleanText(record.visualId, 80),
    variant: isQuestionVisualVariant(record.variant) ? record.variant : "default",
    purpose: cleanText(record.purpose, 160),
    role: isQuestionVisualRole(record.role) ? record.role : "read",
    title: cleanText(record.title),
    altText: cleanText(record.altText, 240),
    xAxisLabel: cleanText(record.xAxisLabel, 60),
    xAxisUnit: cleanText(record.xAxisUnit, 24),
    yAxisLabel: cleanText(record.yAxisLabel, 60),
    yAxisUnit: cleanText(record.yAxisUnit, 24),
    xMin: finiteNumber(record.xMin),
    xMax: finiteNumber(record.xMax, 1),
    yMin: finiteNumber(record.yMin),
    yMax: finiteNumber(record.yMax, 1),
    points: cleanPoints(record.points),
    series: cleanSeries(record.series),
    labels: cleanTextArray(record.labels, 12),
    values: cleanNumberArray(record.values, 10),
    components: Array.isArray(record.components)
      ? record.components.filter(isCircuitComponent).slice(0, 7)
      : [],
    annotations: cleanTextArray(record.annotations, 12, 100),
    tableColumns: cleanTextArray(record.tableColumns, 6, 70),
    tableRows: cleanTextArray(record.tableRows, 8, 70),
    tableCells: cleanStringMatrix(record.tableCells),
    hiddenCells: cleanTextArray(record.hiddenCells, 12, 16),
    vectors: cleanVectors(record.vectors),
    ...(illustration ? { illustration } : {}),
  };

  validateQuestionVisualSpec(spec);
  return spec;
}

export function diversifyQuestionVisualSpec(spec: QuestionVisualSpec, index: number, planItemId = ""): QuestionVisualSpec {
  if (spec.type === "none") return { ...spec, visualId: spec.visualId || "", variant: spec.variant ?? "default" };
  const pressureVariants: QuestionVisualVariant[] = ["submerged_object", "depth_comparison", "force_area", "liquid_column"];
  const circuitVariants: QuestionVisualVariant[] = ["series_circuit", "measurement_circuit"];
  const electrostaticVariants: QuestionVisualVariant[] = ["charge_transfer", "attraction_repulsion", "electric_field"];
  const graphVariants: QuestionVisualVariant[] = ["trend", "comparison", "multi_series"];
  const tableVariants: QuestionVisualVariant[] = ["table_completion", "table_comparison"];
  const scaleVariants: QuestionVisualVariant[] = ["thermometer", "burette", "measuring_cylinder", "meter_scale"];
  const rayVariants: QuestionVisualVariant[] = ["reflection", "refraction", "converging_lens", "prism"];
  const forceVariants: QuestionVisualVariant[] = ["free_body", "balanced_forces", "moments"];
  const flowVariants: QuestionVisualVariant[] = ["linear_flow", "cycle_flow", "state_change"];
  const fallback = (spec.type === "pressure_diagram"
    ? pressureVariants[index % pressureVariants.length]
    : spec.type === "circuit_diagram"
      ? circuitVariants[index % circuitVariants.length]
      : spec.type === "electrostatic_diagram"
        ? electrostaticVariants[index % electrostaticVariants.length]
        : spec.type === "data_table"
          ? tableVariants[index % tableVariants.length]
          : spec.type === "instrument_scale"
            ? scaleVariants[index % scaleVariants.length]
            : spec.type === "ray_diagram"
              ? rayVariants[index % rayVariants.length]
              : spec.type === "force_diagram"
                ? forceVariants[index % forceVariants.length]
                : spec.type === "flow_diagram"
                  ? flowVariants[index % flowVariants.length]
                  : graphVariants[index % graphVariants.length]) ?? "default";
  return {
    ...spec,
    visualId: spec.visualId || `visual-${planItemId || index + 1}`,
    variant: spec.variant && spec.variant !== "default" ? spec.variant : fallback,
    purpose: spec.purpose || spec.altText,
  };
}

export function validateQuestionVisualSpec(spec: QuestionVisualSpec): void {
  if (spec.type === "none") return;
  if (!spec.title || !spec.altText) throw new Error("الرسم التعليمي يحتاج عنوانًا ووصفًا بديلًا.");

  if (spec.type === "line_graph") {
    validateAxes(spec);
    const groups = spec.series.length ? spec.series.map((series) => series.points) : [spec.points];
    if (groups.length < 1 || groups.length > 4 || groups.some((points) => points.length < 2 || points.length > 10)) {
      throw new Error("الرسم الخطي يحتاج سلسلة إلى أربع سلاسل، بكل منها نقطتان إلى عشر نقاط.");
    }
    if (groups.flat().some((point) => point.x < spec.xMin || point.x > spec.xMax || point.y < spec.yMin || point.y > spec.yMax)) {
      throw new Error("إحدى نقاط الرسم الخطي خارج نطاق المحاور.");
    }
    return;
  }

  if (spec.type === "bar_chart") {
    if (!spec.yAxisLabel || spec.yMax <= spec.yMin) throw new Error("رسم الأعمدة يحتاج محورًا رأسيًا صالحًا.");
    if (spec.labels.length < 2 || spec.labels.length > 8 || spec.values.length !== spec.labels.length) {
      throw new Error("رسم الأعمدة يحتاج تسميتين إلى ثماني تسميات وقيمة لكل تسمية.");
    }
    if (spec.values.some((value) => value < spec.yMin || value > spec.yMax)) {
      throw new Error("إحدى قيم رسم الأعمدة خارج نطاق المحور.");
    }
    return;
  }

  if (spec.type === "pressure_diagram") {
    if (spec.labels.length < 2 || spec.values.length < 2) {
      throw new Error("مخطط الضغط يحتاج اسم السائل والجسم وقيمتين علميتين على الأقل.");
    }
    if (spec.variant === "force_area") {
      const [force, area] = spec.values;
      if (force === undefined || force <= 0 || area === undefined || area <= 0) {
        throw new Error("مخطط حساب الضغط يحتاج قوة ومساحة موجبتين.");
      }
      return;
    }
    const [liquidLevel, objectDepth] = spec.values;
    if (liquidLevel === undefined || liquidLevel < 0.25 || liquidLevel > 0.9
      || objectDepth === undefined || objectDepth < 0 || objectDepth > 1) {
      throw new Error("قيم مخطط الضغط غير صالحة.");
    }
    return;
  }

  if (spec.type === "circuit_diagram") {
    if (spec.components.length < 2 || spec.components.length > 7) {
      throw new Error("الدائرة الكهربائية تحتاج مكوّنين إلى سبعة مكونات.");
    }
    if (!spec.components.includes("battery")) throw new Error("الدائرة الكهربائية تحتاج بطارية.");
    if (!spec.components.some((component) => component === "lamp" || component === "resistor")) {
      throw new Error("الدائرة الكهربائية تحتاج حملًا مثل مصباح أو مقاومة.");
    }
    return;
  }

  if (spec.type === "electrostatic_diagram") {
    if (!["charge_transfer", "attraction_repulsion", "electric_field"].includes(spec.variant ?? "")) {
      throw new Error("نوع مخطط الكهرباء الساكنة غير صالح.");
    }
    if (spec.labels.length < 2) {
      throw new Error("مخطط الكهرباء الساكنة يحتاج جسمين أو عنصرين على الأقل.");
    }
    return;
  }

  if (spec.type === "data_table") {
    if (spec.tableColumns.length < 2 || spec.tableColumns.length > 6) {
      throw new Error("جدول البيانات يحتاج عمودين إلى ستة أعمدة.");
    }
    if (spec.tableRows.length < 2 || spec.tableRows.length > 8 || spec.tableCells.length !== spec.tableRows.length) {
      throw new Error("جدول البيانات يحتاج صفين إلى ثمانية صفوف مع بيانات مكتملة البنية.");
    }
    if (spec.tableCells.some((row) => row.length !== spec.tableColumns.length)) {
      throw new Error("عدد خلايا أحد صفوف الجدول لا يطابق عدد الأعمدة.");
    }
    if (spec.hiddenCells.some((key) => !/^r\d+c\d+$/u.test(key))) {
      throw new Error("أحد مواضع الخلايا المخفية غير صالح.");
    }
    return;
  }

  if (spec.type === "instrument_scale") {
    if (!["thermometer", "burette", "measuring_cylinder", "meter_scale"].includes(spec.variant ?? "")) {
      throw new Error("نوع تدريج جهاز القياس غير صالح.");
    }
    if (spec.values.length < 4) throw new Error("تدريج الجهاز يحتاج الحد الأدنى والأعلى والخطوة والقراءة.");
    const [min, max, step, reading] = spec.values;
    if (min === undefined || max === undefined || step === undefined || reading === undefined
      || max <= min || step <= 0 || reading < min || reading > max) {
      throw new Error("قيم تدريج جهاز القياس غير صالحة.");
    }
    return;
  }

  if (spec.type === "ray_diagram") {
    if (!["reflection", "refraction", "converging_lens", "prism"].includes(spec.variant ?? "")) {
      throw new Error("نوع مخطط الأشعة غير صالح.");
    }
    if (spec.values.length < 2) throw new Error("مخطط الأشعة يحتاج قيمًا هندسية أساسية.");
    return;
  }

  if (spec.type === "force_diagram") {
    if (!["free_body", "balanced_forces", "moments"].includes(spec.variant ?? "")) {
      throw new Error("نوع مخطط القوى غير صالح.");
    }
    if (spec.vectors.length < 2 || spec.vectors.length > 8) {
      throw new Error("مخطط القوى يحتاج متجهين إلى ثمانية متجهات.");
    }
    if (spec.vectors.some((vector) => vector.magnitude <= 0 || (vector.dx === 0 && vector.dy === 0))) {
      throw new Error("أحد متجهات القوة غير صالح.");
    }
    return;
  }

  if (spec.type === "flow_diagram") {
    if (!["linear_flow", "cycle_flow", "state_change"].includes(spec.variant ?? "")) {
      throw new Error("نوع مخطط العملية غير صالح.");
    }
    if (spec.labels.length < 3 || spec.labels.length > 7) {
      throw new Error("مخطط العملية يحتاج ثلاث مراحل إلى سبع مراحل.");
    }
  }
}

function validateAxes(spec: QuestionVisualSpec): void {
  if (!spec.xAxisLabel || !spec.yAxisLabel || spec.xMax <= spec.xMin || spec.yMax <= spec.yMin) {
    throw new Error("محاور الرسم البياني غير مكتملة أو غير صالحة.");
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function numberLabel(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
}

function axisCaption(label: string, unit: string): string {
  return unit ? `${label} (${unit})` : label;
}

function renderLineGraph(spec: QuestionVisualSpec): string {
  const width = 640;
  const height = 380;
  const left = 78;
  const right = 34;
  const top = 48;
  const bottom = 78;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (value: number) => left + ((value - spec.xMin) / (spec.xMax - spec.xMin)) * plotWidth;
  const y = (value: number) => top + plotHeight - ((value - spec.yMin) / (spec.yMax - spec.yMin)) * plotHeight;
  const grid = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    const gx = left + ratio * plotWidth;
    const gy = top + ratio * plotHeight;
    const xValue = spec.xMin + ratio * (spec.xMax - spec.xMin);
    const yValue = spec.yMax - ratio * (spec.yMax - spec.yMin);
    return `<line x1="${gx}" y1="${top}" x2="${gx}" y2="${top + plotHeight}" class="qv-grid"/><line x1="${left}" y1="${gy}" x2="${left + plotWidth}" y2="${gy}" class="qv-grid"/><text x="${gx}" y="${top + plotHeight + 23}" class="qv-tick" text-anchor="middle">${escapeXml(numberLabel(xValue))}</text><text x="${left - 12}" y="${gy + 4}" class="qv-tick" text-anchor="end">${escapeXml(numberLabel(yValue))}</text>`;
  }).join("");
  const groups: QuestionVisualSeries[] = spec.series.length
    ? spec.series
    : [{ label: spec.annotations[0] || "البيانات", points: spec.points }];
  const rendered = groups.map((series, seriesIndex) => {
    const ordered = [...series.points].sort((a, b) => a.x - b.x);
    const polyline = ordered.map((point) => `${x(point.x)},${y(point.y)}`).join(" ");
    const points = ordered.map((point) => `<circle cx="${x(point.x)}" cy="${y(point.y)}" r="4.2" class="qv-point qv-series-${seriesIndex}"/>${point.label ? `<text x="${x(point.x) + 7}" y="${y(point.y) - 8}" class="qv-point-label">${escapeXml(point.label)}</text>` : ""}`).join("");
    return `<polyline points="${polyline}" class="qv-line qv-series-${seriesIndex}"/>${points}`;
  }).join("");
  const legend = groups.length > 1
    ? groups.map((series, index) => `<g transform="translate(${left + index * 150} ${height - 35})"><line x1="0" y1="0" x2="32" y2="0" class="qv-line qv-series-${index}"/><text x="40" y="4" class="qv-legend">${escapeXml(series.label)}</text></g>`).join("")
    : "";
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="26" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${grid}<line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="qv-axis"/><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" class="qv-axis"/>${rendered}<text x="${left + plotWidth / 2}" y="${height - 50}" class="qv-axis-label" text-anchor="middle">${escapeXml(axisCaption(spec.xAxisLabel, spec.xAxisUnit))}</text><text x="18" y="${top + plotHeight / 2}" class="qv-axis-label" text-anchor="middle" transform="rotate(-90 18 ${top + plotHeight / 2})">${escapeXml(axisCaption(spec.yAxisLabel, spec.yAxisUnit))}</text>${legend}</svg>`;
}

function renderBarChart(spec: QuestionVisualSpec): string {
  const width = 640;
  const height = 360;
  const left = 78;
  const right = 28;
  const top = 45;
  const bottom = 74;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const y = (value: number) => top + plotHeight - ((value - spec.yMin) / (spec.yMax - spec.yMin)) * plotHeight;
  const grid = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    const gy = top + ratio * plotHeight;
    const value = spec.yMax - ratio * (spec.yMax - spec.yMin);
    return `<line x1="${left}" y1="${gy}" x2="${left + plotWidth}" y2="${gy}" class="qv-grid"/><text x="${left - 12}" y="${gy + 4}" class="qv-tick" text-anchor="end">${escapeXml(numberLabel(value))}</text>`;
  }).join("");
  const slot = plotWidth / spec.labels.length;
  const barWidth = Math.min(62, slot * 0.58);
  const bars = spec.labels.map((label, index) => {
    const value = spec.values[index] ?? spec.yMin;
    const x = left + index * slot + (slot - barWidth) / 2;
    const barTop = y(value);
    const barHeight = Math.max(1, top + plotHeight - barTop);
    return `<rect x="${x}" y="${barTop}" width="${barWidth}" height="${barHeight}" class="qv-bar"/><text x="${x + barWidth / 2}" y="${barTop - 7}" class="qv-value" text-anchor="middle">${escapeXml(numberLabel(value))}</text><text x="${x + barWidth / 2}" y="${top + plotHeight + 24}" class="qv-category" text-anchor="middle">${escapeXml(label)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="25" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${grid}<line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="qv-axis"/><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" class="qv-axis"/>${bars}<text x="18" y="${top + plotHeight / 2}" class="qv-axis-label" text-anchor="middle" transform="rotate(-90 18 ${top + plotHeight / 2})">${escapeXml(axisCaption(spec.yAxisLabel, spec.yAxisUnit))}</text></svg>`;
}

function renderPressureDiagram(spec: QuestionVisualSpec): string {
  const width = 640;
  const height = 360;
  const variant = spec.variant ?? "submerged_object";
  const liquidLabel = spec.labels[0] ?? "السائل";
  const objectLabel = spec.labels[1] ?? "الجسم";

  if (variant === "force_area") {
    const surfaceY = 250;
    const blockX = 245;
    const blockY = 150;
    const blockW = 150;
    const blockH = 80;
    const force = spec.values[0] ?? 80;
    const area = spec.values[1] ?? 0.02;
    const forceLabel = spec.role === "calculate" ? `القوة F = ${numberLabel(force)} N` : "القوة F";
    const areaLabel = spec.role === "calculate" ? `مساحة التلامس A = ${numberLabel(area)} m²` : "مساحة التلامس A";
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><line x1="120" y1="${surfaceY}" x2="520" y2="${surfaceY}" class="qv-surface"/><rect x="${blockX}" y="${blockY}" width="${blockW}" height="${blockH}" class="qv-object"/><text x="${blockX + blockW / 2}" y="${blockY + 45}" class="qv-object-label" text-anchor="middle">${escapeXml(objectLabel)}</text><line x1="${blockX + blockW / 2}" y1="80" x2="${blockX + blockW / 2}" y2="${blockY - 6}" class="qv-depth"/><path d="M ${blockX + blockW / 2 - 8} ${blockY - 16} L ${blockX + blockW / 2} ${blockY - 6} L ${blockX + blockW / 2 + 8} ${blockY - 16}" class="qv-depth"/><text x="${blockX + blockW / 2 + 18}" y="110" class="qv-annotation">${escapeXml(forceLabel)}</text><line x1="${blockX}" y1="${surfaceY + 35}" x2="${blockX + blockW}" y2="${surfaceY + 35}" class="qv-depth"/><path d="M ${blockX + 8} ${surfaceY + 29} L ${blockX} ${surfaceY + 35} L ${blockX + 8} ${surfaceY + 41} M ${blockX + blockW - 8} ${surfaceY + 29} L ${blockX + blockW} ${surfaceY + 35} L ${blockX + blockW - 8} ${surfaceY + 41}" class="qv-depth"/><text x="${blockX + blockW / 2}" y="${surfaceY + 58}" class="qv-annotation" text-anchor="middle">${escapeXml(areaLabel)}</text></svg>`;
  }

  const tankX = 145;
  const tankY = 56;
  const tankW = 350;
  const tankH = 245;
  const liquidLevel = spec.values[0] ?? 0.72;
  const liquidTop = tankY + tankH * (1 - liquidLevel);

  if (variant === "depth_comparison") {
    const depthOne = spec.values[1] ?? 0.34;
    const depthTwo = spec.values[2] ?? Math.min(0.82, depthOne + 0.32);
    const usable = tankY + tankH - liquidTop - 28;
    const yOne = liquidTop + depthOne * usable;
    const yTwo = liquidTop + depthTwo * usable;
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><path d="M ${tankX} ${tankY} V ${tankY + tankH} H ${tankX + tankW} V ${tankY}" class="qv-vessel"/><rect x="${tankX + 2}" y="${liquidTop}" width="${tankW - 4}" height="${tankY + tankH - liquidTop - 2}" class="qv-liquid"/><line x1="${tankX}" y1="${liquidTop}" x2="${tankX + tankW}" y2="${liquidTop}" class="qv-surface"/><circle cx="250" cy="${yOne}" r="18" class="qv-object"/><circle cx="390" cy="${yTwo}" r="18" class="qv-object"/><text x="250" y="${yOne + 4}" class="qv-object-label" text-anchor="middle">أ</text><text x="390" y="${yTwo + 4}" class="qv-object-label" text-anchor="middle">ب</text><line x1="205" y1="${liquidTop}" x2="205" y2="${yOne}" class="qv-depth"/><line x1="435" y1="${liquidTop}" x2="435" y2="${yTwo}" class="qv-depth"/><text x="195" y="${(liquidTop + yOne) / 2}" class="qv-annotation" text-anchor="end">h₁</text><text x="445" y="${(liquidTop + yTwo) / 2}" class="qv-annotation">h₂</text><text x="${tankX + 16}" y="${liquidTop + 26}" class="qv-liquid-label">${escapeXml(liquidLabel)}</text></svg>`;
  }

  if (variant === "liquid_column") {
    const columnX = 260;
    const columnY = 62;
    const columnW = 120;
    const columnH = 230;
    const fillTop = columnY + columnH * (1 - liquidLevel);
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><path d="M ${columnX} ${columnY} V ${columnY + columnH} H ${columnX + columnW} V ${columnY}" class="qv-vessel"/><rect x="${columnX + 2}" y="${fillTop}" width="${columnW - 4}" height="${columnY + columnH - fillTop - 2}" class="qv-liquid"/><line x1="${columnX}" y1="${fillTop}" x2="${columnX + columnW}" y2="${fillTop}" class="qv-surface"/><line x1="225" y1="${fillTop}" x2="225" y2="${columnY + columnH}" class="qv-depth"/><text x="210" y="${(fillTop + columnY + columnH) / 2}" class="qv-annotation" text-anchor="end">ارتفاع العمود h</text><circle cx="430" cy="${columnY + columnH - 18}" r="24" class="qv-component-fill"/><text x="430" y="${columnY + columnH - 12}" class="qv-meter" text-anchor="middle">P</text><line x1="${columnX + columnW}" y1="${columnY + columnH - 18}" x2="406" y2="${columnY + columnH - 18}" class="qv-wire"/><text x="${columnX + columnW / 2}" y="${fillTop + 28}" class="qv-liquid-label" text-anchor="middle">${escapeXml(liquidLabel)}</text></svg>`;
  }

  const objectDepth = spec.values[1] ?? 0.55;
  const objectY = liquidTop + objectDepth * (tankY + tankH - liquidTop - 24);
  const objectX = tankX + tankW * 0.58;
  const annotations = spec.annotations.slice(0, 3).map((text, index) => `<text x="505" y="${115 + index * 32}" class="qv-annotation" text-anchor="start">${escapeXml(text)}</text>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="26" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><path d="M ${tankX} ${tankY} V ${tankY + tankH} H ${tankX + tankW} V ${tankY}" class="qv-vessel"/><rect x="${tankX + 2}" y="${liquidTop}" width="${tankW - 4}" height="${tankY + tankH - liquidTop - 2}" class="qv-liquid"/><line x1="${tankX}" y1="${liquidTop}" x2="${tankX + tankW}" y2="${liquidTop}" class="qv-surface"/><circle cx="${objectX}" cy="${objectY}" r="18" class="qv-object"/><text x="${objectX}" y="${objectY + 4}" class="qv-object-label" text-anchor="middle">${escapeXml(objectLabel)}</text><line x1="${objectX - 54}" y1="${liquidTop}" x2="${objectX - 54}" y2="${objectY}" class="qv-depth"/><path d="M ${objectX - 60} ${liquidTop + 8} L ${objectX - 54} ${liquidTop} L ${objectX - 48} ${liquidTop + 8} M ${objectX - 60} ${objectY - 8} L ${objectX - 54} ${objectY} L ${objectX - 48} ${objectY - 8}" class="qv-depth"/><text x="${objectX - 68}" y="${(liquidTop + objectY) / 2}" class="qv-annotation" text-anchor="end">العمق h</text><text x="${tankX + 16}" y="${liquidTop + 28}" class="qv-liquid-label">${escapeXml(liquidLabel)}</text>${annotations}</svg>`;
}



function renderElectrostaticDiagram(spec: QuestionVisualSpec): string {
  const width = 640;
  const height = 360;
  const variant = spec.variant ?? "charge_transfer";
  const first = spec.labels[0] ?? "الجسم 1";
  const second = spec.labels[1] ?? "الجسم 2";

  if (variant === "electric_field") {
    const leftX = 210;
    const rightX = 430;
    const centerY = 190;
    const fieldLines = [-90, -55, -20, 20, 55, 90].map((offset, index) => {
      const curve = index < 3 ? -55 : 55;
      return `<path d="M ${leftX + 24} ${centerY + offset * .55} C ${320 - curve} ${centerY + offset}, ${320 + curve} ${centerY + offset}, ${rightX - 24} ${centerY + offset * .55}" class="qv-field-line" marker-end="url(#qv-arrow)"/>`;
    }).join("");
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><defs><marker id="qv-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="qv-arrow-fill"/></marker></defs><text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${fieldLines}<circle cx="${leftX}" cy="${centerY}" r="31" class="qv-charged-object"/><circle cx="${rightX}" cy="${centerY}" r="31" class="qv-charged-object"/><text x="${leftX}" y="${centerY + 8}" class="qv-charge-main" text-anchor="middle">+</text><text x="${rightX}" y="${centerY + 8}" class="qv-charge-main" text-anchor="middle">−</text><text x="${leftX}" y="${centerY + 58}" class="qv-annotation" text-anchor="middle">${escapeXml(first)}</text><text x="${rightX}" y="${centerY + 58}" class="qv-annotation" text-anchor="middle">${escapeXml(second)}</text></svg>`;
  }

  if (variant === "attraction_repulsion") {
    const leftX = 225;
    const rightX = 415;
    const centerY = 190;
    const unlike = (spec.values[0] ?? 0) >= 0.5;
    const secondSign = unlike ? "−" : "+";
    const arrows = unlike
      ? `<line x1="290" y1="${centerY}" x2="315" y2="${centerY}" class="qv-force-arrow" marker-end="url(#qv-force-head)"/><line x1="350" y1="${centerY}" x2="325" y2="${centerY}" class="qv-force-arrow" marker-end="url(#qv-force-head)"/>`
      : `<line x1="290" y1="${centerY}" x2="255" y2="${centerY}" class="qv-force-arrow" marker-end="url(#qv-force-head)"/><line x1="350" y1="${centerY}" x2="385" y2="${centerY}" class="qv-force-arrow" marker-end="url(#qv-force-head)"/>`;
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><defs><marker id="qv-force-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="qv-arrow-fill"/></marker></defs><text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><line x1="${leftX}" y1="85" x2="${leftX}" y2="150" class="qv-string"/><line x1="${rightX}" y1="85" x2="${rightX}" y2="150" class="qv-string"/><circle cx="${leftX}" cy="${centerY}" r="38" class="qv-charged-object"/><circle cx="${rightX}" cy="${centerY}" r="38" class="qv-charged-object"/><text x="${leftX}" y="${centerY + 10}" class="qv-charge-main" text-anchor="middle">+</text><text x="${rightX}" y="${centerY + 10}" class="qv-charge-main" text-anchor="middle">${secondSign}</text>${arrows}<text x="${leftX}" y="${centerY + 68}" class="qv-annotation" text-anchor="middle">${escapeXml(first)}</text><text x="${rightX}" y="${centerY + 68}" class="qv-annotation" text-anchor="middle">${escapeXml(second)}</text></svg>`;
  }

  const rodX = 160;
  const clothX = 390;
  const y = 170;
  const paperPieces = Array.from({ length: 6 }, (_, index) => {
    const px = 120 + index * 38;
    const py = 280 + (index % 2) * 13;
    return `<rect x="${px}" y="${py}" width="18" height="8" class="qv-paper-piece" transform="rotate(${index % 2 ? -12 : 10} ${px + 9} ${py + 4})"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><defs><marker id="qv-electron-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="qv-arrow-fill"/></marker></defs><text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><rect x="${rodX}" y="${y}" width="220" height="24" rx="12" class="qv-rod" transform="rotate(-8 ${rodX + 110} ${y + 12})"/><path d="M ${clothX} ${y - 35} q 50 -18 92 12 v 90 q -50 18 -96 -8 z" class="qv-cloth"/><path d="M ${clothX - 6} ${y + 2} C 350 ${y - 28}, 330 ${y - 14}, 300 ${y - 2}" class="qv-electron-arrow" marker-end="url(#qv-electron-head)"/><text x="335" y="${y - 32}" class="qv-annotation">اتجاه الدلك</text><text x="${rodX + 110}" y="${y + 65}" class="qv-annotation" text-anchor="middle">${escapeXml(first)}</text><text x="${clothX + 45}" y="${y + 88}" class="qv-annotation" text-anchor="middle">${escapeXml(second)}</text>${paperPieces}<text x="230" y="330" class="qv-annotation" text-anchor="middle">قصاصات ورق خفيفة</text></svg>`;
}

function renderDataTable(spec: QuestionVisualSpec): string {
  const width = 640;
  const rowHeight = 44;
  const top = 58;
  const left = 40;
  const right = 40;
  const rowLabelWidth = spec.tableRows.some(Boolean) ? 110 : 0;
  const tableWidth = width - left - right;
  const dataWidth = tableWidth - rowLabelWidth;
  const colWidth = dataWidth / spec.tableColumns.length;
  const height = top + rowHeight * (spec.tableRows.length + 1) + 44;
  const header = spec.tableColumns.map((column, index) => {
    const x = left + rowLabelWidth + index * colWidth;
    return `<rect x="${x}" y="${top}" width="${colWidth}" height="${rowHeight}" class="qv-table-head"/><text x="${x + colWidth / 2}" y="${top + 27}" class="qv-table-text qv-table-head-text" text-anchor="middle">${escapeXml(column)}</text>`;
  }).join("");
  const corner = rowLabelWidth ? `<rect x="${left}" y="${top}" width="${rowLabelWidth}" height="${rowHeight}" class="qv-table-head"/><text x="${left + rowLabelWidth / 2}" y="${top + 27}" class="qv-table-text qv-table-head-text" text-anchor="middle">الحالة</text>` : "";
  const rows = spec.tableRows.map((rowLabel, rowIndex) => {
    const y = top + (rowIndex + 1) * rowHeight;
    const label = rowLabelWidth ? `<rect x="${left}" y="${y}" width="${rowLabelWidth}" height="${rowHeight}" class="qv-table-row-head"/><text x="${left + rowLabelWidth / 2}" y="${y + 27}" class="qv-table-text" text-anchor="middle">${escapeXml(rowLabel)}</text>` : "";
    const cells = spec.tableColumns.map((_, colIndex) => {
      const x = left + rowLabelWidth + colIndex * colWidth;
      const key = `r${rowIndex}c${colIndex}`;
      const hidden = spec.hiddenCells.includes(key);
      const content = hidden ? "" : (spec.tableCells[rowIndex]?.[colIndex] ?? "");
      return `<rect x="${x}" y="${y}" width="${colWidth}" height="${rowHeight}" class="${hidden ? "qv-table-cell qv-table-missing" : "qv-table-cell"}"/>${hidden ? `<line x1="${x + 14}" y1="${y + 29}" x2="${x + colWidth - 14}" y2="${y + 29}" class="qv-answer-line"/>` : `<text x="${x + colWidth / 2}" y="${y + 27}" class="qv-table-text" text-anchor="middle">${escapeXml(content)}</text>`}`;
    }).join("");
    return `${label}${cells}`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${corner}${header}${rows}</svg>`;
}

function renderInstrumentScale(spec: QuestionVisualSpec): string {
  const width = 640;
  const height = 380;
  const [min = 0, max = 100, step = 10, reading = 50] = spec.values;
  const unit = spec.labels[1] ?? "";
  const device = spec.labels[0] ?? "جهاز قياس";
  const top = 58;
  const bottom = 318;
  const scaleHeight = bottom - top;
  const ratio = (reading - min) / (max - min);
  const inverted = spec.variant === "burette";
  const valueToY = (value: number) => inverted
    ? top + ((value - min) / (max - min)) * scaleHeight
    : bottom - ((value - min) / (max - min)) * scaleHeight;
  const tickCount = Math.max(2, Math.min(30, Math.round((max - min) / step)));
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = min + index * ((max - min) / tickCount);
    const y = valueToY(value);
    const major = index % Math.max(1, Math.round(tickCount / 5)) === 0;
    return `<line x1="${major ? 282 : 292}" y1="${y}" x2="320" y2="${y}" class="qv-scale-tick"/><text x="270" y="${y + 4}" class="qv-tick" text-anchor="end">${major ? escapeXml(numberLabel(value)) : ""}</text>`;
  }).join("");
  const readingY = valueToY(reading);
  const body = spec.variant === "thermometer"
    ? `<rect x="320" y="${top}" width="36" height="${scaleHeight}" rx="18" class="qv-instrument-body"/><circle cx="338" cy="330" r="25" class="qv-instrument-body"/><rect x="331" y="${readingY}" width="14" height="${330 - readingY}" rx="7" class="qv-instrument-fill"/>`
    : spec.variant === "measuring_cylinder"
      ? `<path d="M 315 ${top} V ${bottom} Q 315 340 338 340 Q 361 340 361 ${bottom} V ${top}" class="qv-instrument-body"/><rect x="318" y="${readingY}" width="40" height="${bottom - readingY}" class="qv-instrument-liquid"/><path d="M 318 ${readingY} Q 338 ${readingY + 8} 358 ${readingY}" class="qv-meniscus"/>`
      : spec.variant === "burette"
        ? `<rect x="326" y="${top}" width="24" height="${scaleHeight}" class="qv-instrument-body"/><line x1="338" y1="${bottom}" x2="338" y2="346" class="qv-instrument-body"/><line x1="318" y1="334" x2="358" y2="334" class="qv-instrument-body"/><rect x="329" y="${readingY}" width="18" height="${bottom - readingY}" class="qv-instrument-liquid"/><path d="M 329 ${readingY} Q 338 ${readingY + 5} 347 ${readingY}" class="qv-meniscus"/>`
        : `<path d="M 210 280 A 128 128 0 0 1 466 280" class="qv-meter-arc"/><line x1="338" y1="280" x2="${338 + 105 * Math.cos(Math.PI - ratio * Math.PI)}" y2="${280 - 105 * Math.sin(ratio * Math.PI)}" class="qv-meter-needle"/><circle cx="338" cy="280" r="7" class="qv-node"/>`;
  const horizontalScale = spec.variant === "meter_scale" ? Array.from({ length: 6 }, (_, i) => {
    const angle = Math.PI - (i / 5) * Math.PI;
    const x1 = 338 + 118 * Math.cos(angle);
    const y1 = 280 - 118 * Math.sin(angle);
    const x2 = 338 + 100 * Math.cos(angle);
    const y2 = 280 - 100 * Math.sin(angle);
    const value = min + (i / 5) * (max - min);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="qv-scale-tick"/><text x="${338 + 138 * Math.cos(angle)}" y="${284 - 138 * Math.sin(angle)}" class="qv-tick" text-anchor="middle">${escapeXml(numberLabel(value))}</text>`;
  }).join("") : ticks;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${body}${horizontalScale}<text x="470" y="90" class="qv-annotation">${escapeXml(device)}</text><text x="470" y="116" class="qv-annotation">الوحدة: ${escapeXml(unit || "—")}</text></svg>`;
}

function renderRayDiagram(spec: QuestionVisualSpec): string {
  const width = 640;
  const height = 360;
  const variant = spec.variant ?? "reflection";
  const marker = `qv-ray-${escapeXml(spec.visualId || "default")}`;
  const defs = `<defs><marker id="${marker}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="qv-arrow-fill"/></marker></defs>`;
  if (variant === "reflection") {
    const angle = Math.max(20, Math.min(70, spec.values[0] ?? 40));
    const dx = 150 * Math.sin(angle * Math.PI / 180);
    const dy = 150 * Math.cos(angle * Math.PI / 180);
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}">${defs}<text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><line x1="110" y1="250" x2="530" y2="250" class="qv-mirror"/><line x1="320" y1="70" x2="320" y2="300" class="qv-normal"/><line x1="${320 - dx}" y1="${250 - dy}" x2="320" y2="250" class="qv-ray" marker-end="url(#${marker})"/><line x1="320" y1="250" x2="${320 + dx}" y2="${250 - dy}" class="qv-ray" marker-end="url(#${marker})"/><text x="115" y="275" class="qv-annotation">مرآة مستوية</text><text x="330" y="88" class="qv-annotation">العمود المقام</text></svg>`;
  }
  if (variant === "refraction") {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}">${defs}<text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><line x1="90" y1="190" x2="550" y2="190" class="qv-boundary"/><line x1="320" y1="60" x2="320" y2="320" class="qv-normal"/><line x1="170" y1="75" x2="320" y2="190" class="qv-ray" marker-end="url(#${marker})"/><line x1="320" y1="190" x2="385" y2="310" class="qv-ray" marker-end="url(#${marker})"/><text x="500" y="165" class="qv-annotation">الوسط الأول</text><text x="500" y="225" class="qv-annotation">الوسط الثاني</text></svg>`;
  }
  if (variant === "converging_lens") {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}">${defs}<text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><line x1="70" y1="190" x2="570" y2="190" class="qv-principal-axis"/><path d="M 320 80 Q 275 190 320 300 Q 365 190 320 80" class="qv-lens"/><line x1="115" y1="125" x2="320" y2="125" class="qv-ray"/><line x1="320" y1="125" x2="500" y2="190" class="qv-ray" marker-end="url(#${marker})"/><line x1="115" y1="125" x2="320" y2="190" class="qv-ray"/><line x1="320" y1="190" x2="500" y2="245" class="qv-ray" marker-end="url(#${marker})"/><text x="332" y="70" class="qv-annotation">عدسة محدبة</text></svg>`;
  }
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}">${defs}<text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><path d="M 300 75 L 455 270 L 190 270 Z" class="qv-prism"/><line x1="80" y1="150" x2="275" y2="150" class="qv-ray" marker-end="url(#${marker})"/><line x1="275" y1="150" x2="410" y2="236" class="qv-ray"/><line x1="410" y1="236" x2="550" y2="280" class="qv-ray" marker-end="url(#${marker})"/><text x="310" y="315" class="qv-annotation" text-anchor="middle">منشور زجاجي</text></svg>`;
}

export function isAiIllustrationEligible(spec: QuestionVisualSpec): boolean {
  if (spec.type === "electrostatic_diagram" && spec.variant === "charge_transfer") {
    return !["calculate", "complete", "draw"].includes(spec.role ?? "read");
  }
  if (spec.type === "pressure_diagram" && spec.variant === "submerged_object") {
    return ["read", "interpret", "evaluate"].includes(spec.role ?? "read");
  }
  return false;
}

export function stripQuestionVisualIllustration(spec: QuestionVisualSpec): QuestionVisualSpec {
  const { illustration: _illustration, ...deterministic } = spec;
  return deterministic;
}

function renderForceDiagram(spec: QuestionVisualSpec): string {
  const width = 640;
  const height = 360;
  const marker = `qv-force-${escapeXml(spec.visualId || "default")}`;
  const vectors = spec.vectors.map((vector, index) => {
    const x1 = 320 + vector.x;
    const y1 = 190 + vector.y;
    const scale = Math.min(1.5, Math.max(0.55, vector.magnitude / 10));
    const x2 = x1 + vector.dx * scale;
    const y2 = y1 + vector.dy * scale;
    const vectorLabel = spec.role === "calculate"
      ? `${vector.label} (${numberLabel(vector.magnitude)} N)`
      : vector.label;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="qv-force-arrow qv-vector-${index}" marker-end="url(#${marker})"/><text x="${x2 + (vector.dx >= 0 ? 8 : -8)}" y="${y2 - 7}" class="qv-annotation" text-anchor="${vector.dx >= 0 ? "start" : "end"}">${escapeXml(vectorLabel)}</text>`;
  }).join("");
  const support = spec.variant === "moments"
    ? `<line x1="130" y1="230" x2="510" y2="230" class="qv-beam"/><path d="M 300 230 L 340 230 L 320 275 Z" class="qv-pivot"/><text x="320" y="302" class="qv-annotation" text-anchor="middle">نقطة الارتكاز</text>`
    : `<rect x="265" y="150" width="110" height="80" class="qv-object"/><text x="320" y="195" class="qv-object-label" text-anchor="middle">${escapeXml(spec.labels[0] ?? "الجسم")}</text><line x1="150" y1="230" x2="490" y2="230" class="qv-surface"/>`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><defs><marker id="${marker}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="qv-arrow-fill"/></marker></defs><text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${support}${vectors}</svg>`;
}

function renderFlowDiagram(spec: QuestionVisualSpec): string {
  const width = 640;
  const height = spec.variant === "cycle_flow" ? 420 : 330;
  const marker = `qv-flow-${escapeXml(spec.visualId || "default")}`;
  const node = (x: number, y: number, label: string, index: number) => `<rect x="${x - 62}" y="${y - 25}" width="124" height="50" rx="12" class="qv-flow-node"/><text x="${x}" y="${y + 5}" class="qv-flow-text" text-anchor="middle">${escapeXml(label || `المرحلة ${index + 1}`)}</text>`;
  if (spec.variant === "cycle_flow") {
    const cx = 320;
    const cy = 220;
    const radius = 125;
    const positions = spec.labels.map((_, index) => {
      const angle = -Math.PI / 2 + (index / spec.labels.length) * Math.PI * 2;
      return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    });
    const arrows = positions.map((position, index) => {
      const next = positions[(index + 1) % positions.length]!;
      return `<line x1="${position.x}" y1="${position.y}" x2="${next.x}" y2="${next.y}" class="qv-flow-arrow" marker-end="url(#${marker})"/>`;
    }).join("");
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><defs><marker id="${marker}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="qv-arrow-fill"/></marker></defs><text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${arrows}${positions.map((position, index) => node(position.x, position.y, spec.labels[index] ?? "", index)).join("")}</svg>`;
  }
  const positions = spec.labels.map((_, index) => ({ x: 90 + index * (460 / Math.max(1, spec.labels.length - 1)), y: 175 }));
  const arrows = positions.slice(0, -1).map((position, index) => {
    const next = positions[index + 1]!;
    return `<line x1="${position.x + 64}" y1="${position.y}" x2="${next.x - 70}" y2="${next.y}" class="qv-flow-arrow" marker-end="url(#${marker})"/>${spec.annotations[index] ? `<text x="${(position.x + next.x) / 2}" y="${position.y - 16}" class="qv-annotation" text-anchor="middle">${escapeXml(spec.annotations[index]!)}</text>` : ""}`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><defs><marker id="${marker}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="qv-arrow-fill"/></marker></defs><text x="${width / 2}" y="28" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${arrows}${positions.map((position, index) => node(position.x, position.y, spec.labels[index] ?? "", index)).join("")}</svg>`;
}

function circuitSymbol(component: CircuitComponent, x: number, y: number): string {
  switch (component) {
    case "battery":
      return `<g transform="translate(${x} ${y})"><line x1="-18" y1="-15" x2="-18" y2="15" class="qv-component"/><line x1="-8" y1="-24" x2="-8" y2="24" class="qv-component"/><text x="-30" y="-18" class="qv-symbol-label">−</text><text x="-2" y="-26" class="qv-symbol-label">+</text></g>`;
    case "switch_open":
      return `<g transform="translate(${x} ${y})"><circle cx="-18" cy="0" r="3" class="qv-node"/><circle cx="18" cy="0" r="3" class="qv-node"/><line x1="-15" y1="-2" x2="12" y2="-17" class="qv-component"/></g>`;
    case "switch_closed":
      return `<g transform="translate(${x} ${y})"><circle cx="-18" cy="0" r="3" class="qv-node"/><circle cx="18" cy="0" r="3" class="qv-node"/><line x1="-15" y1="0" x2="15" y2="0" class="qv-component"/></g>`;
    case "lamp":
      return `<g transform="translate(${x} ${y})"><circle cx="0" cy="0" r="21" class="qv-component-fill"/><line x1="-14" y1="-14" x2="14" y2="14" class="qv-component"/><line x1="14" y1="-14" x2="-14" y2="14" class="qv-component"/></g>`;
    case "resistor":
      return `<g transform="translate(${x} ${y})"><rect x="-28" y="-12" width="56" height="24" class="qv-component-fill"/></g>`;
    case "ammeter":
      return `<g transform="translate(${x} ${y})"><circle cx="0" cy="0" r="21" class="qv-component-fill"/><text x="0" y="7" class="qv-meter" text-anchor="middle">A</text></g>`;
    case "voltmeter":
      return `<g transform="translate(${x} ${y})"><circle cx="0" cy="0" r="21" class="qv-component-fill"/><text x="0" y="7" class="qv-meter" text-anchor="middle">V</text></g>`;
  }
}

function renderCircuitDiagram(spec: QuestionVisualSpec): string {
  const width = 640;
  const height = 360;
  const cx = width / 2;
  const cy = 185;
  const rx = 225;
  const ry = 105;
  const count = spec.components.length;
  const positions = spec.components.map((_, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
  const wires = positions.map((position, index) => {
    const next = positions[(index + 1) % positions.length]!;
    return `<line x1="${position.x}" y1="${position.y}" x2="${next.x}" y2="${next.y}" class="qv-wire"/>`;
  }).join("");
  const symbols = spec.components.map((component, index) => {
    const position = positions[index]!;
    return `${circuitSymbol(component, position.x, position.y)}${spec.annotations[index] ? `<text x="${position.x}" y="${position.y + 40}" class="qv-annotation" text-anchor="middle">${escapeXml(spec.annotations[index]!)}</text>` : ""}`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="27" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${wires}${symbols}</svg>`;
}

export function renderQuestionVisualSvg(spec: QuestionVisualSpec): string {
  validateQuestionVisualSpec(spec);
  if (spec.type === "none") return "";
  const svg = spec.type === "line_graph"
    ? renderLineGraph(spec)
    : spec.type === "bar_chart"
      ? renderBarChart(spec)
      : spec.type === "pressure_diagram"
        ? renderPressureDiagram(spec)
        : spec.type === "circuit_diagram"
          ? renderCircuitDiagram(spec)
          : spec.type === "electrostatic_diagram"
            ? renderElectrostaticDiagram(spec)
            : spec.type === "data_table"
              ? renderDataTable(spec)
              : spec.type === "instrument_scale"
                ? renderInstrumentScale(spec)
                : spec.type === "ray_diagram"
                  ? renderRayDiagram(spec)
                  : spec.type === "force_diagram"
                    ? renderForceDiagram(spec)
                    : renderFlowDiagram(spec);
  const media = spec.illustration?.validated && isAiIllustrationEligible(spec)
    ? `<div class="question-visual-hybrid" data-hybrid-visual="ready"><div class="question-visual-deterministic-fallback" aria-hidden="true">${svg}</div><img class="question-visual-illustration" src="${escapeXml(spec.illustration.url)}" alt="${escapeXml(spec.altText)}" loading="eager" decoding="async" crossorigin="anonymous"/></div>`
    : svg;
  const mode = spec.illustration?.validated && isAiIllustrationEligible(spec) ? "hybrid" : "deterministic";
  return `<figure class="question-visual question-visual-${spec.type} question-visual-${mode}" data-visual-id="${escapeXml(spec.visualId ?? "")}" data-visual-variant="${escapeXml(spec.variant ?? "default")}" data-visual-mode="${mode}">${media}<figcaption>${escapeXml(spec.altText)}</figcaption></figure>`;
}
