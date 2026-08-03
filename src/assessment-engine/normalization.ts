import type {
  AssessmentItemContract,
  AssessmentModelContent,
} from "./contracts.js";
import { AssessmentEngineError } from "./errors.js";
import { assertModelOutputOwnership } from "./invariants.js";

const INTERNAL_TOKEN_PATTERN = /\(?\b(?:visual-plan|visual_item|blueprint-item|plan-item|source-evidence)[-_]?\d+\b\)?/giu;

export function normalizeAssessmentText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(INTERNAL_TOKEN_PATTERN, " ")
    .replace(/\(\s*\)/gu, " ")
    .replace(/\s+([،؛:,.!?؟])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeAssessmentText)
    .filter(Boolean);
}

export function normalizeAssessmentModelContent(
  value: unknown,
  contract: AssessmentItemContract,
): AssessmentModelContent {
  assertModelOutputOwnership(value);
  const record = value as Record<string, unknown>;
  const stimulus = normalizeAssessmentText(record.stimulus);
  const text = normalizeAssessmentText(record.text);
  const options = [...new Set(normalizeStringArray(record.options))];
  const answer = normalizeAssessmentText(record.answer);
  const rationale = normalizeAssessmentText(record.rationale);
  const markScheme = normalizeStringArray(record.markScheme);
  if (typeof record.needsReview !== "boolean") {
    throw new AssessmentEngineError("MODEL_INCOMPLETE_CONTENT", "لم يعد النموذج وسم المراجعة الإلزامي.");
  }
  if (!text || !answer || !rationale) {
    throw new AssessmentEngineError("MODEL_INCOMPLETE_CONTENT", "أعاد النموذج سؤالًا أو إجابة أو تفسيرًا ناقصًا.");
  }
  if (markScheme.length !== contract.marks) {
    throw new AssessmentEngineError(
      "MODEL_ASSESSMENT_MISMATCH",
      "نموذج التصحيح لا يوزع نقطة مستقلة لكل درجة.",
      { expectedMarks: contract.marks, actualPoints: markScheme.length },
    );
  }
  if (contract.questionType === "اختيار من متعدد") {
    if (options.length !== 4 || !options.includes(answer)) {
      throw new AssessmentEngineError(
        "MODEL_ASSESSMENT_MISMATCH",
        "سؤال الاختيار من متعدد لا يحتوي أربعة بدائل مختلفة وإجابة مطابقة لها.",
      );
    }
  } else if (options.length) {
    throw new AssessmentEngineError("MODEL_ASSESSMENT_MISMATCH", "أعاد السؤال الإنشائي بدائل غير مطلوبة.");
  }
  return {
    stimulus,
    text,
    options,
    answer,
    rationale,
    markScheme,
    needsReview: record.needsReview === true,
  };
}
