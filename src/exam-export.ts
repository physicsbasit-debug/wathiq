export type ExportDocumentKind = "student" | "answer";

export function interleaveAssessmentItems<T>(
  items: readonly T[],
  isMultipleChoice: (item: T) => boolean,
): T[] {
  const multipleChoice = items.filter(isMultipleChoice);
  const constructed = items.filter((item) => !isMultipleChoice(item));
  if (!multipleChoice.length || !constructed.length) return [...items];

  const result: T[] = [];
  let mcqIndex = 0;
  let constructedIndex = 0;
  while (mcqIndex < multipleChoice.length || constructedIndex < constructed.length) {
    if (mcqIndex < multipleChoice.length) {
      const item = multipleChoice[mcqIndex];
      if (item !== undefined) result.push(item);
      mcqIndex += 1;
    }
    if (constructedIndex < constructed.length) {
      const item = constructed[constructedIndex];
      if (item !== undefined) result.push(item);
      constructedIndex += 1;
    }
  }
  return result;
}

export function hasAvoidableAdjacentMultipleChoice<T>(
  items: readonly T[],
  isMultipleChoice: (item: T) => boolean,
): boolean {
  const constructedCount = items.filter((item) => !isMultipleChoice(item)).length;
  const multipleChoiceCount = items.length - constructedCount;
  if (multipleChoiceCount > constructedCount + 1) return false;
  return items.some((item, index) => index > 0 && isMultipleChoice(item) && isMultipleChoice(items[index - 1]!));
}

export function safeExportFileName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 90) || "اختبار_واثق";
}

