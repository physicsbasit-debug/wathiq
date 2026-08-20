import type {
  QuestionVisualPoint,
  QuestionVisualSeries,
  QuestionVisualSpec,
  QuestionVisualType,
} from "./types.js";

/**
 * Visual policy v0.3.18:
 * - data_table / line_graph / bar_chart remain deterministic because exact data must stay machine-owned.
 * - every other scientific illustration is normalized to context_scene and requires a reviewed 2D image asset.
 * - the previous schematic/line renderers are intentionally removed from runtime.
 */
export const QUESTION_VISUAL_TYPES: readonly QuestionVisualType[] = [
  "none",
  "context_scene",
  "line_graph",
  "bar_chart",
  "data_table",
];

const LEGACY_SCHEMATIC_VISUAL_TYPES = new Set([
  "pressure_diagram",
  "circuit_diagram",
  "electrostatic_diagram",
  "instrument_scale",
  "ray_diagram",
  "force_diagram",
  "flow_diagram",
]);

const STRUCTURED_EXACT_VISUAL_TYPES = new Set<QuestionVisualType>([
  "line_graph",
  "bar_chart",
  "data_table",
]);

const VISUAL_LABELS: Record<QuestionVisualType, string> = {
  none: "دون مرئي",
  context_scene: "رسم علمي ثنائي الأبعاد",
  line_graph: "رسم بياني خطي",
  bar_chart: "رسم أعمدة",
  data_table: "جدول بيانات علمي",
};

export function questionVisualTypeLabel(type: QuestionVisualType): string {
  return VISUAL_LABELS[type];
}

export function isQuestionVisualType(value: unknown): value is QuestionVisualType {
  return typeof value === "string" && (QUESTION_VISUAL_TYPES as readonly string[]).includes(value);
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
    annotations: [],
    tableColumns: [],
    tableRows: [],
    tableCells: [],
    hiddenCells: [],
  };
}

function normalizedVisualType(value: unknown): QuestionVisualType | null {
  if (isQuestionVisualType(value)) return value;
  // Read-only migration bridge for drafts created before v0.3.18.
  // Old schematic types are never generated or rendered again; they become reviewed 2D scenes.
  if (typeof value === "string" && LEGACY_SCHEMATIC_VISUAL_TYPES.has(value)) return "context_scene";
  return null;
}

export function parseQuestionVisualSpec(value: unknown, expectedType?: QuestionVisualType): QuestionVisualSpec {
  const record = asRecord(value);
  const type = normalizedVisualType(record?.type);
  if (!record || !type) throw new Error("مواصفة المرئي التعليمي غير صالحة.");
  if (expectedType && type !== expectedType) throw new Error("نوع المرئي لا يطابق النوع المتوقع.");

  // A legacy schematic illustration belongs to a new 2D asset job. Never reuse an old illustration implicitly.
  const migratedFromLegacy = typeof record.type === "string" && LEGACY_SCHEMATIC_VISUAL_TYPES.has(record.type);
  const illustration = migratedFromLegacy ? undefined : parseQuestionVisualIllustration(record.illustration);
  const spec: QuestionVisualSpec = {
    type,
    visualId: cleanText(record.visualId, 80),
    purpose: cleanText(record.purpose, 240) || cleanText(record.altText, 240),
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
    points: type === "context_scene" ? [] : cleanPoints(record.points),
    series: type === "context_scene" ? [] : cleanSeries(record.series),
    labels: type === "context_scene" ? [] : cleanTextArray(record.labels, 12),
    values: type === "context_scene" ? [] : cleanNumberArray(record.values, 12),
    annotations: type === "context_scene" ? [] : cleanTextArray(record.annotations, 12, 120),
    tableColumns: type === "data_table" ? cleanTextArray(record.tableColumns, 6, 80) : [],
    tableRows: type === "data_table" ? cleanTextArray(record.tableRows, 8, 80) : [],
    tableCells: type === "data_table" ? cleanStringMatrix(record.tableCells) : [],
    hiddenCells: type === "data_table" ? cleanTextArray(record.hiddenCells, 12, 16) : [],
    ...(illustration ? { illustration } : {}),
  };
  validateQuestionVisualSpec(spec);
  return spec;
}

export function diversifyQuestionVisualSpec(spec: QuestionVisualSpec, index: number, planItemId = ""): QuestionVisualSpec {
  return {
    ...spec,
    visualId: spec.visualId || (spec.type === "none" ? "" : `visual-${planItemId || index + 1}`),
    purpose: spec.purpose || spec.altText,
  };
}

export function validateQuestionVisualSpec(spec: QuestionVisualSpec): void {
  if (spec.type === "none") return;
  if (!spec.title || !spec.altText) throw new Error("المرئي التعليمي يحتاج عنوانًا ووصفًا بديلًا.");
  if (!STRUCTURED_EXACT_VISUAL_TYPES.has(spec.type)) return;

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

export function isAiIllustrationEligible(spec: QuestionVisualSpec): boolean {
  return spec.type === "context_scene";
}

export interface QuestionVisualExternalAsset {
  needed: boolean;
  mode: "replace" | null;
  assetKind: "scene_2d" | null;
}

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
      const note = "سيظهر المرئي بعد إنشائه واجتياز المراجعة العلمية والبصرية. لا يوجد مولد تخطيطي أو رسم خطي احتياطي.";
      return `<figure class="question-visual question-visual-${spec.type} question-visual-${mode}" data-visual-id="${escapeXml(spec.visualId ?? "")}" data-visual-mode="${mode}" data-visual-asset-kind="pending"><div class="question-visual-2d-placeholder" role="status" aria-label="${escapeXml(spec.altText)}"><strong>${title}</strong><span>${note}</span></div><figcaption>${escapeXml(spec.altText)}</figcaption></figure>`;
    }
    return `<figure class="question-visual question-visual-${spec.type} question-visual-illustrated" data-visual-id="${escapeXml(spec.visualId ?? "")}" data-visual-mode="illustrated" data-visual-asset-kind="scene_2d"><div class="question-visual-illustrated" data-hybrid-visual="ready"><img class="question-visual-illustration" src="${escapeXml(spec.illustration!.url)}" alt="${escapeXml(spec.altText)}" loading="eager" decoding="async" crossorigin="anonymous"/></div><figcaption>${escapeXml(spec.altText)}</figcaption></figure>`;
  }

  const body = spec.type === "line_graph"
    ? renderLineGraph(spec)
    : spec.type === "bar_chart"
      ? renderBarChart(spec)
      : renderDataTable(spec);
  return `<figure class="question-visual question-visual-${spec.type} question-visual-structured-exact" data-visual-id="${escapeXml(spec.visualId ?? "")}" data-visual-mode="structured-exact" data-visual-asset-kind="structured"><div class="question-visual-structured">${body}</div><figcaption>${escapeXml(spec.altText)}</figcaption></figure>`;
}

export function renderQuestionVisualForPaper(spec: QuestionVisualSpec): string {
  validateQuestionVisualSpec(spec);
  if (spec.type === "none") return "";
  if (isAiIllustrationEligible(spec) && !isValidated2DIllustration(spec)) return "";
  return renderQuestionVisualSvg(spec);
}
