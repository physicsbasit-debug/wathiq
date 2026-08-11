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

export interface CambridgeLevelOption {
  id: string;
  label: string;
  programmeId: CambridgeProgrammeId;
  stage: number | null;
  note: string;
}

export interface CambridgeTopicOption {
  id: string;
  label: string;
  strand: string;
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
    note: "مسارات IGCSE للعلوم",
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

export const CAMBRIDGE_LEVEL_OPTIONS: readonly CambridgeLevelOption[] = [
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `primary:${index + 1}`,
    label: `الصف ${index + 1} · كامبريدج الابتدائي`,
    programmeId: "primary" as const,
    stage: index + 1,
    note: `علوم كامبريدج 0097 · المرحلة ${index + 1}`,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `lower_secondary:${index + 7}`,
    label: `الصف ${index + 7} · كامبريدج الإعدادي`,
    programmeId: "lower_secondary" as const,
    stage: index + 7,
    note: `علوم كامبريدج 0893 · المرحلة ${index + 7}`,
  })),
  {
    id: "igcse",
    label: "كامبريدج IGCSE · المرحلة الثانوية",
    programmeId: "igcse",
    stage: null,
    note: "اختر مادة العلوم ثم الموضوع من السيلابس",
  },
] as const;

const T = (id: string, label: string, strand: string): CambridgeTopicOption => ({ id, label, strand });

/**
 * تسميات تنقل عربية مجمعة من أهداف إطار كامبريدج لكل مرحلة.
 * هي فئات موضوعية للاختيار داخل واثق وليست ادعاءً بأن كامبريدج تفرض ترتيب وحدات تدريس موحدًا.
 */
