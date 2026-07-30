import type { ManagedSource, SourceStructureNode } from "./types.js";

interface CuratedLessonDefinition {
  code: string;
  title: string;
  pageStart: number;
}

interface CuratedUnitDefinition {
  title: string;
  pageStart: number;
  lessons: CuratedLessonDefinition[];
}

interface CuratedBookDefinition {
  id: string;
  matches(source: ManagedSource): boolean;
  totalPages: number;
  units: CuratedUnitDefinition[];
}

const GRADE_10_PHYSICS_STUDENT_BOOK: CuratedBookDefinition = {
  id: "oman-g10-physics-student-book-s1-2021",
  totalPages: 124,
  matches(source) {
    const normalizedTitle = `${source.title} ${source.fileName ?? ""}`
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .toLocaleLowerCase("ar");
    const catalogMatch = source.catalogCode.startsWith("WTH-OM-G10-PHY-STU-S1-");
    const identityMatch = source.grade === 10
      && source.subjectId === "physics"
      && source.kind === "كتاب الطالب"
      && source.semester === "الفصل الأول";
    const titleMatch = /(?:كتاب\s+الطالب.*فيزياء|فيزياء.*كتاب\s+الطالب|cls10[_-]?phys[_-]?sb)/i.test(normalizedTitle);
    const pageMatch = !source.extractedPageCount || Math.abs(source.extractedPageCount - 124) <= 2;
    return identityMatch && pageMatch && (catalogMatch || titleMatch);
  },
  units: [
    {
      title: "الوحدة الأولى: الشحنة الكهربائية",
      pageStart: 15,
      lessons: [
        { code: "1-1", title: "الكهرباء الساكنة", pageStart: 15 },
        { code: "1-2", title: "الاحتكاك والشحن الكهربائي", pageStart: 18 },
        { code: "1-3", title: "المجالات الكهربائية والشحنة الكهربائية", pageStart: 19 },
        { code: "1-4", title: "الموصلات الكهربائية والعوازل", pageStart: 20 },
      ],
    },
    {
      title: "الوحدة الثانية: مخططات الدوائر الكهربائية",
      pageStart: 22,
      lessons: [
        { code: "2-1", title: "مكونات الدائرة الكهربائية", pageStart: 22 },
        { code: "2-2", title: "توصيل المقاومات", pageStart: 29 },
      ],
    },
    {
      title: "الوحدة الثالثة: مخاطر الكهرباء",
      pageStart: 38,
      lessons: [
        { code: "3-1", title: "المخاطر الكهربائية", pageStart: 38 },
        { code: "3-2", title: "المنصهرات", pageStart: 39 },
      ],
    },
    {
      title: "الوحدة الرابعة: تأثيرات القوى",
      pageStart: 42,
      lessons: [
        { code: "4-1", title: "القوى المؤثرة على قطار الملاهي", pageStart: 42 },
        { code: "4-2", title: "القوى المؤثرة على المركبة الفضائية", pageStart: 44 },
        { code: "4-3", title: "القوة والكتلة والتسارع", pageStart: 49 },
        { code: "4-4", title: "استطالة الزنبرك", pageStart: 51 },
        { code: "4-5", title: "قانون هوك", pageStart: 54 },
      ],
    },
    {
      title: "الوحدة الخامسة: عزم القوة ومركز الكتلة",
      pageStart: 58,
      lessons: [
        { code: "5-1", title: "عزم القوة", pageStart: 58 },
        { code: "5-2", title: "حساب عزم القوة", pageStart: 61 },
        { code: "5-3", title: "الاستقرار ومركز الكتلة", pageStart: 64 },
      ],
    },
    {
      title: "الوحدة السادسة: الشغل والقدرة",
      pageStart: 71,
      lessons: [
        { code: "6-1", title: "الشغل المبذول", pageStart: 71 },
        { code: "6-2", title: "حساب الشغل المبذول", pageStart: 73 },
        { code: "6-3", title: "القدرة", pageStart: 76 },
      ],
    },
    {
      title: "الوحدة السابعة: الضغط",
      pageStart: 79,
      lessons: [
        { code: "7-1", title: "الضغط على سطح", pageStart: 79 },
        { code: "7-2", title: "حساب الضغط", pageStart: 80 },
      ],
    },
    {
      title: "الوحدة الثامنة: فيزياء النواة",
      pageStart: 82,
      lessons: [
        { code: "8-1", title: "بنية النواة", pageStart: 82 },
      ],
    },
    {
      title: "الوحدة التاسعة: النشاط الإشعاعي",
      pageStart: 88,
      lessons: [
        { code: "9-1", title: "النشاط الإشعاعي في كل مكان", pageStart: 88 },
        { code: "9-2", title: "فهم النشاط الإشعاعي", pageStart: 93 },
        { code: "9-3", title: "استخدام النظائر المشعة", pageStart: 97 },
      ],
    },
    {
      title: "الوحدة العاشرة: الاضمحلال الإشعاعي وعمر النصف",
      pageStart: 102,
      lessons: [
        { code: "10-1", title: "تناقص النشاط الإشعاعي مع مرور الزمن", pageStart: 102 },
        { code: "10-2", title: "معادلات الاضمحلال الإشعاعي", pageStart: 103 },
        { code: "10-3", title: "عمر النصف للمادة المشعة", pageStart: 103 },
      ],
    },
    {
      title: "الوحدة الحادية عشرة: احتياطات السلامة",
      pageStart: 109,
      lessons: [
        { code: "11-1", title: "التعامل الآمن", pageStart: 109 },
      ],
    },
  ],
};

