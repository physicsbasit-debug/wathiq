import type { LibraryExam, ManagedSource, SubjectOption } from "./types.js";

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

export const MOCK_SOURCES: ManagedSource[] = [
  {
    id: "source-demo-1",
    catalogCode: "WTH-OM-G10-PHY-STU-2026-DEMO01",
    fingerprint: "file|كتاب الطالب|10|physics|2026|physics-grade-10-demo.pdf",
    authority: "منهج عُماني",
    title: "كتاب الطالب التجريبي",
    kind: "كتاب الطالب",
    mode: "file",
    grade: 10,
    subjectId: "physics",
    version: "2026",
    fileName: "physics-grade-10-demo.pdf",
    rightsConfirmed: true,
    status: "مفهرس",
    uploadState: "غير مرفوع",
    drivePath: "واثق/01_مصادر_المنصة/01_المنهج_العماني/الصف_10/الفيزياء/كتاب_الطالب/",
    createdAt: "2026-07-25T08:00:00.000Z",
    updatedAt: "2026-07-25T08:00:00.000Z",
  },
  {
    id: "source-demo-2",
    catalogCode: "WTH-OM-G10-PHY-TCH-2026-DEMO02",
    fingerprint: "file|دليل المعلم|10|physics|2026|teacher-guide-grade-10-demo.pdf",
    authority: "منهج عُماني",
    title: "دليل المعلم التجريبي",
    kind: "دليل المعلم",
    mode: "file",
    grade: 10,
    subjectId: "physics",
    version: "2026",
    fileName: "teacher-guide-grade-10-demo.pdf",
    rightsConfirmed: true,
    status: "جاهز للفهرسة",
    uploadState: "غير مرفوع",
    drivePath: "واثق/01_مصادر_المنصة/01_المنهج_العماني/الصف_10/الفيزياء/دليل_المعلم/",
    createdAt: "2026-07-25T08:10:00.000Z",
    updatedAt: "2026-07-25T08:10:00.000Z",
  },
  {
    id: "source-demo-3",
    catalogCode: "WTH-GL-G08-SCI-WEB-PAGE-DEMO03",
    fingerprint: "url|مصدر عالمي|8|science|صفحة حية|https://example.org/science-assessment",
    authority: "مصدر عالمي",
    title: "رابط مصدر عالمي تجريبي",
    kind: "مصدر عالمي",
    mode: "url",
    grade: 8,
    subjectId: "science",
    version: "صفحة حية",
    url: "https://example.org/science-assessment",
    rightsConfirmed: true,
    status: "يحتاج مراجعة",
    drivePath: "واثق/01_مصادر_المنصة/03_مصادر_عالمية/العلوم/الصف_08/",
    createdAt: "2026-07-25T08:20:00.000Z",
    updatedAt: "2026-07-25T08:20:00.000Z",
  },
];