const PRIMARY_TOPICS: Record<number, readonly CambridgeTopicOption[]> = {
  1: [
    T("1-bio-plants", "أجزاء النبات واحتياجاته", "الأحياء"),
    T("1-bio-senses", "الحواس وأجزاء جسم الإنسان", "الأحياء"),
    T("1-bio-living", "الكائنات الحية واحتياجات الحيوانات", "الأحياء"),
    T("1-chem-materials", "المواد وخصائصها", "الكيمياء"),
    T("1-chem-shape", "تغير شكل المواد", "الكيمياء"),
    T("1-phys-motion", "الحركة والدفع والسحب", "الفيزياء"),
    T("1-phys-floating", "الطفو والغوص", "الفيزياء"),
    T("1-phys-sound", "مصادر الصوت", "الفيزياء"),
    T("1-phys-electricity", "الكهرباء في حياتنا", "الفيزياء"),
    T("1-phys-magnets", "المغناطيس والمواد", "الفيزياء"),
    T("1-earth-materials", "الماء والصخور والتربة", "الأرض والفضاء"),
    T("1-space-sun", "الشمس والأرض", "الأرض والفضاء"),
    T("1-enquiry", "الملاحظة وطرح الأسئلة والاستقصاء العلمي", "الاستقصاء العلمي"),
  ],
  2: [
    T("2-bio-bodies", "أجسام الحيوانات والأسنان", "الأحياء"),
    T("2-bio-health", "الصحة والنظافة والمرض", "الأحياء"),
    T("2-bio-growth", "النمو والنسل والصفات", "الأحياء"),
    T("2-bio-habitats", "المواطن البيئية", "الأحياء"),
    T("2-chem-materials", "المواد الطبيعية والمصنعة وخصائصها", "الكيمياء"),
    T("2-chem-change", "تغير المواد", "الكيمياء"),
    T("2-phys-forces", "القوى والحركة وتغير الشكل", "الفيزياء"),
    T("2-phys-light", "الضوء والظلام", "الفيزياء"),
    T("2-phys-circuits", "الكهرباء والسلامة والدوائر البسيطة", "الفيزياء"),
    T("2-earth-rocks", "الصخور واستخراجها وأثرها في البيئة", "الأرض والفضاء"),
    T("2-space-sun", "الحركة الظاهرية للشمس", "الأرض والفضاء"),
    T("2-enquiry", "التنبؤ والمقارنة وتسجيل الملاحظات", "الاستقصاء العلمي"),
  ],
  3: [
    T("3-bio-plants", "أجزاء النبات ووظائفها", "الأحياء"),
    T("3-bio-animals", "مجموعات الحيوانات وتصنيفها", "الأحياء"),
    T("3-bio-organs", "أعضاء جسم الإنسان", "الأحياء"),
    T("3-bio-life", "عمليات الحياة والنمو", "الأحياء"),
    T("3-bio-cycles", "دورات حياة الحيوانات", "الأحياء"),
    T("3-bio-food", "السلاسل الغذائية", "الأحياء"),
    T("3-chem-states", "حالات المادة والمخاليط وفصلها", "الكيمياء"),
    T("3-chem-dissolving", "الذوبان والمحاليل", "الكيمياء"),
    T("3-phys-forces", "القوة والجاذبية والاحتكاك", "الفيزياء"),
    T("3-phys-light", "الضوء والظلال", "الفيزياء"),
    T("3-phys-magnets", "المغناطيس والتجاذب والتنافر", "الفيزياء"),
    T("3-earth-resources", "الصخور والأحافير والموارد", "الأرض والفضاء"),
    T("3-space-system", "القمر والأرض والشمس", "الأرض والفضاء"),
    T("3-enquiry", "القياس والتصنيف والبحث عن الأنماط", "الاستقصاء العلمي"),
  ],
  4: [
    T("4-bio-skeleton", "الهيكل العظمي والعضلات والحركة", "الأحياء"),
    T("4-bio-health", "الصحة والأمراض والأدوية واللقاحات", "الأحياء"),
    T("4-bio-energy", "احتياجات الكائنات الحية للطاقة", "الأحياء"),
    T("4-bio-habitats", "المواطن البيئية والتكيف", "الأحياء"),
    T("4-bio-food", "السلاسل الغذائية والمنتجون والمستهلكون", "الأحياء"),
    T("4-chem-particles", "نموذج الجسيمات للمواد الصلبة والسائلة", "الكيمياء"),
    T("4-chem-state", "الانصهار والتجمد والتغيرات الفيزيائية", "الكيمياء"),
    T("4-chem-reactions", "التفاعلات الكيميائية وتكوّن مواد جديدة", "الكيمياء"),
    T("4-phys-energy", "الطاقة وانتقالها", "الفيزياء"),
    T("4-phys-light", "انتقال الضوء وانعكاسه والرؤية", "الفيزياء"),
    T("4-phys-circuits", "الدوائر الكهربائية والمفاتيح والموصلات والعوازل", "الفيزياء"),
    T("4-earth-structure", "بنية الأرض والقشرة والوشاح واللب", "الأرض والفضاء"),
    T("4-earth-hazards", "البراكين والزلازل", "الأرض والفضاء"),
    T("4-space-day-night", "اليوم والليل والظلال", "الأرض والفضاء"),
    T("4-space-solar", "النظام الشمسي", "الأرض والفضاء"),
    T("4-enquiry", "التجارب العادلة والمتغيرات والجداول والرسوم", "الاستقصاء العلمي"),
  ],
  5: [
    T("5-bio-flower", "أجزاء الزهرة ووظائفها", "الأحياء"),
    T("5-bio-digestion", "الجهاز الهضمي والغذاء المتوازن", "الأحياء"),
    T("5-bio-plants", "دورة حياة النباتات والتلقيح وانتشار البذور والإنبات", "الأحياء"),
    T("5-bio-adaptation", "التكيف وعلاقات المفترس والفريسة", "الأحياء"),
    T("5-chem-particles", "نموذج الجسيمات للمواد الصلبة والسائلة والغازات", "الكيمياء"),
    T("5-chem-water", "خصائص الماء والمحاليل والذوبان", "الكيمياء"),
    T("5-chem-changes", "التبخر والتكاثف وتغيرات الحالة", "الكيمياء"),
    T("5-phys-forces", "القوى ومخططات القوى", "الفيزياء"),
    T("5-phys-sound", "الصوت والاهتزاز ودرجة الصوت وشدته", "الفيزياء"),
    T("5-phys-magnets", "المغناطيسية", "الفيزياء"),
    T("5-earth-atmosphere", "الغلاف الجوي والماء والتلوث", "الأرض والفضاء"),
    T("5-earth-water", "دورة الماء", "الأرض والفضاء"),
    T("5-space-orbit", "مدار الأرض والفصول والأقمار الصناعية", "الأرض والفضاء"),
    T("5-enquiry", "التخطيط للاستقصاء وتمثيل البيانات وتفسيرها", "الاستقصاء العلمي"),
  ],
  6: [
    T("6-bio-circulation", "الجهاز الدوري ونقل المواد", "الأحياء"),
    T("6-bio-respiration", "الجهاز التنفسي وتبادل الغازات", "الأحياء"),
    T("6-bio-reproduction", "الجهاز التناسلي والبلوغ", "الأحياء"),
    T("6-bio-disease", "الأمراض المعدية والدفاع عن الجسم والنظافة", "الأحياء"),
    T("6-bio-ecosystem", "الشبكات الغذائية والطاقة والمواد السامة", "الأحياء"),
    T("6-chem-properties", "خصائص المواد والتوصيل وتغير الحالة", "الكيمياء"),
    T("6-chem-solutions", "الذوبان وتأثير درجة الحرارة", "الكيمياء"),
    T("6-chem-reactions", "التفاعلات الكيميائية والتغيرات العكوسة وغير العكوسة", "الكيمياء"),
    T("6-phys-forces", "الكتلة والوزن والجاذبية والقوى والحركة", "الفيزياء"),
    T("6-phys-floating", "الطفو والغوص", "الفيزياء"),
    T("6-phys-light", "انعكاس الضوء وانكساره", "الفيزياء"),
    T("6-phys-circuits", "دوائر التوالي والتوازي والرموز الكهربائية", "الفيزياء"),
    T("6-earth-rocks", "أنواع الصخور والأحافير والتربة ودورة الصخور", "الأرض والفضاء"),
    T("6-space-system", "النظام الشمسي وحركة الأجرام وأطوار القمر", "الأرض والفضاء"),
    T("6-enquiry", "الاستقصاء العلمي وتحليل الأدلة وتقييم النتائج", "الاستقصاء العلمي"),
  ],
};