const EXPORT_STYLES = `
  @page { size: A4; margin: 13mm 14mm 15mm; }
  * { box-sizing: border-box; }
  html { direction: rtl; }
  body { margin: 0; font-family: Tahoma, Arial, sans-serif; color: #111; background: #fff; font-size: 13px; line-height: 1.75; }
  .export-document { width: 100%; max-width: 190mm; margin: 0 auto; }
  .paper-header { display: grid; grid-template-columns: 26mm 1fr; gap: 5mm; align-items: center; }
  .ministry-mark, .wathiq-paper-mark { border: 1.5px solid #222; min-height: 20mm; display: grid; place-items: center; text-align: center; font-size: 12px; font-weight: 800; }
  .paper-header > div:last-child { display: grid; gap: 1mm; text-align: center; }
  .paper-header strong { font-size: 15px; }
  .paper-title { text-align: center; margin: 8mm 0 4mm; }
  .paper-title h2 { margin: 0 0 2mm; font-size: 20px; }
  .paper-title p { margin: 0; }
  .student-row { border-top: 1px solid #222; border-bottom: 1px solid #222; padding: 2mm 0; display: flex; justify-content: space-between; gap: 4mm; font-size: 10px; }
  .paper-questions { display: grid; gap: 6mm; margin-top: 6mm; }
  .standalone-question, .structured-question, .paper-question, .paper-subpart { break-inside: avoid; page-break-inside: avoid; }
  .structured-question { border-top: 1px solid #9aa4b0; padding-top: 3mm; }
  .structured-question-header { display: grid; grid-template-columns: auto 1fr auto; gap: 3mm; font-weight: 700; margin-bottom: 3mm; }
  .paper-question-title { display: grid; grid-template-columns: auto 1fr auto; gap: 2mm; align-items: start; }
  .paper-stimulus { margin: 1.5mm 4mm; padding: 2mm; border: 1px solid #ccd5df; border-radius: 3mm; background: #f8fafc; }
  .paper-options { margin: 3mm 7mm 0; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 7mm; }
  .paper-options li { display: flex; gap: 2mm; align-items: center; }
  .paper-option-circle { width: 4mm; height: 4mm; border: 1px solid #222; border-radius: 50%; flex: 0 0 4mm; }
  .answer-lines { display: grid; gap: 4mm; margin: 3mm 7mm 0; }
  .answer-lines span { border-bottom: 1px solid #333; min-height: 4mm; }
  .working-note { margin: 2mm 7mm 0; font-size: 10px; font-weight: 700; }
  .plan-shared-visual { margin: 2mm 5mm; padding: 1.5mm; border: 1px solid #aab3bd; border-radius: 3mm; break-inside: avoid; page-break-inside: avoid; }
  .visual-heading { display: none; }
  .question-visual { margin: 0 auto; max-width: 165mm; }
  .question-visual svg, .question-visual-raster { display: block; width: 100%; height: auto; max-height: 70mm; margin: 0 auto; font-family: Tahoma, Arial, sans-serif; direction: ltr; }
  .question-visual-illustrated { position: relative; width: 100%; aspect-ratio: 4 / 3; max-height: 70mm; overflow: hidden; background: #fff; }
  .question-visual-illustration { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: contain; background: #fff; }
  .question-visual figcaption { display: none; text-align: center; font-size: 9px; margin-top: 1mm; }
  .qv-title { font-size: 16px; font-weight: 800; fill: #172b45; direction: rtl; unicode-bidi: plaintext; }
  .qv-axis, .qv-component, .qv-wire, .qv-vessel, .qv-depth, .qv-surface { fill: none; stroke: #182536; stroke-width: 2; }
  .qv-grid { stroke: #c9ced5; stroke-width: 1; }
  .qv-tick, .qv-value, .qv-category, .qv-axis-label, .qv-point-label, .qv-annotation, .qv-liquid-label, .qv-symbol-label { fill: #26384e; font-size: 11px; }
  .qv-line { fill: none; stroke: #122f54; stroke-width: 2.5; }
  .qv-point, .qv-node { fill: #fff; stroke: #122f54; stroke-width: 2; }
  .qv-bar, .qv-liquid { fill: #e8edf2; stroke: #172b45; stroke-width: 1.2; }
  .qv-object, .qv-component-fill { fill: #fff; stroke: #172b45; stroke-width: 2; }
  .qv-object-label, .qv-meter { fill: #172b45; font-weight: 700; }
  .qv-charged-object, .qv-cloth, .qv-rod, .qv-paper-piece, .qv-instrument-body, .qv-meter-arc, .qv-meniscus, .qv-mirror, .qv-boundary, .qv-normal, .qv-principal-axis, .qv-lens, .qv-prism, .qv-beam, .qv-pivot { fill: #fff; stroke: #182536; stroke-width: 2; }
  .qv-charge-main, .qv-table-text, .qv-table-head-text, .qv-flow-text, .qv-legend { fill: #26384e; font-size: 11px; }
  .qv-electron-arrow, .qv-field-line, .qv-scale-tick, .qv-meter-needle, .qv-ray, .qv-force-arrow, .qv-flow-arrow, .qv-answer-line { fill: none; stroke: #172b45; stroke-width: 2; }
  .qv-table-head, .qv-table-row-head { fill: #eef2f6; stroke: #182536; stroke-width: 1.2; }
  .qv-table-cell, .qv-flow-node { fill: #fff; stroke: #182536; stroke-width: 1; }
  .qv-table-missing { fill: #fafafa; stroke-dasharray: 4 3; }
  .qv-instrument-liquid, .qv-instrument-fill { fill: #dbe4ef; stroke: none; }
  .qv-normal { stroke-dasharray: 5 4; }
  .qv-series-1, .qv-vector-1 { stroke-dasharray: 9 5; }
  .qv-series-2, .qv-vector-2 { stroke-dasharray: 3 4; }
  .qv-series-3, .qv-vector-3 { stroke-dasharray: 12 4 2 4; }
  .qv-context-object, .qv-context-panel, .qv-context-instrument, .qv-context-flask, .qv-context-hole, .qv-context-wheel, .qv-context-person, .qv-context-sun { fill: #fff; stroke: #182536; stroke-width: 3; }
  .qv-context-hole { fill: none; }
  .qv-context-wheel { fill: #f8fafc; }
  .qv-context-person { fill: #eef3f8; }
  .qv-context-sun { fill: #f4e6b5; }
  .qv-context-panel { fill: #e8eef7; }
  .qv-context-instrument { fill: #eef3f8; }
  .qv-context-flask { fill: #e8f4f3; }
  .qv-context-line, .qv-context-grid, .qv-context-emphasis, .qv-context-motion, .qv-context-road-line, .qv-dimension { fill: none; stroke: #182536; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .qv-context-emphasis { stroke-width: 6; }
  .qv-context-motion { stroke-dasharray: 8 7; }
  .qv-context-grid, .qv-dimension { stroke-width: 1.5; }
  .qv-dimension { stroke-dasharray: 5 4; }
  .qv-context-road { fill: #f2f4f7; stroke: #182536; stroke-width: 3; }
  .qv-context-road-line { stroke-dasharray: 12 10; }

  .qv-charged-object { fill: #dbeafe; stroke: #1e3a5f; stroke-width: 2.5; }
  .qv-charge-object-two { fill: #fce7f3; }
  .qv-charge-highlight { fill: rgba(255,255,255,.72); stroke: none; }
  .qv-charge-main { fill: #173b6d; font-size: 22px; font-weight: 900; }
  .qv-string { stroke: #64748b; stroke-width: 2; }
  .qv-rod { fill: #7dd3fc; stroke: #164e63; stroke-width: 2.5; }
  .qv-rod-highlight { fill: rgba(255,255,255,.65); stroke: none; }
  .qv-cloth { fill: #fda4af; stroke: #881337; stroke-width: 2; }
  .qv-paper-piece { fill: #fef3c7; stroke: #92400e; stroke-width: 1.4; }
  .qv-force-body { fill: #dbeafe; stroke: #173b6d; stroke-width: 2.5; }
  .qv-force-pocket { fill: #bfdbfe; stroke: #173b6d; stroke-width: 1.5; }
  .qv-force-wheel { fill: #334155; stroke: #0f172a; stroke-width: 2; }
  .qv-force-detail { fill: none; stroke: #173b6d; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .qv-force-crate-cross { stroke-width: 1.6; opacity: .45; }
  .qv-force-ground { stroke: #64748b; stroke-width: 2.5; }
  .qv-context-object { fill: #e0f2fe; stroke: #173b6d; }
  .qv-context-panel { fill: #bfdbfe; stroke: #173b6d; }
  .qv-context-instrument { fill: #d1fae5; stroke: #166534; }
  .qv-context-flask { fill: #ccfbf1; stroke: #0f766e; }
  .qv-context-wheel { fill: #334155; stroke: #0f172a; }
  .qv-context-person { fill: #fed7aa; stroke: #9a3412; }
  .qv-context-sun { fill: #fde68a; stroke: #a16207; }
  .qv-context-road { fill: #e2e8f0; stroke: #334155; }
  .qv-context-emphasis { stroke: #c2410c; }
  .qv-context-motion { stroke: #0369a1; }
  .paper-footer { text-align: center; margin-top: 8mm; }
  .teacher-key { margin-top: 10mm; break-before: page; page-break-before: always; }
  .teacher-key h2 { text-align: center; border-bottom: 2px solid #173b6d; padding-bottom: 3mm; }
  .teacher-key article { border-bottom: 1px solid #ccd5df; padding: 4mm 0; break-inside: avoid; }
  .teacher-key-head { display: flex; justify-content: space-between; gap: 4mm; }
  .teacher-key ol { margin: 2mm 7mm; }
  .teacher-key blockquote { margin: 2mm 0; padding: 2mm 3mm; border-right: 3px solid #8298b2; background: #f7f9fb; }
  .approval-stamp, .draft-stamp { margin: 5mm auto; padding: 2mm; text-align: center; font-weight: 800; white-space: nowrap; }
  .approval-stamp { color: #17583f; }
  .draft-stamp { color: #8a4f08; border: 1px dashed #b77a25; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

export interface StandaloneExamDocumentInput {
  title: string;
  bodyHtml: string;
  kind: ExportDocumentKind;
  approvedAt?: string;
}

export function buildStandaloneExamDocument(input: StandaloneExamDocumentInput): string {
  const approval = input.approvedAt
    ? `<div class="approval-stamp">نسخة معتمدة بتاريخ ${input.approvedAt}</div>`
    : `<div class="draft-stamp">نسخة مسودة غير معتمدة للمراجعة</div>`;
  return `<!doctype html><html lang="ar" dir="rtl" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="ProgId" content="Word.Document"/><meta name="Generator" content="واثق"/><title>${input.title}</title><style>${EXPORT_STYLES}</style></head><body><main class="export-document" data-export-kind="${input.kind}">${approval}${input.bodyHtml}</main></body></html>`;
}

const SVG_RASTER_STYLES = `
  text { font-family: Tahoma, Arial, sans-serif; }
  .qv-title { font-size: 16px; font-weight: 800; fill: #172b45; direction: rtl; unicode-bidi: plaintext; }
  .qv-axis, .qv-component, .qv-wire, .qv-vessel, .qv-depth, .qv-surface { fill: none; stroke: #182536; stroke-width: 2; }
  .qv-grid { stroke: #d2d7dd; stroke-width: 1; }
  .qv-tick, .qv-value, .qv-category, .qv-axis-label, .qv-point-label, .qv-annotation, .qv-liquid-label, .qv-symbol-label { fill: #26384e; font-size: 11px; }
  .qv-axis-label { font-size: 12px; font-weight: 700; }
  .qv-line { fill: none; stroke: #122f54; stroke-width: 2.5; }
  .qv-point, .qv-node { fill: #fff; stroke: #122f54; stroke-width: 2; }
  .qv-bar, .qv-liquid { fill: #e8edf2; stroke: #172b45; stroke-width: 1.2; }
  .qv-object, .qv-component-fill { fill: #fff; stroke: #172b45; stroke-width: 2; }
  .qv-object-label, .qv-meter { fill: #172b45; font-weight: 700; }
  .qv-charged-object, .qv-cloth, .qv-rod, .qv-paper-piece, .qv-instrument-body, .qv-meter-arc, .qv-meniscus, .qv-mirror, .qv-boundary, .qv-normal, .qv-principal-axis, .qv-lens, .qv-prism, .qv-beam, .qv-pivot { fill: #fff; stroke: #182536; stroke-width: 2; }
  .qv-charge-main, .qv-table-text, .qv-table-head-text, .qv-flow-text, .qv-legend { fill: #26384e; font-size: 11px; }
  .qv-electron-arrow, .qv-field-line, .qv-scale-tick, .qv-meter-needle, .qv-ray, .qv-force-arrow, .qv-flow-arrow, .qv-answer-line { fill: none; stroke: #172b45; stroke-width: 2; }
  .qv-table-head, .qv-table-row-head { fill: #eef2f6; stroke: #182536; stroke-width: 1.2; }
  .qv-table-cell, .qv-flow-node { fill: #fff; stroke: #182536; stroke-width: 1; }
  .qv-table-missing { fill: #fafafa; stroke-dasharray: 4 3; }
  .qv-instrument-liquid, .qv-instrument-fill { fill: #dbe4ef; stroke: none; }
  .qv-normal { stroke-dasharray: 5 4; }
  .qv-series-1, .qv-vector-1 { stroke-dasharray: 9 5; }
  .qv-series-2, .qv-vector-2 { stroke-dasharray: 3 4; }
  .qv-series-3, .qv-vector-3 { stroke-dasharray: 12 4 2 4; }
  .qv-context-object, .qv-context-panel, .qv-context-instrument, .qv-context-flask, .qv-context-hole, .qv-context-wheel, .qv-context-person, .qv-context-sun { fill: #fff; stroke: #182536; stroke-width: 3; }
  .qv-context-hole { fill: none; }
  .qv-context-wheel { fill: #f8fafc; }
  .qv-context-person { fill: #eef3f8; }
  .qv-context-sun { fill: #f4e6b5; }
  .qv-context-panel { fill: #e8eef7; }
  .qv-context-instrument { fill: #eef3f8; }
  .qv-context-flask { fill: #e8f4f3; }
  .qv-context-line, .qv-context-grid, .qv-context-emphasis, .qv-context-motion, .qv-context-road-line, .qv-dimension { fill: none; stroke: #182536; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .qv-context-emphasis { stroke-width: 6; }
  .qv-context-motion { stroke-dasharray: 8 7; }
  .qv-context-grid, .qv-dimension { stroke-width: 1.5; }
  .qv-dimension { stroke-dasharray: 5 4; }
  .qv-context-road { fill: #f2f4f7; stroke: #182536; stroke-width: 3; }
  .qv-context-road-line { stroke-dasharray: 12 10; }

  .qv-charged-object { fill: #dbeafe; stroke: #1e3a5f; stroke-width: 2.5; }
  .qv-charge-object-two { fill: #fce7f3; }
  .qv-charge-highlight { fill: rgba(255,255,255,.72); stroke: none; }
  .qv-charge-main { fill: #173b6d; font-size: 22px; font-weight: 900; }
  .qv-string { stroke: #64748b; stroke-width: 2; }
  .qv-rod { fill: #7dd3fc; stroke: #164e63; stroke-width: 2.5; }
  .qv-rod-highlight { fill: rgba(255,255,255,.65); stroke: none; }
  .qv-cloth { fill: #fda4af; stroke: #881337; stroke-width: 2; }
  .qv-paper-piece { fill: #fef3c7; stroke: #92400e; stroke-width: 1.4; }
  .qv-force-body { fill: #dbeafe; stroke: #173b6d; stroke-width: 2.5; }
  .qv-force-pocket { fill: #bfdbfe; stroke: #173b6d; stroke-width: 1.5; }
  .qv-force-wheel { fill: #334155; stroke: #0f172a; stroke-width: 2; }
  .qv-force-detail { fill: none; stroke: #173b6d; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .qv-force-crate-cross { stroke-width: 1.6; opacity: .45; }
  .qv-force-ground { stroke: #64748b; stroke-width: 2.5; }
  .qv-context-object { fill: #e0f2fe; stroke: #173b6d; }
  .qv-context-panel { fill: #bfdbfe; stroke: #173b6d; }
  .qv-context-instrument { fill: #d1fae5; stroke: #166534; }
  .qv-context-flask { fill: #ccfbf1; stroke: #0f766e; }
  .qv-context-wheel { fill: #334155; stroke: #0f172a; }
  .qv-context-person { fill: #fed7aa; stroke: #9a3412; }
  .qv-context-sun { fill: #fde68a; stroke: #a16207; }
  .qv-context-road { fill: #e2e8f0; stroke: #334155; }
  .qv-context-emphasis { stroke: #c2410c; }
  .qv-context-motion { stroke: #0369a1; }
`;

async function svgElementToPngDataUrl(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = SVG_RASTER_STYLES;
  clone.insertBefore(style, clone.firstChild);
  const viewBox = clone.viewBox?.baseVal;
  const sourceWidth = viewBox?.width || Number(clone.getAttribute("width")) || 640;
  const sourceHeight = viewBox?.height || Number(clone.getAttribute("height")) || 360;
  const targetWidth = Math.max(960, Math.min(1600, Math.round(sourceWidth * 2)));
  const targetHeight = Math.max(1, Math.round(targetWidth * sourceHeight / sourceWidth));
  clone.setAttribute("width", String(targetWidth));
  clone.setAttribute("height", String(targetHeight));

  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("تعذر تحويل أحد الرسومات إلى صورة Word."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("المتصفح لا يدعم تجهيز صور Word.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!response.ok) throw new Error(`تعذر تنزيل الصورة (${response.status}).`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("الملف المستلم ليس صورة صالحة.");
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("تعذر قراءة الصورة."));
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة."));
    reader.readAsDataURL(blob);
  });
}

export async function prepareWordHtml(html: string): Promise<string> {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const illustrations = [...parsed.querySelectorAll<HTMLImageElement>("img.question-visual-illustration")];
  for (const image of illustrations) {
    image.src = await imageUrlToDataUrl(image.src);
  }
  const svgs = [...parsed.querySelectorAll("svg")];
  for (const svg of svgs) {
    const dataUrl = await svgElementToPngDataUrl(svg as SVGSVGElement);
    const image = parsed.createElement("img");
    image.src = dataUrl;
    image.alt = svg.getAttribute("aria-label") ?? "رسم تعليمي";
    image.className = "question-visual-raster";
    svg.replaceWith(image);
  }
  return `<!doctype html>${parsed.documentElement.outerHTML}`;
}

type MicrosoftNavigator = Navigator & {
  msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean;
};

export function downloadBlob(fileName: string, blob: Blob): void {
  const navigatorWithLegacySave = window.navigator as MicrosoftNavigator;
  if (typeof navigatorWithLegacySave.msSaveOrOpenBlob === "function") {
    navigatorWithLegacySave.msSaveOrOpenBlob(blob, fileName);
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function downloadWordHtml(fileName: string, html: string): Promise<void> {
  const wordHtml = await prepareWordHtml(html);
  const blob = new Blob(["\ufeff", wordHtml], { type: "application/msword;charset=utf-8" });
  downloadBlob(`${safeExportFileName(fileName)}.doc`, blob);
}

async function waitForFrameAssets(frameDocument: Document): Promise<void> {
  const fontReady = frameDocument.fonts?.ready ?? Promise.resolve();
  const imageReady = [...frameDocument.images].map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  });
  await Promise.all([fontReady, ...imageReady]);
}

export function printHtmlDocument(title: string, html: string): boolean {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.insetInlineEnd = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.append(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    return false;
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  frameDocument.title = title;

  void (async () => {
    try {
      await waitForFrameAssets(frameDocument);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
      frameWindow.focus();
      frameWindow.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 1_200);
    }
  })();
  return true;
}
