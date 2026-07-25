import type { LibraryExam, SubjectOption } from "./types.js";

const demoOutcomes = (prefix: string) => [
  { id: `${prefix}-o1`, label: "يصف المفهوم العلمي باستخدام مصطلحات دقيقة" },
  { id: `${prefix}-o2`, label: "يطبق المفهوم في موقف علمي مألوف" },
  { id: `${prefix}-o3`, label: "يستدل من بيانات أو رسم علمي للوصول إلى نتيجة" },
];

export const SUBJECTS: SubjectOption[] = [
  {
    id: "science",
    label: "العلوم",
    grades: [1, 2, 3, 4, 5, 6, 7, 8],
    units: [
      {
        id: "science-u1",
        label: "وحدة تجريبية: المادة وتغيراتها",
        lessons: [
          { id: "science-u1-l1", label: "خواص المواد", outcomes: demoOutcomes("s1") },
          { id: "science-u1-l2", label: "التغيرات الفيزيائية", outcomes: demoOutcomes("s2") },
          { id: "science-u1-l3", label: "استخدام المواد", outcomes: demoOutcomes("s3") },
        ],
      },
      {
        id: "science-u2",
        label: "وحدة تجريبية: الكائنات الحية",
        lessons: [
          { id: "science-u2-l1", label: "احتياجات الكائنات الحية", outcomes: demoOutcomes("s4") },
          { id: "science-u2-l2", label: "السلاسل الغذائية", outcomes: demoOutcomes("s5") },
        ],
      },
    ],
  },
  {
    id: "physics",
    label: "الفيزياء",
    grades: [9, 10, 11, 12],
    units: [
      {
        id: "physics-u1",
        label: "وحدة تجريبية: الحركة والقوى",
        lessons: [
          { id: "physics-u1-l1", label: "وصف الحركة", outcomes: demoOutcomes("p1") },
          { id: "physics-u1-l2", label: "القوة والتسارع", outcomes: demoOutcomes("p2") },
          { id: "physics-u1-l3", label: "تمثيل البيانات بيانيًا", outcomes: demoOutcomes("p3") },
        ],
      },
    ],
  },
  {
    id: "chemistry",
    label: "الكيمياء",
    grades: [9, 10, 11, 12],
    units: [
      {
        id: "chemistry-u1",
        label: "وحدة تجريبية: بنية المادة",
        lessons: [
          { id: "chemistry-u1-l1", label: "الجسيمات والذرات", outcomes: demoOutcomes("c1") },
          { id: "chemistry-u1-l2", label: "العناصر والمركبات", outcomes: demoOutcomes("c2") },
        ],
      },
    ],
  },
  {
    id: "biology",
    label: "الأحياء",
    grades: [9, 10, 11, 12],
    units: [
      {
        id: "biology-u1",
        label: "وحدة تجريبية: الخلية والأنسجة",
        lessons: [
          { id: "biology-u1-l1", label: "مكونات الخلية", outcomes: demoOutcomes("b1") },
          { id: "biology-u1-l2", label: "تخصص الخلايا", outcomes: demoOutcomes("b2") },
        ],
      },
    ],
  },
];

export const MOCK_LIBRARY: LibraryExam[] = [
  {
    id: "draft-1",
    title: "الاختبار القصير الأول في الحركة والقوى",
    subject: "الفيزياء",
    grade: 10,
    status: "مسودة",
    date: "2026-09-16",
    progress: 62,
  },
  {
    id: "approved-1",
    title: "اختبار وحدة المادة وتغيراتها",
    subject: "العلوم",
    grade: 7,
    status: "معتمد",
    date: "2026-09-10",
    hasModelB: true,
  },
  {
    id: "approved-2",
    title: "الاختبار القصير الثاني في بنية المادة",
    subject: "الكيمياء",
    grade: 11,
    status: "معتمد",
    date: "2026-09-03",
    hasModelB: false,
  },
];

export const MOCK_SOURCES = [
  {
    name: "كتاب الطالب التجريبي",
    kind: "كتاب الطالب",
    subject: "الفيزياء",
    grade: 10,
    status: "مفهرس",
  },
  {
    name: "دليل المعلم التجريبي",
    kind: "دليل المعلم",
    subject: "الفيزياء",
    grade: 10,
    status: "مفهرس",
  },
  {
    name: "رابط مصدر عالمي تجريبي",
    kind: "رابط موقع",
    subject: "العلوم",
    grade: 8,
    status: "بانتظار الفحص",
  },
];