const LOWER_SECONDARY_TOPICS: Record<number, readonly CambridgeTopicOption[]> = {
  7: [
    T("7-bio-cells", "الخلايا والخلايا المتخصصة", "الأحياء"),
    T("7-bio-classification", "خصائص الكائنات الحية والتصنيف والمفاتيح الثنائية", "الأحياء"),
    T("7-bio-viruses", "الفيروسات والكائنات الحية", "الأحياء"),
    T("7-bio-ecosystems", "النظم البيئية والسلاسل والشبكات الغذائية والمحللات", "الأحياء"),
    T("7-chem-atoms", "الذرات والعناصر والجدول الدوري", "الكيمياء"),
    T("7-chem-materials", "العناصر والمركبات والمخاليط وحالات المادة", "الكيمياء"),
    T("7-chem-acids", "الأحماض والقلويات والأس الهيدروجيني والكواشف", "الكيمياء"),
    T("7-chem-tests", "اختبارات الغازات والسبائك", "الكيمياء"),
    T("7-chem-reactions", "التفاعلات الكيميائية والترسيب والتعادل", "الكيمياء"),
    T("7-phys-energy", "الطاقة وانتقالها", "الفيزياء"),
    T("7-phys-gravity", "الجاذبية والكتلة والوزن", "الفيزياء"),
    T("7-phys-sound", "الصوت والموجات والأصداء", "الفيزياء"),
    T("7-phys-electricity", "الكهرباء والتيار والموصلات والعوازل ودوائر التوالي", "الفيزياء"),
    T("7-earth-tectonics", "الصفائح التكتونية والبراكين والزلازل", "الأرض والفضاء"),
    T("7-earth-atmosphere", "الغلاف الجوي ودورة الماء", "الأرض والفضاء"),
    T("7-space-system", "الجاذبية في النظام الشمسي والمد والجزر والكسوف والخسوف", "الأرض والفضاء"),
    T("7-enquiry", "الاستقصاء العلمي والقياس وتمثيل البيانات", "الاستقصاء العلمي"),
  ],
  8: [
    T("8-bio-muscles", "المفاصل والعضلات المتضادة والحركة", "الأحياء"),
    T("8-bio-blood", "مكونات الدم ووظائفها", "الأحياء"),
    T("8-bio-gas", "الجهاز التنفسي وتبادل الغازات", "الأحياء"),
    T("8-bio-diet", "الغذاء المتوازن والمغذيات والصحة", "الأحياء"),
    T("8-bio-respiration", "التنفس الهوائي", "الأحياء"),
    T("8-bio-ecosystems", "النظم البيئية والتراكم الحيوي والأنواع الغازية", "الأحياء"),
    T("8-chem-atom", "نموذج الذرة والبروتونات والنيوترونات والإلكترونات", "الكيمياء"),
    T("8-chem-purity", "نقاوة المواد وتركيز المحاليل", "الكيمياء"),
    T("8-chem-chromatography", "الكروماتوغرافيا الورقية وفصل المواد", "الكيمياء"),
    T("8-chem-equations", "المعادلات اللفظية للتفاعلات", "الكيمياء"),
    T("8-chem-energy", "التفاعلات الطاردة والماصة للحرارة", "الكيمياء"),
    T("8-chem-metals", "نشاط الفلزات وتكوين المنتجات", "الكيمياء"),
    T("8-chem-solubility", "الذوبانية وتأثير درجة الحرارة", "الكيمياء"),
    T("8-phys-speed", "السرعة والحركة", "الفيزياء"),
    T("8-phys-distance-time", "الرسوم البيانية للمسافة والزمن", "الفيزياء"),
    T("8-phys-forces", "القوى المتزنة وغير المتزنة", "الفيزياء"),
    T("8-phys-moments", "عزم القوة", "الفيزياء"),
    T("8-phys-pressure", "الضغط ونظرية الجسيمات", "الفيزياء"),
    T("8-phys-diffusion", "الانتشار وحركة الجسيمات", "الفيزياء"),
    T("8-phys-light", "انعكاس الضوء وانكساره وتشتته والألوان", "الفيزياء"),
    T("8-phys-magnetism", "المجالات المغناطيسية والمغناطيسات الكهربائية", "الفيزياء"),
    T("8-earth-magnetic", "المجال المغناطيسي للأرض", "الأرض والفضاء"),
    T("8-earth-resources", "الموارد المتجددة وغير المتجددة", "الأرض والفضاء"),
    T("8-earth-climate", "الطقس والمناخ ودورات المناخ", "الأرض والفضاء"),
    T("8-space-galaxies", "المجرات والكويكبات", "الأرض والفضاء"),
    T("8-enquiry", "الاستقصاء العلمي وتحليل البيانات وتقييم الأدلة", "الاستقصاء العلمي"),
  ],
  9: [
    T("9-bio-transport", "النقل في النباتات والنتح", "الأحياء"),
    T("9-bio-excretion", "الإخراج في الإنسان", "الأحياء"),
    T("9-bio-genetics", "الحمض النووي والجينات والكروموسومات", "الأحياء"),
    T("9-bio-reproduction", "الإخصاب وتحديد الجنس والتكاثر", "الأحياء"),
    T("9-bio-variation", "التباين والانتخاب الطبيعي", "الأحياء"),
    T("9-bio-photosynthesis", "البناء الضوئي والعناصر المعدنية", "الأحياء"),
    T("9-bio-development", "نمو الجنين وتطوره", "الأحياء"),
    T("9-bio-ecosystems", "التغير البيئي والانقراض", "الأحياء"),
    T("9-chem-periodic", "الجدول الدوري والبنية الذرية", "الكيمياء"),
    T("9-chem-bonding", "الجزيئات والروابط التساهمية والأيونية", "الكيمياء"),
    T("9-chem-groups", "اتجاهات المجموعات وخواص المواد والكثافة", "الكيمياء"),
    T("9-chem-equations", "المعادلات الكيميائية والإزاحة والأملاح", "الكيمياء"),
    T("9-chem-rate", "سرعة التفاعل وحفظ الكتلة", "الكيمياء"),
    T("9-phys-density", "الكثافة والطفو والغوص", "الفيزياء"),
    T("9-phys-thermal", "الحرارة ودرجة الحرارة وحفظ الطاقة", "الفيزياء"),
    T("9-phys-transfer", "التوصيل والحمل والإشعاع والتبخر", "الفيزياء"),
    T("9-phys-waves", "الموجات الصوتية والتداخل", "الفيزياء"),
    T("9-phys-circuits", "دوائر التوازي والجهد والتيار والمقاومة", "الفيزياء"),
    T("9-earth-tectonics", "أدلة الصفائح التكتونية", "الأرض والفضاء"),
    T("9-earth-carbon", "دورة الكربون وتغير المناخ", "الأرض والفضاء"),
    T("9-space-origins", "الكويكبات وتكوّن القمر والسدم", "الأرض والفضاء"),
    T("9-enquiry", "الاستقصاء العلمي وتصميم التجارب وتحليل النتائج", "الاستقصاء العلمي"),
  ],
};

