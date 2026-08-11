import type { AssessmentItemContract, AssessmentModelContent } from "./contracts.js";
import type { DeterministicScientificContract } from "./scientific-contracts.js";
function normalizeArabicDigits(value: string): string {
  return value.replace(/[٠-٩]/gu, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[٫،]/gu, ".");
}

export function validateAssessmentContentAgainstContract(
  content: AssessmentModelContent,
  contract: AssessmentItemContract,
  scientific: DeterministicScientificContract,
): void {
  if (content.markScheme.length !== contract.marks) throw new Error("عدد نقاط التصحيح لا يساوي درجة المفردة.");
  if (contract.questionType === "اختيار من متعدد") {
    if (content.options.length !== 4 || !content.options.includes(content.answer)) throw new Error("بدائل سؤال الاختيار من متعدد أو إجابته غير صالحة.");
  } else if (content.options.length !== 0) throw new Error("السؤال الإنشائي لا يقبل بدائل اختيار.");
  if (scientific.expectedAnswerTokens.length) {
    const normalized = normalizeArabicDigits(`${content.answer} ${content.rationale} ${content.markScheme.join(" ")}`).toLowerCase();
    const missing = scientific.expectedAnswerTokens.filter((token) => !normalized.includes(normalizeArabicDigits(token).toLowerCase()));
    if (missing.length) throw new Error(`الإجابة تخالف النتيجة الحتمية أو وحدتها: ${missing.join("، ")}.`);
  }
}
