import type {
  CircuitComponent,
  QuestionVisualAnchor,
  QuestionVisualDimension,
  QuestionVisualPoint,
  QuestionVisualSegment,
  QuestionVisualSeries,
  QuestionVisualSpec,
  QuestionVisualType,
  QuestionVisualVector,
} from "./types.js";

/**
 * Visual policy after the quality reset:
 * - data_table / line_graph / bar_chart / instrument_scale are exact, deterministic renderings.
 * - every other non-none visual is an illustrative scientific asset and must be a validated 2D image.
 * - لا يوجد بديل رسومي خطي؛ المرئيات التوضيحية تستخدم أصلًا علميًا ثنائي الأبعاد مدققًا.
 */
export const QUESTION_VISUAL_TYPES: readonly QuestionVisualType[] = [
  "none",
  "context_scene",
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

export const CIRCUIT_COMPONENTS: readonly CircuitComponent[] = [
  "battery",
  "switch_open",
  "switch_closed",
  "lamp",
  "resistor",
  "motor",
  "ammeter",
  "voltmeter",
];

const STRUCTURED_EXACT_VISUAL_TYPES = new Set<QuestionVisualType>([
  "line_graph",
  "bar_chart",
  "data_table",
  "instrument_scale",
  "pressure_diagram",
  "circuit_diagram",
  "electrostatic_diagram",
  "ray_diagram",
  "force_diagram",
  "flow_diagram",
]);

const VISUAL_LABELS: Record<QuestionVisualType, string> = {
  none: "دون مرئي",
  context_scene: "رسم علمي ثنائي الأبعاد",
  line_graph: "رسم بياني خطي",
  bar_chart: "رسم أعمدة",
  pressure_diagram: "رسم علمي للضغط",
  circuit_diagram: "رسم علمي لدائرة كهربائية",
  electrostatic_diagram: "رسم علمي للكهرباء الساكنة",
  data_table: "جدول بيانات علمي",
  instrument_scale: "تدريج جهاز قياس",
  ray_diagram: "رسم علمي للبصريات",
  force_diagram: "رسم علمي للقوى والحركة",
  flow_diagram: "رسم علمي لعملية أو تسلسل",
};

export function questionVisualTypeLabel(type: QuestionVisualType): string {
  return VISUAL_LABELS[type];
}

export function isQuestionVisualType(value: unknown): value is QuestionVisualType {
  return typeof value === "string" && (QUESTION_VISUAL_TYPES as readonly string[]).includes(value);
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
  return {
    url,
    assetPath,
    mimeType,
    model,
    generatedAt,
    promptVersion,
    validated: true,
    assetKind: "scene_2d",
    renderMode: "replace",
  };
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
  return value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)).slice(0, maxItems);
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
    const points = cleanPoints(record.points);
    if (points.length < 2) return [];
    return [{ label: cleanText(record.label, 50), points }];
  }).slice(0, 4);
}

function cleanStringMatrix(value: unknown, maxRows = 8, maxColumns = 6): string[][] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxRows).flatMap((row) => Array.isArray(row)
    ? [[...row.slice(0, maxColumns).map((cell) => cleanText(cell, 80))]]
    : []);
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
      unit: cleanText(record.unit, 16),
    }];
  }).slice(0, 8);
}

function normalizedCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function cleanAnchors(value: unknown): QuestionVisualAnchor[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(["pivot", "point", "support", "object"]);
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record || typeof record.kind !== "string" || !allowed.has(record.kind)) return [];
    const x = normalizedCoordinate(record.x);
    const y = normalizedCoordinate(record.y);
    if (x === null || y === null) return [];
    return [{ kind: record.kind as QuestionVisualAnchor["kind"], label: cleanText(record.label, 40), x, y }];
  }).slice(0, 10);
}

function cleanSegments(value: unknown): QuestionVisualSegment[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(["rod", "surface", "path"]);
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record || typeof record.kind !== "string" || !allowed.has(record.kind)) return [];
    const x1 = normalizedCoordinate(record.x1);
    const y1 = normalizedCoordinate(record.y1);
    const x2 = normalizedCoordinate(record.x2);
    const y2 = normalizedCoordinate(record.y2);
    if (x1 === null || y1 === null || x2 === null || y2 === null || (x1 === x2 && y1 === y2)) return [];
    return [{ kind: record.kind as QuestionVisualSegment["kind"], label: cleanText(record.label, 50), x1, y1, x2, y2 }];
  }).slice(0, 10);
}

