function normalizeArabicDigits(value) {
    return value
        .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
        .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}
function normalizeSpaces(value) {
    return value.replace(/\s+/g, " ").trim();
}
function normalizeDash(value) {
    return value.replace(/[–—‑−]/g, "-");
}
function normalizeKey(value) {
    return normalizeArabicDigits(normalizeDash(value))
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
        .replace(/ـ/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ؤ/g, "و")
        .replace(/ئ/g, "ي")
        .replace(/[^\p{L}\p{N}-]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("ar");
}
function stableHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}
function cleanLessonTitle(value) {
    return normalizeSpaces(value)
        .replace(/^(?:الدرس|درس)\s+/i, "")
        .replace(/^[\s:：\-–—]+/, "")
        .replace(/\s+(?:ص(?:فحة)?\s*)?[0-9٠-٩۰-۹]{1,3}\s*$/i, "")
        .trim();
}
function parseNumberedLesson(value) {
    const normalized = normalizeArabicDigits(normalizeDash(normalizeSpaces(value)));
    const withoutPrefix = normalized.replace(/^(?:الدرس|درس)\s+/i, "");
    const match = withoutPrefix.match(/^([0-9]{1,2}\s*[-.]\s*[0-9]{1,2})\s*[:：\-]?\s*(.+)$/u);
    if (!match)
        return null;
    const code = match[1].replace(/\s+/g, "").replace(".", "-");
    const title = cleanLessonTitle(match[2]);
    if (title.length < 3 || title.length > 140)
        return null;
    if (/^(?:الوحدة|الفصل|المحتويات|الفهرس)\b/i.test(title))
        return null;
    return { code, title };
}
function optionFromApprovedNode(source, node, unitById) {
    if (node.nodeType !== "درس")
        return null;
    if (node.reviewStatus !== "معتمد" && node.confidence < 0.9)
        return null;
    const parsed = parseNumberedLesson(node.title);
    if (!parsed)
        return null;
    const unit = node.parentId ? unitById.get(node.parentId) : undefined;
    return {
        id: `lesson-${source.id}-${node.id}`,
        sourceId: source.id,
        sourceTitle: source.title,
        label: `${parsed.code} ${parsed.title}`,
        code: parsed.code,
        title: parsed.title,
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        ...(unit ? { unitLabel: unit.title } : {}),
        origin: node.extractionMethod.startsWith("curated:")
            ? "curated-book-tree"
            : node.reviewStatus === "معتمد"
                ? "approved-structure"
                : "validated-structure",
    };
}
const ARABIC_UNIT_ORDINALS = new Map([
    ["الاولى", 1],
    ["الثانيه", 2],
    ["الثالثه", 3],
    ["الرابعه", 4],
    ["الخامسه", 5],
    ["السادسه", 6],
    ["السابعه", 7],
    ["الثامنه", 8],
    ["التاسعه", 9],
    ["العاشره", 10],
    ["الحاديه عشره", 11],
    ["الثانيه عشره", 12],
]);
function unitOrdinalFromTitle(value) {
    const normalized = normalizeKey(value);
    const numeric = normalized.match(/(?:الوحده|وحده)\s+([0-9]{1,2})\b/u);
    if (numeric)
        return Number(numeric[1]);
    for (const [label, ordinal] of ARABIC_UNIT_ORDINALS) {
        if (normalized.includes(`الوحده ${label}`) || normalized.includes(`وحده ${label}`))
            return ordinal;
    }
    return null;
}
function optionFromDetectedHeading(source, heading, unitLabelByOrdinal) {
    const parsed = parseNumberedLesson(heading);
    if (!parsed)
        return null;
    const unitOrdinal = Number(parsed.code.split("-")[0]);
    const unitLabel = Number.isSafeInteger(unitOrdinal)
        ? unitLabelByOrdinal.get(unitOrdinal) ?? `الوحدة ${unitOrdinal}`
        : undefined;
    return {
        id: `lesson-${source.id}-heading-${stableHash(`${parsed.code}|${parsed.title}`)}`,
        sourceId: source.id,
        sourceTitle: source.title,
        label: `${parsed.code} ${parsed.title}`,
        code: parsed.code,
        title: parsed.title,
        ...(unitLabel ? { unitLabel } : {}),
        origin: "detected-heading",
    };
}
function originPriority(origin) {
    return {
        "approved-structure": 4,
        "curated-book-tree": 3,
        "validated-structure": 2,
        "detected-heading": 1,
    }[origin];
}
function preferCatalogOption(current, candidate) {
    const priorityDifference = originPriority(candidate.origin) - originPriority(current.origin);
    if (priorityDifference > 0)
        return candidate;
    if (priorityDifference < 0)
        return current;
    const currentHasPages = current.pageStart !== undefined;
    const candidateHasPages = candidate.pageStart !== undefined;
    if (candidateHasPages && !currentHasPages)
        return candidate;
    if (currentHasPages && !candidateHasPages)
        return current;
    return candidate.title.length > current.title.length ? candidate : current;
}
function lessonSortKey(option) {
    const parts = option.code.split("-").map((part) => Number(part));
    const first = parts[0] ?? 999;
    const second = parts[1] ?? 999;
    return [Number.isFinite(first) ? first : 999, Number.isFinite(second) ? second : 999, option.title];
}
export function buildLessonCatalog(sources, structuresBySource = new Map()) {
    const options = [];
    for (const source of sources) {
        const nodes = structuresBySource.get(source.id) ?? [];
        const unitNodes = nodes.filter((node) => node.nodeType === "وحدة");
        const unitById = new Map(unitNodes.map((node) => [node.id, node]));
        const unitLabelByOrdinal = new Map();
        unitNodes.forEach((unit) => {
            const ordinal = unitOrdinalFromTitle(unit.title);
            if (ordinal !== null && !unitLabelByOrdinal.has(ordinal))
                unitLabelByOrdinal.set(ordinal, unit.title);
        });
        const structured = nodes
            .map((node) => optionFromApprovedNode(source, node, unitById))
            .filter((option) => option !== null);
        structured.forEach((option) => {
            const ordinal = Number(option.code.split("-")[0]);
            if (option.unitLabel && Number.isSafeInteger(ordinal) && !unitLabelByOrdinal.has(ordinal)) {
                unitLabelByOrdinal.set(ordinal, option.unitLabel);
            }
        });
        options.push(...structured);
        // لا نهمل العناوين المرقمة عند وجود شجرة جزئية؛ فهي تكمل الدروس التي سقطت من OCR أو الربط اليدوي.
        for (const heading of source.detectedHeadings ?? []) {
            const option = optionFromDetectedHeading(source, heading, unitLabelByOrdinal);
            if (option)
                options.push(option);
        }
    }
    const unique = new Map();
    for (const option of options) {
        // رمز الدرس هو الهوية المنهجية داخل المصدر؛ اختلاف الصياغة لا ينشئ درسًا مكررًا.
        const key = normalizeKey(`${option.sourceId}|${option.code}`);
        const existing = unique.get(key);
        unique.set(key, existing ? preferCatalogOption(existing, option) : option);
    }
    return [...unique.values()].sort((left, right) => {
        const [leftA, leftB, leftTitle] = lessonSortKey(left);
        const [rightA, rightB, rightTitle] = lessonSortKey(right);
        return leftA - rightA || leftB - rightB || leftTitle.localeCompare(rightTitle, "ar");
    });
}
export function selectedLessonLabels(options, selectedIds) {
    const byId = new Map(options.map((option) => [option.id, option]));
    return selectedIds.flatMap((id) => {
        const option = byId.get(id);
        return option ? [option.label] : [];
    });
}
export function selectedLessonIds(options, labels) {
    const labelKeys = new Set(labels.map(normalizeKey));
    return options.filter((option) => labelKeys.has(normalizeKey(option.label))).map((option) => option.id);
}
//# sourceMappingURL=lesson-catalog.js.map