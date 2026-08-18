import type { AssessmentGeneratedItemResult } from "./contracts.js";

export type AssessmentReviewConflictKind =
  | "duplicate_wording"
  | "duplicate_numbers"
  | "duplicate_scenario"
  | "excessive_direct_recall";

export interface AssessmentReviewConflict {
  kind: AssessmentReviewConflictKind;
  planItemIds: string[];
  message: string;
}

function normalizeArabic(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "")
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeArabic(value).split(" ").filter((token) => token.length >= 3));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

// دالة مساعدة لاستخراج النص بأمان سواء كان من الهيكلة القديمة أو الجديدة
function extractSafeText(result: AssessmentGeneratedItemResult): string {
  // محاولة استخراج النصوص القديمة (Legacy)
  const legacyStimulus = result.content?.stimulus || "";
  const legacyText = result.content?.text || "";
  
  // محاولة استخراج النصوص من الدستور الجديد (V2)
  const v2Context = result.result?.scenario?.contextText || "";
  const v2Questions = result.result?.subQuestions?.map(sq => sq.content).join(" ") || "";

  return `${legacyStimulus} ${legacyText} ${v2Context} ${v2Questions}`.trim();
}

// دالة مساعدة لاستخراج المعرف (ID) بأمان
function extractSafeId(result: AssessmentGeneratedItemResult): string {
  return result.planItemId || result.itemId || "unknown-id";
}

export function reviewCompletedAssessment(
  results: readonly AssessmentGeneratedItemResult[],
): AssessmentReviewConflict[] {
  const conflicts: AssessmentReviewConflict[] = [];
  
  for (let leftIndex = 0; leftIndex < results.length; leftIndex += 1) {
    const left = results[leftIndex];
    if (!left) continue;
    
    const leftId = extractSafeId(left);
    const leftText = extractSafeText(left);
    const leftTokens = tokenSet(leftText);
    const leftNumbers = leftText.match(/[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?/gu) ?? [];
    
    for (let rightIndex = leftIndex + 1; rightIndex < results.length; rightIndex += 1) {
      const right = results[rightIndex];
      if (!right) continue;
      
      const rightId = extractSafeId(right);
      const rightText = extractSafeText(right);
      
      if (jaccard(leftTokens, tokenSet(rightText)) >= 0.78) {
        conflicts.push({
          kind: "duplicate_wording",
          planItemIds: [leftId, rightId],
          message: "توجد مفردتان متشابهتان بدرجة عالية في الصياغة والمحتوى.",
        });
      }
      
      const rightNumbers = rightText.match(/[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?/gu) ?? [];
      if (leftNumbers.length >= 3 && leftNumbers.join("|") === rightNumbers.join("|")) {
        conflicts.push({
          kind: "duplicate_numbers",
          planItemIds: [leftId, rightId],
          message: "تكررت مجموعة البيانات العددية نفسها في مفردتين.",
        });
      }
    }
  }
  
  const directRecall = results.filter((result) => {
    const text = extractSafeText(result);
    return /(ما المقصود|عرف|اكتب تعريف|اذكر وحده|حدد المصطلح)/u.test(normalizeArabic(text));
  });
  
  if (results.length >= 5 && directRecall.length > 1) {
    conflicts.push({
      kind: "excessive_direct_recall",
      planItemIds: directRecall.map(extractSafeId),
      message: "يعتمد الاختبار على الاستدعاء المباشر أكثر من الحد المخطط.",
    });
  }
  
  return conflicts;
}