const CURATED_BOOKS: CuratedBookDefinition[] = [GRADE_10_PHYSICS_STUDENT_BOOK];

function nextPageEnd(currentStart: number, nextStart: number | undefined, fallbackEnd: number): number {
  if (!nextStart) return Math.max(currentStart, fallbackEnd);
  return Math.max(currentStart, nextStart - 1);
}

function buildNodes(source: ManagedSource, definition: CuratedBookDefinition): SourceStructureNode[] {
  const timestamp = source.updatedAt || source.createdAt || new Date(0).toISOString();
  const totalPages = source.extractedPageCount || definition.totalPages;
  const nodes: SourceStructureNode[] = [];
  let orderIndex = 0;

  definition.units.forEach((unit, unitIndex) => {
    const nextUnit = definition.units[unitIndex + 1];
    const unitEnd = nextPageEnd(unit.pageStart, nextUnit?.pageStart, totalPages);
    const unitId = `curated-${definition.id}-${source.id}-u${unitIndex + 1}`;
    nodes.push({
      id: unitId,
      sourceId: source.id,
      parentId: null,
      nodeType: "وحدة",
      title: unit.title,
      pageStart: unit.pageStart,
      pageEnd: unitEnd,
      orderIndex: orderIndex++,
      confidence: 1,
      reviewStatus: "معتمد",
      extractionMethod: `curated:${definition.id}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    unit.lessons.forEach((lesson, lessonIndex) => {
      const nextLesson = unit.lessons[lessonIndex + 1];
      nodes.push({
        id: `curated-${definition.id}-${source.id}-${lesson.code}`,
        sourceId: source.id,
        parentId: unitId,
        nodeType: "درس",
        title: `${lesson.code} ${lesson.title}`,
        pageStart: lesson.pageStart,
        pageEnd: nextPageEnd(lesson.pageStart, nextLesson?.pageStart, unitEnd),
        orderIndex: orderIndex++,
        confidence: 1,
        reviewStatus: "معتمد",
        extractionMethod: `curated:${definition.id}`,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });
  });
  return nodes;
}

export function buildCuratedBookStructure(source: ManagedSource): SourceStructureNode[] {
  const definition = CURATED_BOOKS.find((candidate) => candidate.matches(source));
  return definition ? buildNodes(source, definition) : [];
}

export function hasCuratedBookStructure(source: ManagedSource): boolean {
  return CURATED_BOOKS.some((candidate) => candidate.matches(source));
}