const IGCSE_PHYSICS_TOPICS: readonly CambridgeTopicOption[] = [
  T("ig-phy-1", "الحركة والقوى والطاقة", "الفيزياء"),
  T("ig-phy-2", "الفيزياء الحرارية", "الفيزياء"),
  T("ig-phy-3", "الموجات", "الفيزياء"),
  T("ig-phy-4", "الكهرباء والمغناطيسية", "الفيزياء"),
  T("ig-phy-5", "الفيزياء النووية", "الفيزياء"),
  T("ig-phy-6", "فيزياء الفضاء", "الفيزياء"),
];

const IGCSE_CHEMISTRY_TOPICS: readonly CambridgeTopicOption[] = [
  T("ig-chem-1", "حالات المادة", "الكيمياء"),
  T("ig-chem-2", "الذرات والعناصر والمركبات", "الكيمياء"),
  T("ig-chem-3", "الحسابات الكيميائية والستويكيومترية", "الكيمياء"),
  T("ig-chem-4", "الكيمياء الكهربائية", "الكيمياء"),
  T("ig-chem-5", "الطاقة الكيميائية", "الكيمياء"),
  T("ig-chem-6", "التفاعلات الكيميائية", "الكيمياء"),
  T("ig-chem-7", "الأحماض والقواعد والأملاح", "الكيمياء"),
  T("ig-chem-8", "الجدول الدوري", "الكيمياء"),
  T("ig-chem-9", "الفلزات", "الكيمياء"),
  T("ig-chem-10", "كيمياء البيئة", "الكيمياء"),
  T("ig-chem-11", "الكيمياء العضوية", "الكيمياء"),
  T("ig-chem-12", "التقنيات التجريبية والتحليل الكيميائي", "الكيمياء"),
];