function cleanDimensions(value: unknown): QuestionVisualDimension[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) return [];
    const x1 = normalizedCoordinate(record.x1);
    const y1 = normalizedCoordinate(record.y1);
    const x2 = normalizedCoordinate(record.x2);
    const y2 = normalizedCoordinate(record.y2);
    const valueNumber = typeof record.value === "number" && Number.isFinite(record.value) && record.value >= 0 ? record.value : null;
    if (x1 === null || y1 === null || x2 === null || y2 === null || valueNumber === null || (x1 === x2 && y1 === y2)) return [];
    return [{ label: cleanText(record.label, 40), value: valueNumber, unit: cleanText(record.unit, 16), x1, y1, x2, y2 }];
  }).slice(0, 10);
}

export function emptyQuestionVisualSpec(): QuestionVisualSpec {
  return {
    type: "none",
    visualId: "",
    purpose: "",
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
    anchors: [],
    segments: [],
    dimensions: [],
  };
}

export function parseQuestionVisualSpec(value: unknown, expectedType?: QuestionVisualType): QuestionVisualSpec {
  const record = asRecord(value);
  if (!record || !isQuestionVisualType(record.type)) throw new Error("مواصفة المرئي التعليمي غير صالحة.");
  if (expectedType && record.type !== expectedType) throw new Error("نوع المرئي لا يطابق النوع المتوقع.");

  const illustration = parseQuestionVisualIllustration(record.illustration);
  const spec: QuestionVisualSpec = {
    type: record.type,
    visualId: cleanText(record.visualId, 80),
    purpose: cleanText(record.purpose, 240),
    title: cleanText(record.title),
    altText: cleanText(record.altText, 320),
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
    values: cleanNumberArray(record.values, 12),
    components: Array.isArray(record.components) ? record.components.filter(isCircuitComponent).slice(0, 8) : [],
    annotations: cleanTextArray(record.annotations, 12, 120),
    tableColumns: cleanTextArray(record.tableColumns, 6, 80),
    tableRows: cleanTextArray(record.tableRows, 8, 80),
    tableCells: cleanStringMatrix(record.tableCells),
    hiddenCells: cleanTextArray(record.hiddenCells, 12, 16),
    vectors: cleanVectors(record.vectors),
    anchors: cleanAnchors(record.anchors),
    segments: cleanSegments(record.segments),
    dimensions: cleanDimensions(record.dimensions),
    ...(illustration ? { illustration } : {}),
  };
  validateQuestionVisualSpec(spec);
  return spec;
}

export function diversifyQuestionVisualSpec(spec: QuestionVisualSpec, index: number, planItemId = ""): QuestionVisualSpec {
  // يحتفظ واثق بوصف المرئي نفسه دون فرض سيناريو أو قالب تاريخي.
  return {
    ...spec,
    visualId: spec.visualId || (spec.type === "none" ? "" : `visual-${planItemId || index + 1}`),
    purpose: spec.purpose || spec.altText,
  };
}

