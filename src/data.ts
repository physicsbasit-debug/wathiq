import type { SubjectOption } from "./types.js";

/** مواد العلوم فقط. تفاصيل Cambridge والسيلابس محفوظة في cambridge-curriculum.ts. */
export const SUBJECTS: SubjectOption[] = [
  { id: "science", label: "العلوم", programmes: ["primary", "lower_secondary"] },
  { id: "physics", label: "الفيزياء", programmes: ["igcse"] },
  { id: "chemistry", label: "الكيمياء", programmes: ["igcse"] },
  { id: "biology", label: "الأحياء", programmes: ["igcse"] },
  { id: "combined_science", label: "العلوم المجمعة", programmes: ["igcse"] },
  { id: "coordinated_sciences", label: "العلوم المنسقة", programmes: ["igcse"] },
];
