import type { QuestionProposal } from "./types.js";

export interface ScienceValidationInput {
  subject: string;
  topic: string;
  lessonLabel: string;
  proposal: Pick<QuestionProposal, "stimulus" | "text" | "answer" | "rationale" | "markScheme">;
}

export interface ScienceValidationIssue {
  code: "PHYSICS_PROTON_TRANSFER" | "PHYSICS_GROUNDING_INSULATOR" | "PHYSICS_METAL_CHARGE_CARRIER";
  message: string;
}

/**
 * محقق حتمي صغير وقابل للتوسع. لا يحاول أن يحل محل المراجع العلمي، بل يمنع
 * التناقضات الفيزيائية القابلة للكشف اليقيني قبل الاعتماد والتصدير.
 */
export function validateScienceItem(input: ScienceValidationInput): ScienceValidationIssue[] {
  const { proposal } = input;
  const issues: ScienceValidationIssue[] = [];
  const student = `${proposal.stimulus ?? ""} ${proposal.text}`.replace(/\s+/gu, " ");
  const teacher = `${proposal.answer} ${proposal.rationale ?? ""} ${(proposal.markScheme ?? []).join(" ")}`.replace(/\s+/gu, " ");
  const scope = `${input.subject} ${input.topic} ${input.lessonLabel} ${student} ${teacher}`;

  if (!/فيزياء|كهرب|شحن|احتكاك|موصل|عازل/u.test(scope)) return issues;

  const protonTransfer = /(?:انتقال|انتقلت|ينتقل|فقد|فقدان|اكتساب|اكتسب)[^.!؟]{0,60}البروتون/u.test(teacher)
    || /البروتون(?:ات)?[^.!؟]{0,60}(?:انتقال|انتقلت|ينتقل)/u.test(teacher);
  if (protonTransfer) {
    issues.push({
      code: "PHYSICS_PROTON_TRANSFER",
      message: "الشحن بالاحتكاك بين الأجسام العادية يفسر بانتقال الإلكترونات لا انتقال البروتونات.",
    });
  }

  const insulatingTube = /(?:أنبوب|خرطوم)[^.!؟]{0,70}(?:بلاستيك|بلاستيكي|عازل)/u.test(student)
    || /(?:بلاستيك|بلاستيكي|عازل)[^.!؟]{0,70}(?:أنبوب|خرطوم)/u.test(student);
  const groundsInsulatingTube = /(?:تأريض|توصيل|وصل|يوصل)[^.!؟]{0,80}(?:الأنبوب|الخرطوم)[^.!؟]{0,80}(?:الأرض|بالأرض)/u.test(teacher)
    || /(?:الأنبوب|الخرطوم)[^.!؟]{0,80}(?:تأريض|بالأرض|إلى\s+الأرض)/u.test(teacher);
  if (insulatingTube && groundsInsulatingTube) {
    issues.push({
      code: "PHYSICS_GROUNDING_INSULATOR",
      message: "لا يُعتمد تأريض أنبوب أو خرطوم بلاستيكي عازل بوصفه مسارًا فعالًا لتفريغ الشحنة؛ استخدم أجزاء موصلة/مبددة للشحنة ومؤرضة.",
    });
  }

  const metallicConduction = /موصل(?:ات)?\s+فلز|الموصلات\s+الفلزية/u.test(student);
  if (metallicConduction && /البروتون/u.test(proposal.answer) && !/الإلكترون/u.test(proposal.answer)) {
    issues.push({
      code: "PHYSICS_METAL_CHARGE_CARRIER",
      message: "حاملات الشحنة الحرة في الموصلات الفلزية هي الإلكترونات الحرة، لا البروتونات.",
    });
  }

  return issues;
}