const IGCSE_BIOLOGY_TOPICS: readonly CambridgeTopicOption[] = [
  T("ig-bio-1", "خصائص الكائنات الحية وتصنيفها", "الأحياء"),
  T("ig-bio-2", "تنظيم الكائن الحي", "الأحياء"),
  T("ig-bio-3", "حركة المواد إلى الخلايا ومنها", "الأحياء"),
  T("ig-bio-4", "الجزيئات الحيوية", "الأحياء"),
  T("ig-bio-5", "الإنزيمات", "الأحياء"),
  T("ig-bio-6", "تغذية النبات", "الأحياء"),
  T("ig-bio-7", "تغذية الإنسان", "الأحياء"),
  T("ig-bio-8", "النقل في النباتات", "الأحياء"),
  T("ig-bio-9", "النقل في الحيوانات", "الأحياء"),
  T("ig-bio-10", "الأمراض والمناعة", "الأحياء"),
  T("ig-bio-11", "تبادل الغازات في الإنسان", "الأحياء"),
  T("ig-bio-12", "التنفس", "الأحياء"),
  T("ig-bio-13", "الإخراج في الإنسان", "الأحياء"),
  T("ig-bio-14", "التنسيق والاستجابة", "الأحياء"),
  T("ig-bio-15", "الأدوية والعقاقير", "الأحياء"),
  T("ig-bio-16", "التكاثر", "الأحياء"),
  T("ig-bio-17", "الوراثة", "الأحياء"),
  T("ig-bio-18", "التباين والانتخاب", "الأحياء"),
  T("ig-bio-19", "الكائنات الحية وبيئتها", "الأحياء"),
  T("ig-bio-20", "تأثير الإنسان في النظم البيئية", "الأحياء"),
  T("ig-bio-21", "التقنية الحيوية والتعديل الوراثي", "الأحياء"),
];