export function validateQuestionVisualSpec(spec: QuestionVisualSpec): void {
  if (spec.type === "none") return;
  if (!spec.title || !spec.altText) throw new Error("المرئي التعليمي يحتاج عنوانًا ووصفًا بديلًا.");

  // المشهد السياقي الحر فقط يذهب إلى نموذج الصور. أما المخططات العلمية فترسم من بيانات دلالية صريحة.
  if (!STRUCTURED_EXACT_VISUAL_TYPES.has(spec.type)) return;

  if (spec.type === "force_diagram") {
    if (!spec.vectors.length || spec.vectors.length > 8) throw new Error("رسم القوى يحتاج متجه قوة واحدًا على الأقل.");
    if (spec.vectors.some((vector) => !vector.label || (!vector.dx && !vector.dy) || vector.magnitude < 0)) {
      throw new Error("متجهات القوى تحتاج تسمية واتجاهًا وقيمة صالحة.");
    }
    if (spec.segments.length && spec.segments.some((segment) => !segment.label && segment.kind === "rod")) {
      throw new Error("الساق أو القضيب في الرسم الميكانيكي يحتاج وصفًا دلاليًا.");
    }
    if (spec.anchors.some((anchor) => anchor.kind === "pivot" && !anchor.label)) {
      throw new Error("نقطة الارتكاز في الرسم الميكانيكي تحتاج تسمية واضحة.");
    }
    return;
  }

  if (spec.type === "circuit_diagram") {
    if (spec.components.length < 2) throw new Error("رسم الدائرة يحتاج مكونين على الأقل.");
    return;
  }

  if (spec.type === "electrostatic_diagram") {
    if (spec.labels.length < 2) throw new Error("رسم الكهرباء الساكنة يحتاج جسمين مسميين على الأقل.");
    return;
  }

  if (spec.type === "ray_diagram") {
    if (!spec.vectors.length) throw new Error("رسم الأشعة يحتاج مسار شعاع واحدًا على الأقل.");
    return;
  }

  if (spec.type === "pressure_diagram") {
    if (spec.labels.length < 2) throw new Error("رسم الضغط يحتاج موضعين أو عنصرين واضحين على الأقل.");
    return;
  }

  if (spec.type === "flow_diagram") {
    if (spec.labels.length < 2) throw new Error("مخطط التسلسل يحتاج مرحلتين على الأقل.");
    return;
  }

  if (spec.type === "line_graph") {
    validateAxes(spec);
    const groups = spec.series.length ? spec.series.map((series) => series.points) : [spec.points];
    if (groups.length < 1 || groups.length > 4 || groups.some((points) => points.length < 2 || points.length > 10)) {
      throw new Error("الرسم الخطي يحتاج بيانات صالحة.");
    }
    if (groups.flat().some((point) => point.x < spec.xMin || point.x > spec.xMax || point.y < spec.yMin || point.y > spec.yMax)) {
      throw new Error("إحدى نقاط الرسم الخطي خارج نطاق المحاور.");
    }
    return;
  }

  if (spec.type === "bar_chart") {
    if (!spec.yAxisLabel || spec.yMax <= spec.yMin) throw new Error("رسم الأعمدة يحتاج محورًا رأسيًا صالحًا.");
    const graphPoints = spec.series[0]?.points ?? spec.points;
    const hasCategoricalValues = spec.labels.length >= 2 && spec.values.length === spec.labels.length;
    if (!hasCategoricalValues && graphPoints.length < 2) throw new Error("رسم الأعمدة يحتاج بيانات صالحة.");
    return;
  }

  if (spec.type === "data_table") {
    if (spec.tableColumns.length < 2 || spec.tableColumns.length > 6) throw new Error("جدول البيانات يحتاج عمودين إلى ستة أعمدة.");
    if (spec.tableRows.length < 2 || spec.tableRows.length > 8 || spec.tableCells.length !== spec.tableRows.length) {
      throw new Error("جدول البيانات يحتاج صفوفًا متسقة.");
    }
    if (spec.tableCells.some((row) => row.length !== spec.tableColumns.length)) throw new Error("عدد خلايا الجدول لا يطابق عدد الأعمدة.");
    if (spec.hiddenCells.some((key) => !/^r\d+c\d+$/u.test(key))) throw new Error("موضع خلية مخفية غير صالح.");
    return;
  }

  if (spec.type === "instrument_scale") {
    if (spec.values.length < 4) throw new Error("تدريج الجهاز يحتاج الحد الأدنى والأعلى والخطوة والقراءة.");
    const [min, max, step, reading] = spec.values;
    if (min === undefined || max === undefined || step === undefined || reading === undefined
      || max <= min || step <= 0 || reading < min || reading > max) throw new Error("قيم تدريج جهاز القياس غير صالحة.");
  }
}

