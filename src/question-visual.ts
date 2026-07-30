import type {
  CircuitComponent,
  QuestionVisualPoint,
  QuestionVisualSpec,
  QuestionVisualType,
} from "./types.js";

export const QUESTION_VISUAL_TYPES: readonly QuestionVisualType[] = [
  "none",
  "line_graph",
  "bar_chart",
  "pressure_diagram",
  "circuit_diagram",
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

const VISUAL_LABELS: Record<QuestionVisualType, string> = {
  none: "دون رسم",
  line_graph: "رسم بياني خطي",
  bar_chart: "رسم أعمدة",
  pressure_diagram: "مخطط ضغط ثنائي الأبعاد",
  circuit_diagram: "دائرة كهربائية مبسطة",
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

export function emptyQuestionVisualSpec(): QuestionVisualSpec {
  return {
    type: "none",
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
    labels: [],
    values: [],
    components: [],
    annotations: [],
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

  const spec: QuestionVisualSpec = {
    type: record.type,
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
    labels: cleanTextArray(record.labels, 10),
    values: cleanNumberArray(record.values, 10),
    components: Array.isArray(record.components)
      ? record.components.filter(isCircuitComponent).slice(0, 7)
      : [],
    annotations: cleanTextArray(record.annotations, 8, 100),
  };

  validateQuestionVisualSpec(spec);
  return spec;
}

export function validateQuestionVisualSpec(spec: QuestionVisualSpec): void {
  if (spec.type === "none") return;
  if (!spec.title || !spec.altText) throw new Error("الرسم التعليمي يحتاج عنوانًا ووصفًا بديلًا.");

  if (spec.type === "line_graph") {
    validateAxes(spec);
    if (spec.points.length < 2 || spec.points.length > 10) {
      throw new Error("الرسم الخطي يحتاج نقطتين إلى عشر نقاط.");
    }
    if (spec.points.some((point) => point.x < spec.xMin || point.x > spec.xMax || point.y < spec.yMin || point.y > spec.yMax)) {
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
      throw new Error("مخطط الضغط يحتاج اسم السائل والجسم ومستوى السائل وعمق الجسم.");
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
  const height = 360;
  const left = 78;
  const right = 28;
  const top = 45;
  const bottom = 66;
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
  const ordered = [...spec.points].sort((a, b) => a.x - b.x);
  const polyline = ordered.map((point) => `${x(point.x)},${y(point.y)}`).join(" ");
  const points = ordered.map((point) => `<circle cx="${x(point.x)}" cy="${y(point.y)}" r="4.5" class="qv-point"/>${point.label ? `<text x="${x(point.x) + 7}" y="${y(point.y) - 8}" class="qv-point-label">${escapeXml(point.label)}</text>` : ""}`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="25" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text>${grid}<line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="qv-axis"/><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" class="qv-axis"/><polyline points="${polyline}" class="qv-line"/>${points}<text x="${left + plotWidth / 2}" y="${height - 12}" class="qv-axis-label" text-anchor="middle">${escapeXml(axisCaption(spec.xAxisLabel, spec.xAxisUnit))}</text><text x="18" y="${top + plotHeight / 2}" class="qv-axis-label" text-anchor="middle" transform="rotate(-90 18 ${top + plotHeight / 2})">${escapeXml(axisCaption(spec.yAxisLabel, spec.yAxisUnit))}</text></svg>`;
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
  const tankX = 150;
  const tankY = 55;
  const tankW = 330;
  const tankH = 245;
  const liquidLevel = spec.values[0] ?? 0.65;
  const objectDepth = spec.values[1] ?? 0.55;
  const liquidTop = tankY + tankH * (1 - liquidLevel);
  const objectY = liquidTop + objectDepth * (tankY + tankH - liquidTop - 24);
  const objectX = tankX + tankW * 0.58;
  const liquidLabel = spec.labels[0] ?? "السائل";
  const objectLabel = spec.labels[1] ?? "الجسم";
  const annotations = spec.annotations.slice(0, 3).map((text, index) => `<text x="505" y="${115 + index * 32}" class="qv-annotation" text-anchor="start">${escapeXml(text)}</text>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.altText)}"><text x="${width / 2}" y="26" class="qv-title" text-anchor="middle">${escapeXml(spec.title)}</text><path d="M ${tankX} ${tankY} V ${tankY + tankH} H ${tankX + tankW} V ${tankY}" class="qv-vessel"/><rect x="${tankX + 2}" y="${liquidTop}" width="${tankW - 4}" height="${tankY + tankH - liquidTop - 2}" class="qv-liquid"/><line x1="${tankX}" y1="${liquidTop}" x2="${tankX + tankW}" y2="${liquidTop}" class="qv-surface"/><circle cx="${objectX}" cy="${objectY}" r="18" class="qv-object"/><text x="${objectX}" y="${objectY + 4}" class="qv-object-label" text-anchor="middle">${escapeXml(objectLabel)}</text><line x1="${objectX - 54}" y1="${liquidTop}" x2="${objectX - 54}" y2="${objectY}" class="qv-depth"/><path d="M ${objectX - 60} ${liquidTop + 8} L ${objectX - 54} ${liquidTop} L ${objectX - 48} ${liquidTop + 8} M ${objectX - 60} ${objectY - 8} L ${objectX - 54} ${objectY} L ${objectX - 48} ${objectY - 8}" class="qv-depth"/><text x="${objectX - 68}" y="${(liquidTop + objectY) / 2}" class="qv-annotation" text-anchor="end">العمق h</text><text x="${tankX + 16}" y="${liquidTop + 28}" class="qv-liquid-label">${escapeXml(liquidLabel)}</text>${annotations}</svg>`;
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
        : renderCircuitDiagram(spec);
  return `<figure class="question-visual question-visual-${spec.type}">${svg}<figcaption>${escapeXml(spec.altText)}</figcaption></figure>`;
}