function prefixedTopics(prefix: string, strand: string, topics: readonly CambridgeTopicOption[]): CambridgeTopicOption[] {
  return topics.map((topic) => ({ ...topic, id: `${prefix}-${topic.id}`, strand }));
}

const IGCSE_COORDINATED_BIOLOGY_TOPICS: readonly CambridgeTopicOption[] = IGCSE_BIOLOGY_TOPICS.filter((topic) =>
  !["الإخراج في الإنسان", "التقنية الحيوية والتعديل الوراثي"].includes(topic.label),
);

const IGCSE_COMBINED_BIOLOGY_TOPICS: readonly CambridgeTopicOption[] = IGCSE_BIOLOGY_TOPICS.filter((topic) =>
  !["الإخراج في الإنسان", "التنسيق والاستجابة", "الوراثة", "التباين والانتخاب", "التقنية الحيوية والتعديل الوراثي"].includes(topic.label),
);

const IGCSE_COMBINED_PHYSICS_TOPICS: readonly CambridgeTopicOption[] = [
  T("ig-combined-phy-1", "الحركة والقوى والطاقة", "الفيزياء"),
  T("ig-combined-phy-2", "الفيزياء الحرارية", "الفيزياء"),
  T("ig-combined-phy-3", "الموجات", "الفيزياء"),
  T("ig-combined-phy-4", "الكهرباء", "الفيزياء"),
  T("ig-combined-phy-5", "فيزياء الفضاء", "الفيزياء"),
];

const IGCSE_COMBINED_SCIENCE_TOPICS: readonly CambridgeTopicOption[] = [
  ...prefixedTopics("combined-bio", "الأحياء", IGCSE_COMBINED_BIOLOGY_TOPICS),
  ...prefixedTopics("combined-chem", "الكيمياء", IGCSE_CHEMISTRY_TOPICS),
  ...prefixedTopics("combined-phys", "الفيزياء", IGCSE_COMBINED_PHYSICS_TOPICS),
];

const IGCSE_COORDINATED_SCIENCE_TOPICS: readonly CambridgeTopicOption[] = [
  ...prefixedTopics("coordinated-bio", "الأحياء", IGCSE_COORDINATED_BIOLOGY_TOPICS),
  ...prefixedTopics("coordinated-chem", "الكيمياء", IGCSE_CHEMISTRY_TOPICS),
  ...prefixedTopics("coordinated-phys", "الفيزياء", IGCSE_PHYSICS_TOPICS),
];

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
  if (programmeId === "igcse") return "كامبريدج IGCSE";
  return stage ? `الصف ${stage} · المرحلة ${stage}` : "مرحلة غير محددة";
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

export function levelSelectionValue(programmeId: CambridgeProgrammeId, stage: number | null): string {
  if (programmeId === "igcse") return "igcse";
  return `${programmeId}:${stage ?? defaultStageForProgramme(programmeId)}`;
}

export function levelOptionForValue(value: string): CambridgeLevelOption | null {
  return CAMBRIDGE_LEVEL_OPTIONS.find((item) => item.id === value) ?? null;
}

export function topicsForSelection(
  programmeId: CambridgeProgrammeId,
  subjectId: string,
  stage: number | null,
): CambridgeTopicOption[] {
  if (programmeId === "primary") return [...(PRIMARY_TOPICS[stage ?? 0] ?? [])];
  if (programmeId === "lower_secondary") return [...(LOWER_SECONDARY_TOPICS[stage ?? 0] ?? [])];
  if (programmeId !== "igcse") return [];
  if (subjectId === "physics") return [...IGCSE_PHYSICS_TOPICS];
  if (subjectId === "chemistry") return [...IGCSE_CHEMISTRY_TOPICS];
  if (subjectId === "biology") return [...IGCSE_BIOLOGY_TOPICS];
  if (subjectId === "combined_science") return [...IGCSE_COMBINED_SCIENCE_TOPICS];
  if (subjectId === "coordinated_sciences") return [...IGCSE_COORDINATED_SCIENCE_TOPICS];
  return [];
}

export function isKnownTopicForSelection(
  programmeId: CambridgeProgrammeId,
  subjectId: string,
  stage: number | null,
  label: string,
): boolean {
  return topicsForSelection(programmeId, subjectId, stage).some((topic) => topic.label === label);
}