function validateAxes(spec: QuestionVisualSpec): void {
  if (!spec.xAxisLabel || !spec.yAxisLabel || spec.xMax <= spec.xMin || spec.yMax <= spec.yMin) {
    throw new Error("محاور الرسم البياني غير مكتملة أو غير صالحة.");
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function numberLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toString();
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
  const groups: QuestionVisualSeries[] = spec.series.length ? spec.series : [{ label: spec.annotations[0] || "البيانات", points: spec.points }];
  const rendered = groups.map((series, seriesIndex) => {
    const ordered = [...series.points].sort((a, b) => a.x - b.x);
    const polyline = ordered.map((point) => `${x(point.x)},${y(point.y)}`).join(" ");
    const points = ordered.map((point) => `<circle cx="${x(point.x)}" cy="${y(point.y)}" r="4.2" class="qv-point qv-series-${seriesIndex}"/>`).join("");
    return `<polyline points="${polyline}" class="qv-line qv-series-${seriesIndex}"/>${points}`;
  }).join("");
  const legend = groups.length > 1
    ? groups.map((series, index) => `<g transform="translate(${left + index * 150} ${height - 35})"><line x1="0" y1="0" x2="32" y2="0" class="qv-line qv-series-${index}"/><text x="40" y="4" class="qv-legend">${escapeXml(series.label)}</text></g>`).join("")
    : "";
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="26" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${grid}<line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="qv-axis"/><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" class="qv-axis"/>${rendered}<text x="${left + plotWidth / 2}" y="${height - 47}" class="qv-axis-label" text-anchor="middle">${escapeXml(axisCaption(spec.xAxisLabel, spec.xAxisUnit))}</text><text x="22" y="${top + plotHeight / 2}" class="qv-axis-label" text-anchor="middle" transform="rotate(-90 22 ${top + plotHeight / 2})">${escapeXml(axisCaption(spec.yAxisLabel, spec.yAxisUnit))}</text>${legend}</svg>`;
}

function renderBarChart(spec: QuestionVisualSpec): string {
  const width = 640;
  const height = 380;
  const left = 76;
  const top = 50;
  const bottom = 82;
  const plotHeight = height - top - bottom;
  const points = spec.series[0]?.points ?? spec.points;
  const labels = spec.labels.length ? spec.labels : points.map((point) => point.label || numberLabel(point.x));
  const values = spec.values.length ? spec.values : points.map((point) => point.y);
  const count = Math.min(labels.length, values.length);
  const plotWidth = width - left - 34;
  const slot = plotWidth / Math.max(1, count);
  const barWidth = Math.max(24, slot * 0.58);
  const yMax = spec.yMax > spec.yMin ? spec.yMax : Math.max(1, ...values);
  const y = (value: number) => top + plotHeight - ((value - spec.yMin) / (yMax - spec.yMin || 1)) * plotHeight;
  const bars = Array.from({ length: count }, (_, index) => {
    const value = values[index] ?? 0;
    const x = left + slot * index + (slot - barWidth) / 2;
    const topY = y(value);
    return `<rect x="${x}" y="${topY}" width="${barWidth}" height="${Math.max(0, top + plotHeight - topY)}" class="qv-bar"/><text x="${x + barWidth / 2}" y="${top + plotHeight + 24}" class="qv-tick" text-anchor="middle">${escapeXml(labels[index] ?? "")}</text><text x="${x + barWidth / 2}" y="${Math.max(16, topY - 8)}" class="qv-point-label" text-anchor="middle">${escapeXml(numberLabel(value))}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="26" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="qv-axis"/><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" class="qv-axis"/>${bars}<text x="22" y="${top + plotHeight / 2}" class="qv-axis-label" text-anchor="middle" transform="rotate(-90 22 ${top + plotHeight / 2})">${escapeXml(axisCaption(spec.yAxisLabel, spec.yAxisUnit))}</text></svg>`;
}

function renderDataTable(spec: QuestionVisualSpec): string {
  const headers = spec.tableColumns.map((column) => `<th>${escapeXml(column)}</th>`).join("");
  const rows = spec.tableRows.map((rowLabel, rowIndex) => {
    const cells = spec.tableCells[rowIndex] ?? [];
    return `<tr>${cells.map((cell, columnIndex) => {
      const key = `r${rowIndex + 1}c${columnIndex + 1}`;
      const value = spec.hiddenCells.includes(key) ? "…" : cell;
      const heading = columnIndex === 0 && rowLabel ? `${rowLabel}: ${value}` : value;
      return `<td>${escapeXml(heading)}</td>`;
    }).join("")}</tr>`;
  }).join("");
  return `<div class="qv-data-table" role="img" aria-label="${escapeXml(spec.altText)}"><strong class="qv-table-title">${escapeXml(spec.title)}</strong><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderInstrumentScale(spec: QuestionVisualSpec): string {
  const [min = 0, max = 100, step = 10, reading = 50] = spec.values;
  const width = 640;
  const height = 280;
  const left = 90;
  const right = 90;
  const axisWidth = width - left - right;
  const ticks: string[] = [];
  const count = Math.min(30, Math.floor((max - min) / step) + 1);
  for (let index = 0; index < count; index += 1) {
    const value = min + index * step;
    const x = left + ((value - min) / (max - min)) * axisWidth;
    ticks.push(`<line x1="${x}" y1="120" x2="${x}" y2="145" class="qv-scale-tick"/><text x="${x}" y="170" class="qv-tick" text-anchor="middle">${escapeXml(numberLabel(value))}</text>`);
  }
  const readingX = left + ((reading - min) / (max - min)) * axisWidth;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="32" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><line x1="${left}" y1="132" x2="${width - right}" y2="132" class="qv-axis"/>${ticks.join("")}<line x1="${readingX}" y1="78" x2="${readingX}" y2="145" class="qv-reading"/><text x="${readingX}" y="64" class="qv-point-label" text-anchor="middle">${escapeXml(numberLabel(reading))}</text></svg>`;
}


function vectorCaption(vector: QuestionVisualVector): string {
  const value = vector.magnitude > 0 ? ` ${numberLabel(vector.magnitude)}${vector.unit ? ` ${vector.unit}` : ""}` : "";
  return `${vector.label}${value}`.trim();
}

function renderForceDiagram(spec: QuestionVisualSpec): string {
  const width = 720;
  const height = 420;
  const plot = { left: 82, top: 72, width: 556, height: 270 };
  const sx = (x: number) => plot.left + (Math.max(0, Math.min(100, x)) / 100) * plot.width;
  const sy = (y: number) => plot.top + (Math.max(0, Math.min(100, y)) / 100) * plot.height;
  const markerId = `arrow-${escapeXml(spec.visualId || "force")}`;
  const dimensionMarkerId = `dimension-${escapeXml(spec.visualId || "force")}`;
  const maxMagnitude = Math.max(1, ...spec.vectors.map((vector) => Math.abs(vector.magnitude)));

  const segments = spec.segments.map((segment) => {
    const x1 = sx(segment.x1); const y1 = sy(segment.y1); const x2 = sx(segment.x2); const y2 = sy(segment.y2);
    const className = segment.kind === "rod" ? "qv-mechanics-rod" : segment.kind === "surface" ? "qv-mechanics-surface" : "qv-mechanics-path";
    const midX = (x1 + x2) / 2; const midY = (y1 + y2) / 2;
    return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${className}"/>${segment.label ? `<text x="${midX}" y="${midY - 12}" class="qv-semantic-label" text-anchor="middle">${escapeXml(segment.label)}</text>` : ""}</g>`;
  }).join("");

  const anchors = spec.anchors.map((anchor) => {
    const x = sx(anchor.x); const y = sy(anchor.y);
    if (anchor.kind === "pivot") {
      return `<g class="qv-mechanics-pivot"><path d="M ${x - 18} ${y + 24} L ${x + 18} ${y + 24} L ${x} ${y} Z"/><line x1="${x - 26}" y1="${y + 27}" x2="${x + 26}" y2="${y + 27}"/><text x="${x}" y="${y + 50}" class="qv-semantic-label" text-anchor="middle">${escapeXml(anchor.label)}</text></g>`;
    }
    const radius = anchor.kind === "object" ? 13 : 6;
    return `<g><circle cx="${x}" cy="${y}" r="${radius}" class="qv-mechanics-anchor"/><text x="${x + 12}" y="${y - 10}" class="qv-semantic-label">${escapeXml(anchor.label)}</text></g>`;
  }).join("");

  const dimensions = spec.dimensions.map((dimension) => {
    const x1 = sx(dimension.x1); const y1 = sy(dimension.y1); const x2 = sx(dimension.x2); const y2 = sy(dimension.y2);
    const label = `${dimension.label}${dimension.value > 0 ? `${dimension.label ? " = " : ""}${numberLabel(dimension.value)}${dimension.unit ? ` ${dimension.unit}` : ""}` : ""}`;
    return `<g class="qv-mechanics-dimension"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-start="url(#${dimensionMarkerId})" marker-end="url(#${dimensionMarkerId})"/><line x1="${x1}" y1="${y1 - 7}" x2="${x1}" y2="${y1 + 7}"/><line x1="${x2}" y1="${y2 - 7}" x2="${x2}" y2="${y2 + 7}"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 10}" class="qv-semantic-value" text-anchor="middle">${escapeXml(label)}</text></g>`;
  }).join("");

  const vectors = spec.vectors.map((vector, index) => {
    const norm = Math.hypot(vector.dx, vector.dy) || 1;
    const ux = vector.dx / norm; const uy = vector.dy / norm;
    const length = vector.magnitude > 0 ? 76 + 86 * Math.min(1, Math.abs(vector.magnitude) / maxMagnitude) : 118;
    const startX = sx(vector.x); const startY = sy(vector.y);
    const endX = startX + ux * length; const endY = startY - uy * length;
    const mostlyVertical = Math.abs(uy) > Math.abs(ux) * 1.4;
    const labelX = mostlyVertical ? endX : endX + (ux >= 0 ? 12 : -12);
    const labelY = mostlyVertical ? endY + (uy >= 0 ? -18 : 26) : endY - 10;
    const anchor = mostlyVertical ? "middle" : ux >= 0 ? "start" : "end";
    const value = vector.magnitude > 0 ? `${numberLabel(vector.magnitude)}${vector.unit ? ` ${vector.unit}` : ""}` : "";
    return `<g class="qv-semantic-vector qv-semantic-vector-${index}"><line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" class="qv-semantic-arrow" marker-end="url(#${markerId})"/><text x="${labelX}" y="${labelY}" class="qv-semantic-label" text-anchor="${anchor}">${escapeXml(vector.label)}</text>${value ? `<text x="${labelX}" y="${labelY + 16}" class="qv-semantic-value" text-anchor="${anchor}">${escapeXml(value)}</text>` : ""}</g>`;
  }).join("");

  const genericBody = spec.segments.length || spec.anchors.length
    ? ""
    : `<g class="qv-semantic-body"><rect x="300" y="190" width="120" height="70" rx="12"/><circle cx="325" cy="272" r="13"/><circle cx="395" cy="272" r="13"/></g>`;
  const note = spec.annotations[0] ? `<text x="${width / 2}" y="${height - 20}" class="qv-semantic-note" text-anchor="middle">${escapeXml(spec.annotations[0])}</text>` : "";
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><defs><marker id="${markerId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="qv-semantic-arrowhead"/></marker><marker id="${dimensionMarkerId}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 10 0 L 0 5 L 10 10" class="qv-dimension-arrowhead"/></marker></defs><text x="${width / 2}" y="30" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${genericBody}${segments}${anchors}${dimensions}${vectors}${note}</svg>`;
}

function renderFlowDiagram(spec: QuestionVisualSpec): string {
  const width = 720;
  const height = 320;
  const labels = spec.labels.slice(0, 6);
  const gap = 18;
  const boxWidth = Math.min(150, (width - 80 - gap * Math.max(0, labels.length - 1)) / Math.max(1, labels.length));
  const total = labels.length * boxWidth + Math.max(0, labels.length - 1) * gap;
  const start = (width - total) / 2;
  const boxes = labels.map((label, index) => {
    const x = start + index * (boxWidth + gap);
    const arrow = index < labels.length - 1 ? `<line x1="${x + boxWidth}" y1="160" x2="${x + boxWidth + gap - 4}" y2="160" class="qv-semantic-link" marker-end="url(#flow-arrow)"/>` : "";
    return `<g><rect x="${x}" y="118" width="${boxWidth}" height="84" rx="12" class="qv-semantic-box"/><text x="${x + boxWidth / 2}" y="158" class="qv-semantic-label" text-anchor="middle">${escapeXml(label)}</text>${arrow}</g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="qv-semantic-arrowhead"/></marker></defs><text x="${width / 2}" y="30" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${boxes}</svg>`;
}

function renderElectrostaticDiagram(spec: QuestionVisualSpec): string {
  const width = 720;
  const height = 340;
  const left = spec.labels[0] || "الجسم 1";
  const right = spec.labels[1] || "الجسم 2";
  const leftCharge = spec.annotations[0] || "";
  const rightCharge = spec.annotations[1] || "";
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="30" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><circle cx="235" cy="170" r="68" class="qv-semantic-object"/><circle cx="485" cy="170" r="68" class="qv-semantic-object"/><text x="235" y="165" class="qv-semantic-charge" text-anchor="middle">${escapeXml(leftCharge)}</text><text x="485" y="165" class="qv-semantic-charge" text-anchor="middle">${escapeXml(rightCharge)}</text><text x="235" y="265" class="qv-semantic-label" text-anchor="middle">${escapeXml(left)}</text><text x="485" y="265" class="qv-semantic-label" text-anchor="middle">${escapeXml(right)}</text></svg>`;
}

function renderRayDiagram(spec: QuestionVisualSpec): string {
  const width = 720;
  const height = 380;
  const markerId = `ray-${escapeXml(spec.visualId || "ray")}`;
  const rays = spec.vectors.map((vector) => {
    const x1 = 70 + Math.max(0, Math.min(100, vector.x)) / 100 * 580;
    const y1 = 70 + Math.max(0, Math.min(100, vector.y)) / 100 * 240;
    const norm = Math.hypot(vector.dx, vector.dy) || 1;
    const x2 = x1 + (vector.dx / norm) * 180;
    const y2 = y1 - (vector.dy / norm) * 180;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="qv-ray" marker-end="url(#${markerId})"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 10}" class="qv-semantic-label" text-anchor="middle">${escapeXml(vector.label)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><defs><marker id="${markerId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="qv-semantic-arrowhead"/></marker></defs><text x="${width / 2}" y="30" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><line x1="70" y1="190" x2="650" y2="190" class="qv-optical-axis"/>${rays}</svg>`;
}

function circuitSymbol(component: string, x: number, y: number): string {
  if (component === "battery") return `<g transform="translate(${x} ${y})"><line x1="-10" y1="-22" x2="-10" y2="22" class="qv-circuit-line"/><line x1="10" y1="-14" x2="10" y2="14" class="qv-circuit-line"/><text x="0" y="46" class="qv-semantic-label" text-anchor="middle">بطارية</text></g>`;
  if (component === "lamp") return `<g transform="translate(${x} ${y})"><circle r="24" class="qv-circuit-symbol"/><line x1="-14" y1="-14" x2="14" y2="14" class="qv-circuit-line"/><line x1="14" y1="-14" x2="-14" y2="14" class="qv-circuit-line"/><text x="0" y="48" class="qv-semantic-label" text-anchor="middle">مصباح</text></g>`;
  if (component === "resistor") return `<g transform="translate(${x} ${y})"><rect x="-30" y="-13" width="60" height="26" class="qv-circuit-symbol"/><text x="0" y="43" class="qv-semantic-label" text-anchor="middle">مقاومة</text></g>`;
  if (component === "motor") return `<g transform="translate(${x} ${y})"><circle r="24" class="qv-circuit-symbol"/><text x="0" y="6" class="qv-circuit-letter" text-anchor="middle">M</text><text x="0" y="48" class="qv-semantic-label" text-anchor="middle">محرك</text></g>`;
  if (component === "ammeter" || component === "voltmeter") { const letter = component === "ammeter" ? "A" : "V"; const label = component === "ammeter" ? "أميتر" : "فولتميتر"; return `<g transform="translate(${x} ${y})"><circle r="24" class="qv-circuit-symbol"/><text x="0" y="6" class="qv-circuit-letter" text-anchor="middle">${letter}</text><text x="0" y="48" class="qv-semantic-label" text-anchor="middle">${label}</text></g>`; }
  if (component === "switch_open" || component === "switch_closed") { const closed = component === "switch_closed"; return `<g transform="translate(${x} ${y})"><circle cx="-24" cy="0" r="4" class="qv-circuit-node"/><circle cx="24" cy="0" r="4" class="qv-circuit-node"/><line x1="-20" y1="0" x2="${closed ? 20 : 12}" y2="${closed ? 0 : -20}" class="qv-circuit-line"/><text x="0" y="43" class="qv-semantic-label" text-anchor="middle">مفتاح</text></g>`; }
  return "";
}

function renderCircuitDiagram(spec: QuestionVisualSpec): string {
  const width = 720;
  const height = 400;
  const components = spec.components.slice(0, 8);
  const count = components.length;
  const spacing = 540 / Math.max(1, count);
  const symbols = components.map((component, index) => circuitSymbol(component, 100 + spacing * (index + 0.5), 130)).join("");
  const wire = `<path d="M 80 130 H 640 V 285 H 80 Z" class="qv-circuit-line"/>`;
  const note = spec.annotations[0] ? `<text x="360" y="345" class="qv-semantic-note" text-anchor="middle">${escapeXml(spec.annotations[0])}</text>` : "";
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="30" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${wire}${symbols}${note}</svg>`;
}

function renderPressureDiagram(spec: QuestionVisualSpec): string {
  const width = 720;
  const height = 400;
  const labels = spec.labels.slice(0, 4);
  const values = spec.values.slice(0, labels.length);
  const marks = labels.map((label, index) => {
    const y = 120 + index * (190 / Math.max(1, labels.length - 1));
    const value = values[index];
    return `<line x1="180" y1="${y}" x2="540" y2="${y}" class="qv-depth-line"/><circle cx="360" cy="${y}" r="8" class="qv-depth-point"/><text x="565" y="${y + 4}" class="qv-semantic-label">${escapeXml(label)}${value !== undefined ? `: ${escapeXml(numberLabel(value))}` : ""}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="30" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><rect x="170" y="80" width="380" height="250" rx="8" class="qv-fluid-container"/><line x1="170" y1="110" x2="550" y2="110" class="qv-fluid-surface"/>${marks}</svg>`;
}

export function isAiIllustrationEligible(spec: QuestionVisualSpec): boolean {
  // الصورة الحرة مخصصة للمشهد السياقي فقط؛ البيانات والعلاقات العلمية الدقيقة ترسم حتميًا.
  return spec.type === "context_scene";
}

export interface QuestionVisualExternalAsset {
  needed: boolean;
  mode: "replace" | null;
  assetKind: "scene_2d" | null;
}

/**
 * القرار البصري واحد فقط:
 * - type=none: لا يوجد مرئي.
 * - الأنواع المنظمة: يرسمها واثق مباشرة من البيانات.
 * - context_scene: يحتاج أصل صورة 2D خارجيًا ثم مراجعة واعتماد.
 * لا توجد طبقة ضرورة مستقلة عن نوع المرئي.
 */
export function questionVisualExternalAsset(spec: QuestionVisualSpec): QuestionVisualExternalAsset {
  const needed = isAiIllustrationEligible(spec);
  return {
    needed,
    mode: needed ? "replace" : null,
    assetKind: needed ? "scene_2d" : null,
  };
}

export function stripQuestionVisualIllustration(spec: QuestionVisualSpec): QuestionVisualSpec {
  const { illustration: _illustration, ...rest } = spec;
  return rest;
}

function isValidated2DIllustration(spec: QuestionVisualSpec): boolean {
  return Boolean(spec.illustration?.validated && spec.illustration.url?.startsWith("https://"));
}

export function renderQuestionVisualSvg(spec: QuestionVisualSpec): string {
  validateQuestionVisualSpec(spec);
  if (spec.type === "none") return "";

  if (isAiIllustrationEligible(spec)) {
    if (!isValidated2DIllustration(spec)) {
      const mode = "2d-requested";
      const title = "الأصل العلمي ثنائي الأبعاد غير جاهز بعد";
      const note = "سيظهر المرئي بعد إنشائه واجتياز المراجعة العلمية والبصرية. لا يوجد رسم خطي احتياطي.";
      return `<figure class="question-visual question-visual-${spec.type} question-visual-${mode}" data-visual-id="${escapeXml(spec.visualId ?? "")}" data-visual-mode="${mode}" data-visual-asset-kind="pending"><div class="question-visual-2d-placeholder" role="status" aria-label="${escapeXml(spec.altText)}"><strong>${title}</strong><span>${note}</span></div><figcaption>${escapeXml(spec.altText)}</figcaption></figure>`;
    }
    return `<figure class="question-visual question-visual-${spec.type} question-visual-illustrated" data-visual-id="${escapeXml(spec.visualId ?? "")}" data-visual-mode="illustrated" data-visual-asset-kind="scene_2d"><div class="question-visual-illustrated" data-hybrid-visual="ready"><img class="question-visual-illustration" src="${escapeXml(spec.illustration!.url)}" alt="${escapeXml(spec.altText)}" loading="eager" decoding="async" crossorigin="anonymous"/></div><figcaption>${escapeXml(spec.altText)}</figcaption></figure>`;
  }

  const body = spec.type === "line_graph"
    ? renderLineGraph(spec)
    : spec.type === "bar_chart"
      ? renderBarChart(spec)
      : spec.type === "data_table"
        ? renderDataTable(spec)
        : spec.type === "instrument_scale"
          ? renderInstrumentScale(spec)
          : spec.type === "force_diagram"
            ? renderForceDiagram(spec)
            : spec.type === "flow_diagram"
              ? renderFlowDiagram(spec)
              : spec.type === "electrostatic_diagram"
                ? renderElectrostaticDiagram(spec)
                : spec.type === "ray_diagram"
                  ? renderRayDiagram(spec)
                  : spec.type === "circuit_diagram"
                    ? renderCircuitDiagram(spec)
                    : renderPressureDiagram(spec);
  return `<figure class="question-visual question-visual-${spec.type} question-visual-structured-exact" data-visual-id="${escapeXml(spec.visualId ?? "")}" data-visual-mode="structured-exact" data-visual-asset-kind="structured"><div class="question-visual-structured">${body}</div><figcaption>${escapeXml(spec.altText)}</figcaption></figure>`;
}

/**
 * إخراج الطالب/التصدير لا يعرض أبدًا صندوق فشل أو انتظار بصري.
 * المرئي التوضيحي يظهر فقط بعد اعتماد أصل 2D، بينما الرسوم الحتمية تبقى قابلة للطباعة فورًا.
 */
export function renderQuestionVisualForPaper(spec: QuestionVisualSpec): string {
  validateQuestionVisualSpec(spec);
  if (spec.type === "none") return "";
  if (isAiIllustrationEligible(spec) && !isValidated2DIllustration(spec)) return "";
  return renderQuestionVisualSvg(spec);
}
