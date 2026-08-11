import type { CambridgeProgrammeId } from "./types.js";

export interface CambridgeProgrammeProfile {
  id: CambridgeProgrammeId;
  label: string;
  syllabusCode: string;
  stageFrom?: number;
  stageTo?: number;
  note: string;
}

export interface CambridgeScienceSubject {
  id: string;
  label: string;
  syllabusCode: string;
  programmeId: CambridgeProgrammeId;
}

export const CAMBRIDGE_PROGRAMMES: readonly CambridgeProgrammeProfile[] = [
  {
    id: "primary",
    label: "كامبريدج للعلوم في المرحلة الابتدائية",
    syllabusCode: "0097",
    stageFrom: 1,
    stageTo: 6,
    note: "المراحل 1–6",
  },
  {
    id: "lower_secondary",
    label: "كامبريدج للعلوم في المرحلة الإعدادية",
    syllabusCode: "0893",
    stageFrom: 7,
    stageTo: 9,
    note: "المراحل 7–9",
  },
  {
    id: "igcse",
    label: "كامبريدج للعلوم للشهادة الدولية العامة للتعليم الثانوي",
    syllabusCode: "",
    note: "المسار الدولي قبل الجامعي",
  },
] as const;

export const CAMBRIDGE_SCIENCE_SUBJECTS: readonly CambridgeScienceSubject[] = [
  { id: "science", label: "العلوم", syllabusCode: "0097", programmeId: "primary" },
  { id: "science", label: "العلوم", syllabusCode: "0893", programmeId: "lower_secondary" },
  { id: "physics", label: "الفيزياء", syllabusCode: "0625", programmeId: "igcse" },
  { id: "chemistry", label: "الكيمياء", syllabusCode: "0620", programmeId: "igcse" },
  { id: "biology", label: "الأحياء", syllabusCode: "0610", programmeId: "igcse" },
  { id: "combined_science", label: "العلوم المجمعة", syllabusCode: "0653", programmeId: "igcse" },
  { id: "coordinated_sciences", label: "العلوم المنسقة (شهادة مزدوجة)", syllabusCode: "0654", programmeId: "igcse" },
] as const;

export function programmeProfile(id: CambridgeProgrammeId): CambridgeProgrammeProfile {
  const profile = CAMBRIDGE_PROGRAMMES.find((item) => item.id === id);
  if (!profile) throw new Error(`مسار كامبريدج غير مدعوم: ${id}`);
  return profile;
}

export function stagesForProgramme(id: CambridgeProgrammeId): number[] {
  const profile = programmeProfile(id);
  if (typeof profile.stageFrom !== "number" || typeof profile.stageTo !== "number") return [];
  return Array.from({ length: profile.stageTo - profile.stageFrom + 1 }, (_, index) => profile.stageFrom! + index);
}

export function subjectsForProgramme(id: CambridgeProgrammeId): CambridgeScienceSubject[] {
  return CAMBRIDGE_SCIENCE_SUBJECTS.filter((subject) => subject.programmeId === id);
}

export function subjectProfile(programmeId: CambridgeProgrammeId, subjectId: string): CambridgeScienceSubject | null {
  return CAMBRIDGE_SCIENCE_SUBJECTS.find((subject) => subject.programmeId === programmeId && subject.id === subjectId) ?? null;
}

export function defaultStageForProgramme(id: CambridgeProgrammeId): number | null {
  if (id === "primary") return 1;
  if (id === "lower_secondary") return 7;
  return null;
}

export function stageLabel(programmeId: CambridgeProgrammeId, stage: number | null): string {
  if (programmeId === "igcse") return "كامبريدج للشهادة الدولية العامة للتعليم الثانوي";
  return stage ? `المرحلة ${stage}` : "مرحلة غير محددة";
}

export function curriculumDisplayName(
  programmeId: CambridgeProgrammeId,
  subjectId: string,
  stage: number | null,
): string {
  const programme = programmeProfile(programmeId);
  const subject = subjectProfile(programmeId, subjectId);
  const code = subject?.syllabusCode || programme.syllabusCode;
  const stagePart = programmeId === "igcse" ? "" : ` · ${stageLabel(programmeId, stage)}`;
  return `${programme.label}${stagePart}${code ? ` · ${code}` : ""}`;
}

export function syllabusCodeFor(programmeId: CambridgeProgrammeId, subjectId: string): string {
  const subject = subjectProfile(programmeId, subjectId);
  return subject?.syllabusCode || programmeProfile(programmeId).syllabusCode;
}

export function isStageValidForProgramme(programmeId: CambridgeProgrammeId, stage: number | null): boolean {
  if (programmeId === "igcse") return true;
  if (stage === null) return false;
  return stagesForProgramme(programmeId).includes(stage);
}
