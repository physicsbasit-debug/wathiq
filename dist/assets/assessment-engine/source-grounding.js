import { sourceContentHash } from "./hashing.js";
const PROMPT_INJECTION_LINE = /(?:تجاهل|تجاوز|انسَ|لا تتبع|نفّذ|اتبع)\s+(?:كل\s+)?(?:التعليمات|الأوامر|المطالبات)|ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions|system\s+prompt|developer\s+message/iu;
const ARABIC_STOP = new Set(["في", "من", "إلى", "على", "عن", "أن", "إن", "هو", "هي", "هذا", "هذه", "ذلك", "التي", "الذي", "مع", "ثم", "أو", "و", "ف", "ب", "ل", "ما"]);
export function normalizeArabicForGrounding(value) {
    return value
        .normalize("NFKC")
        .replace(/[إأآٱ]/gu, "ا")
        .replace(/ى/gu, "ي")
        .replace(/ة/gu, "ه")
        .replace(/[ًٌٍَُِّْـ]/gu, "")
        .replace(/[٠-٩]/gu, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
        .replace(/[^\p{L}\p{N}\s.،؛:()/%+\-=]/gu, " ")
        .replace(/\s+/gu, " ")
        .trim()
        .toLowerCase();
}
export function groundingTokens(value) {
    return [...new Set(normalizeArabicForGrounding(value)
            .split(/\s+/u)
            .map((token) => token.replace(/^[وفبكل]{1,2}(?=\p{L}{3,})/u, ""))
            .filter((token) => token.length >= 2 && !ARABIC_STOP.has(token)))];
}
export function sanitizeSourceContent(content) {
    return content
        .replace(/\r\n?/gu, "\n")
        .split("\n")
        .filter((line) => !PROMPT_INJECTION_LINE.test(normalizeArabicForGrounding(line)))
        .join("\n")
        .replace(/[ \t]+/gu, " ")
        .replace(/\n{3,}/gu, "\n\n")
        .trim();
}
export async function buildEvidenceSegments(content) {
    const sanitized = sanitizeSourceContent(content);
    if (!sanitized)
        throw new Error("مقطع المصدر فارغ بعد التنظيف.");
    const rough = sanitized
        .split(/\n{2,}|(?<=[.!؟])\s+(?=[\p{L}\p{N}])/u)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length >= 28);
    const merged = [];
    for (const entry of rough) {
        if (entry.length <= 700)
            merged.push(entry);
        else {
            for (let start = 0; start < entry.length; start += 550)
                merged.push(entry.slice(start, start + 650).trim());
        }
    }
    const segments = [];
    for (const excerpt of merged.slice(0, 40)) {
        const tokens = groundingTokens(excerpt);
        if (tokens.length < 3)
            continue;
        segments.push({
            evidenceIndex: segments.length,
            evidenceHash: await sourceContentHash(excerpt),
            excerpt,
            tokens,
        });
    }
    if (!segments.length)
        throw new Error("لا يحتوي مقطع المصدر دليلًا نصيًا كافيًا لبناء السؤال.");
    return segments;
}
function overlap(left, right) {
    if (!left.length || !right.length)
        return 0;
    const rightSet = new Set(right);
    return left.filter((token) => rightSet.has(token)).length / Math.max(1, Math.min(left.length, right.length));
}
export function selectEvidenceAnchor(segments, contract, content) {
    const query = groundingTokens([
        contract.lessonLabel,
        contract.outcomeLabel,
        contract.topic,
        content.stimulus,
        content.text,
        content.answer,
        content.rationale,
    ].join(" "));
    const lessonTokens = groundingTokens(`${contract.lessonLabel} ${contract.outcomeLabel} ${contract.topic}`);
    const ranked = segments.map((segment) => ({
        segment,
        score: overlap(query, segment.tokens) * 0.7 + overlap(lessonTokens, segment.tokens) * 0.3,
    })).sort((a, b) => b.score - a.score || a.segment.evidenceIndex - b.segment.evidenceIndex);
    const best = ranked[0];
    if (!best || best.score < 0.035)
        throw new Error("السؤال لا يرتبط بدليل كافٍ داخل مقطع المصدر المحدد.");
    return {
        evidenceIndex: best.segment.evidenceIndex,
        evidenceHash: best.segment.evidenceHash,
        excerpt: best.segment.excerpt,
        score: Number(best.score.toFixed(4)),
    };
}
//# sourceMappingURL=source-grounding.js.map