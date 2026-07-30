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
  .ministry-mark { border: 1.5px solid #222; min-height: 20mm; display: grid; place-items: center; text-align: center; font-size: 10px; }
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
  .paper-stimulus { margin: 2mm 5mm; padding: 2.5mm; border: 1px solid #ccd5df; border-radius: 3mm; background: #f8fafc; }
  .paper-options { margin: 3mm 7mm 0; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 7mm; }
  .paper-options li { display: flex; gap: 2mm; align-items: center; }
  .paper-option-circle { width: 4mm; height: 4mm; border: 1px solid #222; border-radius: 50%; flex: 0 0 4mm; }
  .answer-lines { display: grid; gap: 4mm; margin: 3mm 7mm 0; }
  .answer-lines span { border-bottom: 1px solid #333; min-height: 4mm; }
  .working-note { margin: 2mm 7mm 0; font-size: 10px; font-weight: 700; }
  .plan-shared-visual { margin: 3mm 7mm; padding: 2mm; border: 1px solid #aab3bd; border-radius: 3mm; break-inside: avoid; page-break-inside: avoid; }
  .visual-heading { display: none; }
  .question-visual { margin: 0 auto; max-width: 165mm; }
  .question-visual svg, .question-visual-raster { display: block; width: 100%; height: auto; max-height: 88mm; margin: 0 auto; font-family: Tahoma, Arial, sans-serif; direction: ltr; }
  .question-visual figcaption { text-align: center; font-size: 9px; margin-top: 1mm; }
  .qv-title { font-size: 16px; font-weight: 800; fill: #172b45; direction: rtl; unicode-bidi: plaintext; }
  .qv-axis, .qv-component, .qv-wire, .qv-vessel, .qv-depth, .qv-surface { fill: none; stroke: #182536; stroke-width: 2; }
  .qv-grid { stroke: #c9ced5; stroke-width: 1; }
  .qv-tick, .qv-value, .qv-category, .qv-axis-label, .qv-point-label, .qv-annotation, .qv-liquid-label, .qv-symbol-label { fill: #26384e; font-size: 11px; }
  .qv-line { fill: none; stroke: #122f54; stroke-width: 2.5; }
  .qv-point, .qv-node { fill: #fff; stroke: #122f54; stroke-width: 2; }
  .qv-bar, .qv-liquid { fill: #e8edf2; stroke: #172b45; stroke-width: 1.2; }
  .qv-object, .qv-component-fill { fill: #fff; stroke: #172b45; stroke-width: 2; }
  .qv-object-label, .qv-meter { fill: #172b45; font-weight: 700; }
  .paper-footer { text-align: center; margin-top: 8mm; }
  .teacher-key { margin-top: 10mm; break-before: page; page-break-before: always; }
  .teacher-key h2 { text-align: center; border-bottom: 2px solid #173b6d; padding-bottom: 3mm; }
  .teacher-key article { border-bottom: 1px solid #ccd5df; padding: 4mm 0; break-inside: avoid; }
  .teacher-key-head { display: flex; justify-content: space-between; gap: 4mm; }
  .teacher-key ol { margin: 2mm 7mm; }
  .teacher-key blockquote { margin: 2mm 0; padding: 2mm 3mm; border-right: 3px solid #8298b2; background: #f7f9fb; }
  .approval-stamp { margin: 5mm auto; padding: 2mm; text-align: center; font-weight: 800; color: #17583f; white-space: nowrap; }
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
    : "";
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

export async function prepareWordHtml(html: string): Promise<string> {
  const parsed = new DOMParser().parseFromString(html, "text/html");
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

export async function downloadWordHtml(fileName: string, html: string): Promise<void> {
  const wordHtml = await prepareWordHtml(html);
  const blob = new Blob(["\ufeff", wordHtml], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeExportFileName(fileName)}.doc`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function printHtmlDocument(title: string, html: string): boolean {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.document.title = title;
  window.setTimeout(() => {
    popup.focus();
    popup.print();
  }, 350);
  return true;
}
