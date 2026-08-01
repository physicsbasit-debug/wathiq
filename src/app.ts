import { MOCK_LIBRARY, MOCK_SOURCES, SUBJECTS } from "./data.js";
import {
  applyOfficialAssessmentTemplate,
  approveExamDraft,
  buildPlan,
  createEmptyDraft,
  MAX_LESSON_TOPICS,
  MIN_LESSON_TOPICS,
  normalizeLessonTopics,
  reopenExamDraft,
  isPlanComplete,
  selectedProposal,
  setExamTitle,
  syncDraftTopicFromLessons,
  validateExamSetup,
} from "./domain.js";
import { clearDraft, loadDraft, loadDrafts, loadProfile, loadSources, saveDraft, saveProfile, saveSources, setActiveDraftId } from "./storage.js";
import type { ExamDraft, ExamTitleOption, ManagedSource, PlanItem, QuestionCounts, SourceDraft, SourceStatus, SourceExtractionResult, SourceStructureNode, ViewName, WizardStep } from "./types.js";
import { escapeHtml, formatArabicDate, icon } from "./ui.js";
import { isAiIllustrationEligible, questionVisualTypeLabel, renderQuestionVisualSvg, stripQuestionVisualIllustration, validateQuestionVisualSpec } from "./question-visual.js";
import { buildStandaloneExamDocument, downloadWordHtml, interleaveAssessmentItems, printHtmlDocument, safeExportFileName } from "./exam-export.js";
import { buildSourceDrivePath, changeSourceStatus, createEmptySourceDraft, createManagedSource, findDuplicateContentSource, findDuplicateSource, sourceSubjectLabel, SOURCE_KINDS, SOURCE_SEMESTERS, validateSourceDraft } from "./source-domain.js";
import { createRegistryBackup, mergeSourceRegistry, parseRegistryBackup } from "./source-registry.js";
import { CentralSourceStore } from "./central-source-store.js";
import { getRuntimeConfig, isCentralStorageConfigured, isGoogleDriveConfigured } from "./runtime-config.js";
import { GoogleDriveService, type GoogleDriveStatus, type PendingSourceUpload, type SourceUploadProgress } from "./google-drive.js";
import { extractPdfText, shouldInvalidateLegacyExtraction, type PdfExtractionProgress } from "./pdf-indexer.js";
import { extractSourceStructure } from "./source-structure.js";
import { extractPdfWithArabicOcr } from "./ocr-indexer.js";
import { resolveInitialView, viewFromHash, viewHash } from "./navigation.js";
import { rankSourceChunks, SOURCE_RETRIEVAL_VERSION, type SourceChunkCandidate } from "./source-retrieval.js";
import { buildLessonCatalog, selectedLessonIds, type LessonCatalogOption } from "./lesson-catalog.js";
import { buildCuratedBookStructure } from "./book-content-tree.js";
import {
  applyGeneratedQuestions,
  buildQuestionGenerationRequest,
  QuestionGenerationService,
  SOURCE_GENERATION_VERSION,
  splitQuestionGenerationBatches,
} from "./question-generation.js";
import {
  ASSESSMENT_GENERATION_V2_VERSION,
  applyWholeExamQuestionsV2,
  buildWholeExamGenerationRequestV2,
  parseWholeExamGenerationResponseV2,
} from "./assessment-generation-v2.js";
import {
  ASSESSMENT_ITEM_WRITING_RULES,
  INTERNATIONAL_SCIENCE_QUESTION_STYLE_PRINCIPLES,
  SCIENCE_ASSESSMENT_POLICY_DOCUMENT_PATH,
  SCIENCE_ASSESSMENT_POLICY_PUBLISHED,
  SCIENCE_ASSESSMENT_POLICY_TITLE,
  SCIENCE_ASSESSMENT_POLICY_VERSION,
  EXAM_TITLE_OPTIONS,
  getOfficialAssessmentSpec,
  getOfficialFinalExamSpec,
  getOfficialShortTestSpec,
} from "./assessment-policy.js";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("تعذر العثور على جذر التطبيق.");
const app: HTMLDivElement = appRoot;

const ACTIVE_VIEW_STORAGE_KEY = "wathiq-active-view-v1";

interface AppState {
  view: ViewName;
  draft: ExamDraft;
  saveState: "محفوظ" | "جارٍ الحفظ" | "غير محفوظ";
  libraryFilter: "الكل" | "مسودة" | "معتمد";
  toast: string;
  sources: ManagedSource[];
  sourceFormOpen: boolean;
  sourceDraft: SourceDraft;
  sourceFilter: "الكل" | SourceStatus;
  selectedSourceId: string;
  sourceStorageStatus: "محلي" | "يتطلب تسجيل الدخول" | "متصل" | "خطأ";
  sourceStorageMessage: string;
  sourceStorageBusy: boolean;
  ownerEmail: string;
  driveStatus: "غير مهيأ" | "يتطلب تسجيل الدخول" | "غير متصل" | "متصل" | "خطأ";
  driveMessage: string;
  driveBusy: boolean;
  driveRootFolderUrl: string;
  driveFoldersReady: boolean;
  driveFolders: GoogleDriveStatus["folders"];
  sourceFile: File | null;
  sourceUploadBusy: boolean;
  sourceUploadProgress: number;
  sourceUploadMessage: string;
  pendingSourceUpload: PendingSourceUpload | null;
  sourceIndexingId: string;
  sourceIndexingProgress: number;
  sourceIndexingMessage: string;
  sourceRetrievalBusy: boolean;
  sourceRetrievalMessage: string;
  questionGenerationBusy: boolean;
  questionGenerationMessage: string;
  lessonCatalog: LessonCatalogOption[];
  lessonCatalogKey: string;
  lessonCatalogBusy: boolean;
  lessonCatalogMessage: string;
  lessonCatalogActiveUnitKey: string;
  visualEnhancementBusyIds: Set<string>;
  visualEnhancementMessages: Record<string, string>;
  visualEnhancementAutoStarted: boolean;
}


const runtimeConfig = getRuntimeConfig();
const centralSourceStore = isCentralStorageConfigured(runtimeConfig)
  ? new CentralSourceStore(runtimeConfig)
  : null;
const googleDriveService = centralSourceStore && isGoogleDriveConfigured(runtimeConfig)
  ? new GoogleDriveService(runtimeConfig, centralSourceStore)
  : null;
const questionGenerationService = centralSourceStore
  ? new QuestionGenerationService(runtimeConfig, () => centralSourceStore.getActiveSession())
  : null;

const savedDraft = loadDraft();
const savedProfile = loadProfile();
const initialDraft = savedDraft ?? createEmptyDraft();
if (savedProfile) {
  initialDraft.school = savedProfile.school;
  initialDraft.directorate = savedProfile.directorate;
}

const initialView = resolveInitialView(window.location.hash, window.sessionStorage.getItem(ACTIVE_VIEW_STORAGE_KEY));

const state: AppState = {
  view: initialView,
  draft: initialDraft,
  saveState: savedDraft ? "محفوظ" : "غير محفوظ",
  libraryFilter: "الكل",
  toast: "",
  sources: loadSources() ?? MOCK_SOURCES,
  sourceFormOpen: false,
  sourceDraft: createEmptySourceDraft(),
  sourceFilter: "الكل",
  selectedSourceId: "",
  sourceStorageStatus: centralSourceStore ? "يتطلب تسجيل الدخول" : "محلي",
  sourceStorageMessage: centralSourceStore
    ? "سجّل دخول مالك المنصة للوصول إلى سجل المصادر المركزي."
    : "لم تُضبط بيانات Supabase بعد؛ يعمل السجل محليًا فقط.",
  sourceStorageBusy: false,
  ownerEmail: "",
  driveStatus: googleDriveService ? "يتطلب تسجيل الدخول" : "غير مهيأ",
  driveMessage: googleDriveService
    ? "سجّل دخول مالك المنصة أولًا، ثم اربط Google Drive مرة واحدة."
    : "لم تُضبط بيانات Google OAuth بعد.",
  driveBusy: false,
  driveRootFolderUrl: "",
  driveFoldersReady: false,
  driveFolders: [],
  sourceFile: null,
  sourceUploadBusy: false,
  sourceUploadProgress: 0,
  sourceUploadMessage: "",
  pendingSourceUpload: googleDriveService?.getPendingUpload() ?? null,
  sourceIndexingId: "",
  sourceIndexingProgress: 0,
  sourceIndexingMessage: "",
  sourceRetrievalBusy: false,
  sourceRetrievalMessage: "",
  questionGenerationBusy: false,
  questionGenerationMessage: "",
  lessonCatalog: [],
  lessonCatalogKey: "",
  lessonCatalogBusy: false,
  lessonCatalogMessage: "",
  lessonCatalogActiveUnitKey: "",
  visualEnhancementBusyIds: new Set<string>(),
  visualEnhancementMessages: {},
  visualEnhancementAutoStarted: false,
};

let saveTimer: number | undefined;

function persistDraftCheckpoint(showFailure = true): boolean {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  try {
    state.draft.updatedAt = new Date().toISOString();
    saveDraft(state.draft);
    saveProfile({ school: state.draft.school, directorate: state.draft.directorate });
    state.saveState = "محفوظ";
    renderTopSaveState();
    return true;
  } catch (error) {
    state.saveState = "غير محفوظ";
    renderTopSaveState();
    if (showFailure) {
      const detail = error instanceof Error ? error.message : "تعذر الوصول إلى تخزين المتصفح.";
      showToast(`تعذر حفظ المسودة: ${detail}`);
    }
    return false;
  }
}

function scheduleSave(): void {
  state.saveState = "جارٍ الحفظ";
  renderTopSaveState();
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    persistDraftCheckpoint();
  }, 350);
}

function saveNow(): void {
  if (persistDraftCheckpoint()) showToast("تم حفظ أحدث حالة للمسودة.");
}

window.addEventListener("pagehide", () => { persistDraftCheckpoint(false); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistDraftCheckpoint(false);
});

function showToast(message: string): void {
  state.toast = message;
  render();
  window.setTimeout(() => {
    if (state.toast === message) {
      state.toast = "";
      render();
    }
  }, 2200);
}

function syncActiveView(view: ViewName, replace = false): void {
  window.sessionStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, view);
  const nextHash = viewHash(view);
  if (window.location.hash === nextHash) return;
  if (replace) window.history.replaceState({ view }, "", nextHash);
  else window.history.pushState({ view }, "", nextHash);
}

function navigate(view: ViewName): void {
  state.view = view;
  syncActiveView(view);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function restoreViewFromLocation(): void {
  const nextView = viewFromHash(window.location.hash) ?? "home";
  if (nextView === state.view) return;
  state.view = nextView;
  window.sessionStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, nextView);
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}

window.addEventListener("popstate", restoreViewFromLocation);
window.addEventListener("hashchange", restoreViewFromLocation);

function setStep(step: WizardStep): void {
  if (state.draft.status === "معتمد" && step < 4) {
    showToast("الاختبار معتمد. ألغِ الاعتماد أولًا لفتح التعديل.");
    return;
  }
  state.draft.currentStep = step;
  scheduleSave();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function invalidateGeneratedQuestions(): void {
  state.draft.plan = [];
  state.draft.selectedProposalByPlanItem = {};
  state.draft.generationVersion = "";
  state.draft.generationModel = "";
  state.draft.generatedAt = "";
  state.draft.approvedAt = "";
  state.draft.status = "مسودة";
  state.questionGenerationMessage = "";
}

function invalidateSourceAndGeneratedQuestions(): void {
  state.draft.sourceReferences = [];
  state.draft.sourceRetrievalVersion = "";
  state.sourceRetrievalMessage = "";
  invalidateGeneratedQuestions();
}

function render(): void {
  app.innerHTML = `
    ${renderHeader()}
    <main class="app-main">
      ${renderView()}
    </main>
    ${renderMobileNav()}
    ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
  `;
  bindEvents();
}

function renderHeader(): string {
  return `
    <header class="topbar">
      <button class="brand" data-nav="home" aria-label="الذهاب إلى الصفحة الرئيسية">
        <span class="brand-mark">و</span>
        <span><strong>واثق</strong><small>اختبار علمي بلا متاهة</small></span>
      </button>
      <nav class="desktop-nav" aria-label="التنقل الرئيسي">
        ${navButton("home", "الرئيسية", "home")}
        ${navButton("wizard", "اختبار جديد", "plus")}
        ${navButton("library", "اختباراتي", "files")}
        ${navButton("policy", "مرجع التقويم", "book")}
        ${navButton("admin", "إدارة المحتوى", "admin")}
      </nav>
      <div class="header-actions">
        <span class="credit-pill"><b>5</b> حزم متاحة</span>
        <button class="ghost-btn compact" data-action="save-now">${icon("save")}<span id="save-label">${state.saveState}</span></button>
      </div>
    </header>
  `;
}

function navButton(view: ViewName, label: string, iconName: Parameters<typeof icon>[0]): string {
  const active = state.view === view;
  return `<button class="nav-button ${active ? "active" : ""}" data-nav="${view}" ${active ? 'aria-current="page"' : ""}>${icon(iconName)}<span>${label}</span></button>`;
}

function renderMobileNav(): string {
  return `
    <nav class="mobile-nav" aria-label="التنقل للجوال">
      ${navButton("home", "الرئيسية", "home")}
      ${navButton("wizard", "جديد", "plus")}
      ${navButton("library", "اختباراتي", "files")}
      ${navButton("policy", "المرجع", "book")}
      ${navButton("admin", "الإدارة", "admin")}
    </nav>
  `;
}

function renderView(): string {
  if (state.view === "home") return renderHome();
  if (state.view === "wizard") return renderWizard();
  if (state.view === "library") return renderLibrary();
  if (state.view === "policy") return renderPolicyReference();
  return renderAdmin();
}

function renderHome(): string {
  const hasDraft = Boolean(loadDraft());
  return `
    <section class="hero-panel">
      <div class="hero-copy">
        <span class="eyebrow">مرجع تقويم رسمي · توليد موثق من المصدر</span>
        <h1>أنشئ اختبارك بثقة.</h1>
        <p>أربع خطوات واضحة. المصادر والفحوص وجدول المواصفات تعمل في الخلفية، حيث تنتمي التفاصيل المزعجة.</p>
        <div class="hero-actions">
          <button class="primary-btn" data-action="new-exam">${icon("plus")} إنشاء اختبار جديد</button>
          ${hasDraft ? `<button class="secondary-btn" data-action="resume-draft">متابعة آخر مسودة ${icon("arrow")}</button>` : ""}
        </div>
      </div>
      <div class="confidence-card" aria-label="ملخص الخدمة">
        <div class="confidence-score">واثق</div>
        <ul>
          <li>${icon("check")} استرجاع المقاطع مع أرقام الصفحات</li>
          <li>${icon("check")} ثلاثة بدائل موثقة لكل مفردة</li>
          <li>${icon("check")} إجابة نموذجية ودليل من نص المصدر</li>
          <li>${icon("check")} اختبار مطابق لوثيقة تقويم العلوم</li>
        </ul>
      </div>
    </section>

    <section class="dashboard-grid">
      <article class="action-card featured">
        <span class="card-icon">${icon("plus")}</span>
        <div><h2>إنشاء اختبار جديد</h2><p>ابدأ باختيار الصف والمادة، ثم دع واثق يرتب الباقي دون استعراض عضلاته أمام المعلم.</p></div>
        <button class="card-link" data-action="new-exam">ابدأ الآن ${icon("arrow")}</button>
      </article>
      <article class="action-card">
        <span class="card-icon">${icon("files")}</span>
        <div><h2>اختباراتي</h2><p>مسوداتك واختباراتك المعتمدة في مكان واحد، بلا حفريات داخل المجلدات.</p></div>
        <button class="card-link" data-nav="library">فتح المكتبة ${icon("arrow")}</button>
      </article>
      <article class="action-card">
        <span class="card-icon">${icon("book")}</span>
        <div><h2>مرجع تقويم العلوم</h2><p>ملخص عملي للوثيقة الرسمية وضوابط بناء الاختبارات القصيرة والنهائية للصفوف 5-10.</p></div>
        <button class="card-link" data-nav="policy">فتح المرجع ${icon("arrow")}</button>
      </article>
    </section>

    <section class="summary-strip">
      <div><span>الرصيد الحالي</span><strong>5 حزم</strong></div>
      <div><span>حالة الحساب</span><strong class="status-good">نشط</strong></div>
      <div><span>آخر حفظ</span><strong>${state.saveState}</strong></div>
      <div><span>بيانات المدرسة</span><strong>${escapeHtml(state.draft.school || "غير مكتملة")}</strong></div>
    </section>
  `;
}

function renderWizard(): string {
  return `
    <section class="page-heading">
      <div><span class="eyebrow">إنشاء اختبار جديد</span><h1>${wizardTitle(state.draft.currentStep)}</h1></div>
      <div class="save-indicator"><span class="dot"></span><span id="save-label-secondary">${state.saveState}</span></div>
    </section>
    ${renderStepper()}
    <section class="wizard-shell">
      ${renderWizardStep()}
    </section>
  `;
}

function wizardTitle(step: WizardStep): string {
  return ({ 1: "حدد المحتوى", 2: "اضبط الاختبار", 3: "اختر الأسئلة", 4: "راجع واعتمد" } as const)[step];
}

function renderStepper(): string {
  const steps: Array<{ id: WizardStep; label: string }> = [
    { id: 1, label: "المحتوى" },
    { id: 2, label: "الإعداد" },
    { id: 3, label: "الخطة والأسئلة" },
    { id: 4, label: "المراجعة" },
  ];
  return `<ol class="stepper" aria-label="مراحل إنشاء الاختبار">${steps
    .map((step) => {
      const status = state.draft.currentStep === step.id ? "active" : state.draft.currentStep > step.id ? "done" : "";
      return `<li class="${status}"><button data-step="${step.id}" ${(state.draft.currentStep < step.id || (state.draft.status === "معتمد" && step.id < 4)) ? "disabled" : ""}><span>${status === "done" ? icon("check") : step.id}</span><b>${step.label}</b></button></li>`;
    })
    .join("")}</ol>`;
}

function renderWizardStep(): string {
  switch (state.draft.currentStep) {
    case 1:
      return renderContentStep();
    case 2:
      return renderSetupStep();
    case 3:
      return renderPlanStep();
    case 4:
      return renderReviewStep();
  }
}

function eligibleSourcesForDraft(): ManagedSource[] {
  return state.sources.filter((source) =>
    source.grade === state.draft.grade &&
    source.subjectId === state.draft.subjectId &&
    source.status === "مفهرس" &&
    source.extractionStatus === "مكتمل",
  );
}

function lessonCatalogSelectionKey(): string {
  return [state.draft.grade ?? "", state.draft.subjectId, ...eligibleSourcesForDraft().map((source) => `${source.id}:${source.updatedAt}`)].join("|");
}

interface LessonUnitGroup {
  key: string;
  sourceId: string;
  sourceTitle: string;
  unitLabel: string;
  lessons: LessonCatalogOption[];
}

function lessonUnitKey(sourceId: string, unitLabel: string): string {
  return `${sourceId}::${unitLabel}`;
}

function buildLessonUnitGroups(catalog: LessonCatalogOption[]): LessonUnitGroup[] {
  const groups = new Map<string, LessonUnitGroup>();
  catalog.forEach((lesson) => {
    const unitLabel = lesson.unitLabel || "دروس الكتاب";
    const key = lessonUnitKey(lesson.sourceId, unitLabel);
    const group = groups.get(key) ?? {
      key,
      sourceId: lesson.sourceId,
      sourceTitle: lesson.sourceTitle,
      unitLabel,
      lessons: [],
    };
    group.lessons.push(lesson);
    groups.set(key, group);
  });
  return [...groups.values()];
}

function resolveActiveLessonUnitKey(groups: LessonUnitGroup[], selectedLabels: ReadonlySet<string>): string {
  if (groups.some((group) => group.key === state.lessonCatalogActiveUnitKey)) return state.lessonCatalogActiveUnitKey;
  const selectedGroup = groups.find((group) => group.lessons.some((lesson) => selectedLabels.has(lesson.label)));
  return selectedGroup?.key ?? groups[0]?.key ?? "";
}

function renderLessonOption(
  lesson: LessonCatalogOption,
  selectedLabels: Set<string>,
  selectedCount: number,
  unitKey: string,
): string {
  const checked = selectedLabels.has(lesson.label);
  const disabled = !checked && selectedCount >= MAX_LESSON_TOPICS;
  const pages = lesson.pageStart
    ? `<small>${lesson.pageStart === lesson.pageEnd || !lesson.pageEnd ? `ص ${lesson.pageStart}` : `ص ${lesson.pageStart}-${lesson.pageEnd}`}</small>`
    : `<small class="lesson-page-pending">صفحات مستخرجة من عنوان الدرس</small>`;
  return `<label class="lesson-catalog-option ${checked ? "selected" : ""} ${disabled ? "disabled" : ""}"><input type="checkbox" data-lesson-option-id="${escapeHtml(lesson.id)}" data-lesson-unit-key="${escapeHtml(unitKey)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}/><span><b>${escapeHtml(lesson.code)}</b><strong>${escapeHtml(lesson.title)}</strong>${pages}</span></label>`;
}

function renderLessonCatalog(): string {
  const selectedLabels = new Set(normalizeLessonTopics(state.draft.lessonTopics));
  const selectedCount = selectedLabels.size;
  if (state.draft.grade === null || !state.draft.subjectId) {
    return `<div class="lesson-catalog-empty">اختر الصف والمادة، وستظهر شجرة الكتاب هنا تلقائيًا.</div>`;
  }
  if (state.lessonCatalogBusy) {
    return `<div class="lesson-catalog-empty">جارٍ تجهيز شجرة الكتاب والوحدات والدروس…</div>`;
  }
  if (!state.lessonCatalog.length) {
    return `<div class="lesson-catalog-empty warning">${escapeHtml(state.lessonCatalogMessage || "لم يجد واثق شجرة دروس موثوقة للمصدر المطابق.")}</div>`;
  }

  const unitGroups = buildLessonUnitGroups(state.lessonCatalog);
  const activeUnitKey = resolveActiveLessonUnitKey(unitGroups, selectedLabels);
  state.lessonCatalogActiveUnitKey = activeUnitKey;
  const activeIndex = Math.max(0, unitGroups.findIndex((group) => group.key === activeUnitKey));
  const activeGroup = unitGroups[activeIndex] ?? unitGroups[0];
  if (!activeGroup) return `<div class="lesson-catalog-empty warning">لا توجد وحدات قابلة للعرض.</div>`;
  const previousGroup = unitGroups[activeIndex - 1];
  const nextGroup = unitGroups[activeIndex + 1];
  const sourceLessons = state.lessonCatalog.filter((lesson) => lesson.sourceId === activeGroup.sourceId);
  const sourceUnits = unitGroups.filter((group) => group.sourceId === activeGroup.sourceId);
  const selectedLessons = state.lessonCatalog.filter((lesson) => selectedLabels.has(lesson.label));
  const multipleSources = new Set(unitGroups.map((group) => group.sourceId)).size > 1;

  return `
    <div class="lesson-unit-navigation" aria-label="التنقل بين وحدات الكتاب">
      <button type="button" class="lesson-unit-nav-button" data-lesson-unit-target="${escapeHtml(previousGroup?.key ?? "")}" ${previousGroup ? "" : "disabled"}><span aria-hidden="true">→</span><b>الوحدة السابقة</b></button>
      <label class="lesson-unit-jump"><span>انتقل إلى وحدة</span><select id="lesson-unit-select">${unitGroups.map((group, index) => `<option value="${escapeHtml(group.key)}" ${group.key === activeGroup.key ? "selected" : ""}>${index + 1}. ${escapeHtml(multipleSources ? `${group.sourceTitle} — ${group.unitLabel}` : group.unitLabel)}</option>`).join("")}</select><small>الوحدة ${activeIndex + 1} من ${unitGroups.length}</small></label>
      <button type="button" class="lesson-unit-nav-button" data-lesson-unit-target="${escapeHtml(nextGroup?.key ?? "")}" ${nextGroup ? "" : "disabled"}><b>الوحدة التالية</b><span aria-hidden="true">←</span></button>
    </div>
    <div class="lesson-selected-summary ${selectedLessons.length ? "has-selection" : ""}">
      <div><strong>الدروس المحددة</strong><small>${selectedLessons.length ? "تبقى اختياراتك محفوظة عند الانتقال بين الوحدات." : "حدد الدروس المطلوبة، ثم تنقل إلى أي وحدة أخرى دون فقدان الاختيار."}</small></div>
      <div class="lesson-selected-chips">${selectedLessons.length ? selectedLessons.map((lesson) => `<button type="button" data-lesson-unit-target="${escapeHtml(lessonUnitKey(lesson.sourceId, lesson.unitLabel || "دروس الكتاب"))}">${escapeHtml(lesson.label)}</button>`).join("") : `<span>لم تحدد أي درس بعد</span>`}</div>
    </div>
    <div class="lesson-book-tree" data-active-unit-key="${escapeHtml(activeGroup.key)}">
      <details class="lesson-source-tree" open>
        <summary><span class="lesson-source-icon">${icon("book")}</span><div><strong>${escapeHtml(activeGroup.sourceTitle)}</strong><small>${sourceUnits.length} وحدات · ${sourceLessons.length} درسًا مدرجًا</small></div></summary>
        <div class="lesson-source-units" data-source-tree-id="${escapeHtml(activeGroup.sourceId)}">
          <details class="lesson-unit-tree" data-unit-key="${escapeHtml(activeGroup.key)}" open>
            <summary><span>${icon("book")}</span><strong>${escapeHtml(activeGroup.unitLabel)}</strong><small>${activeGroup.lessons.length} ${activeGroup.lessons.length === 1 ? "درس" : "دروس"}</small></summary>
            <div class="lesson-unit-items">${activeGroup.lessons.map((lesson) => renderLessonOption(lesson, selectedLabels, selectedCount, activeGroup.key)).join("")}</div>
          </details>
        </div>
      </details>
    </div>`;
}

function renderContentStep(): string {
  const availableSubjects = SUBJECTS.filter((subject) => state.draft.grade !== null && subject.grades.includes(state.draft.grade));
  const eligibleSources = eligibleSourcesForDraft();
  const references = state.draft.sourceReferences;
  return `
    <div class="section-intro"><h2>اختر دروس الاختبار</h2><p>افتح اسم الكتاب، ثم الوحدة، وحدد من درسين إلى خمسة دروس. اختيار واحد واضح، بلا كتابة يدوية.</p></div>
    <div class="form-grid two-columns">
      <label class="field"><span>الصف</span><select id="grade-select"><option value="">اختر الصف</option>${[5, 6, 7, 8, 9, 10].map((grade) => `<option value="${grade}" ${state.draft.grade === grade ? "selected" : ""}>الصف ${grade}</option>`).join("")}</select></label>
      <label class="field"><span>المادة</span><select id="subject-select" ${availableSubjects.length === 0 ? "disabled" : ""}><option value="">اختر المادة</option>${availableSubjects.map((item) => `<option value="${item.id}" ${state.draft.subjectId === item.id ? "selected" : ""}>${item.label}</option>`).join("")}</select></label>
      <section class="field full lesson-catalog-field" aria-labelledby="lesson-topics-label">
        <div class="lesson-topics-head"><div><span id="lesson-topics-label">شجرة محتوى الكتاب</span><small>الكتاب ← الوحدات ← الدروس</small></div><b id="lesson-topic-count">${normalizeLessonTopics(state.draft.lessonTopics).length}/${MAX_LESSON_TOPICS}</b></div>
        ${renderLessonCatalog()}
      </section>
    </div>

    <section class="source-match-card ${references.length ? "ready" : ""}">
      <div>
        <span class="source-match-label">المصادر المتاحة</span>
        <h3>${state.draft.grade !== null && state.draft.subjectId ? `${eligibleSources.length} مصدر مفهرس مطابق للصف والمادة` : "اختر الصف والمادة أولًا"}</h3>
        <p>${escapeHtml(state.sourceRetrievalMessage || (references.length
          ? `تم ربط الدروس بـ ${references.length} مقطعًا من ${new Set(references.map((reference) => reference.sourceId)).size} مصدر.`
          : "سيبحث واثق عن صفحات كل درس عند الضغط على التالي."))}</p>
      </div>
      ${references.length ? `<div class="source-reference-list">${references.map(renderSourceReference).join("")}</div>` : ""}
    </section>

    ${renderWizardFooter(1, !state.sourceRetrievalBusy)}
  `;
}

function renderSourceReference(reference: ExamDraft["sourceReferences"][number]): string {
  const pages = reference.pageFrom === reference.pageTo ? `ص ${reference.pageFrom}` : `ص ${reference.pageFrom}-${reference.pageTo}`;
  const lesson = reference.lessonTopic ? `<b class="reference-lesson-badge">${escapeHtml(reference.lessonTopic)}</b>` : "";
  return `<article class="source-reference-item"><div><strong>${escapeHtml(reference.sourceTitle)}</strong><span>${escapeHtml(reference.sourceKind)} · ${pages}</span>${lesson}</div><p>${escapeHtml(reference.excerpt)}</p></article>`;
}

function renderSourceContextSummary(): string {
  const references = state.draft.sourceReferences;
  if (!references.length) return "";
  const primaryByLesson = new Map<string, ExamDraft["sourceReferences"][number]>();
  for (const reference of references) {
    const lesson = reference.lessonTopic ?? "درس غير محدد";
    if (!primaryByLesson.has(lesson)) primaryByLesson.set(lesson, reference);
  }
  return `<section class="compact-source-summary"><div><span>مراجع الدروس</span><strong>${primaryByLesson.size} دروس مرتبطة</strong></div><div class="compact-source-chips">${[...primaryByLesson.entries()].map(([lesson, reference]) => {
    const pages = reference.pageFrom === reference.pageTo ? `ص ${reference.pageFrom}` : `ص ${reference.pageFrom}-${reference.pageTo}`;
    return `<span>${escapeHtml(lesson)} · ${pages}</span>`;
  }).join("")}</div></section>`;
}

function renderSetupStep(): string {
  const validation = validateExamSetup(state.draft);
  const officialSpec = getOfficialAssessmentSpec(state.draft.grade, state.draft.title);
  const officialSettings = officialSpec ? `
    <section class="official-spec-card">
      <div class="official-spec-head">
        <div><span class="eyebrow">قالب واثق المتوافق مع الوثيقة</span><h3>${escapeHtml(state.draft.title)} للصف ${state.draft.grade}</h3><p>${officialSpec.durationLabel} · ${officialSpec.totalMarks} درجات · ${officialSpec.minItems}-${officialSpec.maxItems} مفردات</p></div>
        <button class="text-btn" data-nav="policy">عرض المرجع الكامل</button>
      </div>
      <div class="policy-metric-grid">
        <div><span>المعرفة</span><strong>${officialSpec.cognitiveMarks.معرفة}</strong><small>40%</small></div>
        <div><span>التطبيق</span><strong>${officialSpec.cognitiveMarks.تطبيق}</strong><small>40%</small></div>
        <div><span>الاستدلال</span><strong>${officialSpec.cognitiveMarks.استدلال}</strong><small>20%</small></div>
        <div><span>المجموع</span><strong>${officialSpec.totalMarks}</strong><small>درجة</small></div>
      </div>
      ${officialSpec.difficultyMarks ? `<div class="policy-metric-grid difficulty-metrics">
        <div><span>منخفض الصعوبة</span><strong>${officialSpec.difficultyMarks.منخفض}</strong><small>40%</small></div>
        <div><span>متوسط الصعوبة</span><strong>${officialSpec.difficultyMarks.متوسط}</strong><small>40%</small></div>
        <div><span>مرتفع الصعوبة</span><strong>${officialSpec.difficultyMarks.مرتفع}</strong><small>20%</small></div>
        <div><span>نوع التقويم</span><strong>نهائي</strong><small>رسمي</small></div>
      </div>` : ""}
      <div class="official-count-grid">
        ${policyCountCard("اختيار من متعدد", officialSpec.counts.mcq, "درجة واحدة لكل مفردة")}
        ${policyCountCard("إجابة قصيرة", officialSpec.counts.short, "درجة أو درجتان حسب الخطة")}
        ${policyCountCard("إجابة طويلة", officialSpec.counts.long, officialSpec.counts.long ? "ثلاث أو أربع درجات حسب الخطة" : "غير مستخدمة لهذا الصف")}
      </div>
      <p class="policy-lock-note">اختار واثق عددًا صحيحًا داخل النطاق الرسمي، ثم وزع درجات المفردات لتحقيق 40% معرفة و40% تطبيق و20% استدلال. لا تحتاج إلى ضبط الأعداد يدويًا.</p>
    </section>` : `
    <div class="compact-section"><h3>مستوى الصعوبة</h3><div class="segmented">${["سهل", "متوسط", "متقدم"].map((level) => `<button data-difficulty="${level}" class="${state.draft.difficulty === level ? "active" : ""}">${level}</button>`).join("")}</div></div>
    <div class="compact-section">
      <div class="selection-header"><div><h3>أنواع الأسئلة</h3><p>هذا الصف خارج نطاق وثيقة العلوم للصفوف 5-10، لذلك تبقى الإعدادات يدوية.</p></div><span class="marks-summary">المجموع المحسوب: <b>${validation.computedMarks}</b></span></div>
      <div class="count-grid">
        ${countField("mcq", "اختيار من متعدد", state.draft.counts.mcq, "سؤال محدد بإجابة صحيحة واحدة")}
        ${countField("short", "إجابة قصيرة", state.draft.counts.short, "كلمة أو تفسير مختصر أو إكمال")}
        ${countField("long", "إجابة طويلة", state.draft.counts.long, "تحليل أو تفسير أو خطوات حل")}
      </div>
    </div>`;

  return `
    <div class="section-intro"><h2>إعداد الاختبار</h2><p>${officialSpec ? "اختر عنوان الاختبار، وقد طبّق واثق مواصفاته الرسمية تلقائيًا. أكمل بيانات المدرسة والتاريخ فقط." : "حدد البيانات الأساسية وأنواع الأسئلة."}</p></div>
    ${renderSourceContextSummary()}
    <div class="form-grid two-columns">
      ${examTitleSelect()}
      ${inputField("date-input", "تاريخ الاختبار", state.draft.examDate, "date")}
      ${inputField("school-input", "المدرسة", state.draft.school, "text")}
      ${inputField("directorate-input", "المديرية", state.draft.directorate, "text")}
      ${inputField("academic-year-input", "العام الدراسي", state.draft.academicYear, "text")}
      <label class="field"><span>الفصل الدراسي</span><select id="semester-select"><option ${state.draft.semester === "الأول" ? "selected" : ""}>الأول</option><option ${state.draft.semester === "الثاني" ? "selected" : ""}>الثاني</option></select></label>
      ${officialSpec
        ? `<label class="field readonly-field"><span>الزمن</span><input value="${officialSpec.durationLabel}" readonly/></label><label class="field readonly-field"><span>الدرجة الكلية</span><input value="${officialSpec.totalMarks}" readonly/></label>`
        : `${inputField("duration-input", "الزمن بالدقائق", state.draft.durationMinutes, "number", "", "10")}${inputField("marks-input", "الدرجة الكلية", state.draft.totalMarks, "number", "", "5")}`}
    </div>

    <section class="generation-mode-panel">
      <div class="generation-mode-heading"><div><span class="eyebrow">طريقة إنشاء الاختبار</span><h3>محرك التوليد</h3></div><span class="generation-mode-badge">V2 تجريبي آمن</span></div>
      <div class="generation-mode-options">
        <label class="generation-mode-option ${state.draft.generationMode === "whole_exam_v2" ? "selected" : ""}">
          <input type="radio" name="generation-mode" value="whole_exam_v2" ${state.draft.generationMode === "whole_exam_v2" ? "checked" : ""}/>
          <span><strong>تصميم الاختبار كاملًا</strong><small>يبني واثق مخطط الاختبار والأسئلة والبيانات كوحدة واحدة، ثم يراجع التنوع وقابلية الحل قبل العرض. هذا هو الخيار الموصى به.</small></span>
        </label>
        <label class="generation-mode-option ${state.draft.generationMode === "legacy_items" ? "selected" : ""}">
          <input type="radio" name="generation-mode" value="legacy_items" ${state.draft.generationMode === "legacy_items" ? "checked" : ""}/>
          <span><strong>المحرك السابق</strong><small>يولد المفردات على دفعات صغيرة. يبقى متاحًا كخطة رجوع ولا يُحذف من التطبيق.</small></span>
        </label>
      </div>
    </section>

    <label class="trusted-enrichment-card ${state.draft.trustedEnrichmentEnabled ? "enabled" : ""}">
      <input id="trusted-enrichment-toggle" type="checkbox" ${state.draft.trustedEnrichmentEnabled ? "checked" : ""}/>
      <span class="trusted-enrichment-check">${state.draft.trustedEnrichmentEnabled ? icon("check") : ""}</span>
      <span><strong>الإثراء من مصادر علمية رسمية وموثوقة</strong><small>يبقى الكتاب المدرسي المرجع الحاكم، ويستخدم واثق البحث الموثق فقط لتنويع السياقات والبيانات والرسوم دون إضافة معرفة مطلوبة خارج المنهج.</small></span>
    </label>

    <label class="trusted-enrichment-card visual-enhancement-card ${state.draft.visualEnhancementEnabled ? "enabled" : ""}">
      <input id="visual-enhancement-toggle" type="checkbox" ${state.draft.visualEnhancementEnabled ? "checked" : ""}/>
      <span class="trusted-enrichment-check">${state.draft.visualEnhancementEnabled ? icon("check") : ""}</span>
      <span><strong>الرسوم الهجينة المنضبطة</strong><small>يحافظ واثق على الرسم العلمي الحتمي أساسًا، ويضيف صورة ثنائية الأبعاد جميلة فقط للمشاهد السياقية الآمنة بعد فحصها علميًا. عند أي فشل يبقى الرسم الأصلي دون تعطيل الاختبار.</small></span>
    </label>

    ${officialSettings}
    ${renderCompliance(validation)}
    ${state.questionGenerationMessage ? `<div class="generation-status ${state.questionGenerationBusy ? "busy" : "notice"}">${state.questionGenerationBusy ? icon("spark") : "!"}<div><strong>${state.questionGenerationBusy ? "مولد الأسئلة يعمل" : "حالة توليد الأسئلة"}</strong><p>${escapeHtml(state.questionGenerationMessage)}</p></div></div>` : ""}
    ${renderWizardFooter(2, validation.valid)}
  `;
}

function policyCountCard(label: string, count: number, note: string): string {
  return `<div class="policy-count-card"><span>${label}</span><strong>${count}</strong><small>${note}</small></div>`;
}

function examTitleSelect(): string {
  return `<label class="field"><span>عنوان الاختبار</span><select id="exam-title-select">${EXAM_TITLE_OPTIONS.map((title) => `<option value="${title}" ${state.draft.title === title ? "selected" : ""}>${title}</option>`).join("")}</select></label>`;
}

function inputField(id: string, label: string, value: string | number, type: string, placeholder = "", min = ""): string {
  return `<label class="field"><span>${label}</span><input id="${id}" type="${type}" value="${escapeHtml(value)}" ${placeholder ? `placeholder="${placeholder}"` : ""} ${min ? `min="${min}"` : ""}/></label>`;
}

function countField(key: keyof QuestionCounts, label: string, value: number, description: string): string {
  return `<div class="count-card"><div><strong>${label}</strong><small>${description}</small></div><div class="counter"><button data-count-key="${key}" data-count-change="-1" aria-label="تقليل ${label}">−</button><input data-count-input="${key}" type="number" min="0" value="${value}" aria-label="عدد أسئلة ${label}"/><button data-count-key="${key}" data-count-change="1" aria-label="زيادة ${label}">+</button></div></div>`;
}

function renderCompliance(validation: ReturnType<typeof validateExamSetup>): string {
  if (validation.valid) {
    return `<div class="compliance success">${icon("check")}<div><strong>الخطة مطابقة لمرجع التقويم</strong><p>يمكنك الانتقال لبناء مفردات الاختبار من صفحات المصدر.</p></div></div>`;
  }
  return `<div class="compliance warning"><div class="warning-mark">!</div><div><strong>تحتاج بعض البيانات إلى ضبط</strong><ul>${validation.issues.map((issue) => `<li>${escapeHtml(issue.message)}</li>`).join("")}</ul>${validation.suggestedCounts ? `<button class="secondary-btn compact" data-action="apply-suggestion">تطبيق التوزيع المقترح: ${validation.suggestedCounts.mcq} متعدد، ${validation.suggestedCounts.short} قصيرة، ${validation.suggestedCounts.long} طويلة</button>` : ""}</div></div>`;
}

function renderPlanStep(): string {
  const selectedCount = Object.keys(state.draft.selectedProposalByPlanItem).length;
  const generationLabel = state.draft.generationModel
    ? `تم التوليد عبر ${state.draft.generationModel} في ${formatArabicDate(state.draft.generatedAt.slice(0, 10))}.`
    : "تم إنشاء الأسئلة من المقاطع المرتبطة بالدروس.";
  const wholeExamMode = state.draft.generationMode === "whole_exam_v2";
  return `
    <div class="section-intro inline"><div><h2>${wholeExamMode ? "راجع الاختبار المصمم كاملًا" : "اختر سؤالًا واحدًا لكل مفردة"}</h2><p>${escapeHtml(state.questionGenerationMessage || generationLabel)} ${wholeExamMode ? "راجع الأسئلة كوحدة واحدة؛ يمكنك إعادة توليد مفردة منفردة بعد ذلك عند الحاجة." : "راجع الصياغة والإجابة ودليل المصدر قبل الاختيار."}</p></div><span class="progress-pill">${selectedCount} من ${state.draft.plan.length}</span></div>
    <div class="plan-stack">${state.draft.plan.map((item, index) => renderPlanItem(item, index)).join("")}</div>
    ${renderWizardFooter(3, isPlanComplete(state.draft))}
  `;
}

function renderProposalOptions(options: string[] | undefined): string {
  if (!options?.length) return "";
  return `<ol class="proposal-options">${options.map((option) => `<li><span class="proposal-option-circle" aria-hidden="true"></span><span>${escapeHtml(option)}</span></li>`).join("")}</ol>`;
}

function renderMarkScheme(points: string[] | undefined): string {
  if (!points?.length) return "";
  return `<div class="proposal-mark-scheme"><strong>نقاط التصحيح (${points.length})</strong><ol>${points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ol></div>`;
}

function renderPlanVisual(item: PlanItem, compact = false): string {
  if (!item.visual || item.visual.type === "none") return "";
  const eligible = isAiIllustrationEligible(item.visual);
  const hasIllustration = Boolean(item.visual.illustration?.validated && eligible);
  const busy = state.visualEnhancementBusyIds.has(item.id);
  const modeLabel = hasIllustration
    ? "صورة 2D مولدة ومدققة علميًا مع رسم حتمي احتياطي"
    : eligible
      ? "رسم علمي حتمي، ويمكن تحسين المشهد بصريًا دون المساس بالبيانات"
      : "رسم علمي حتمي قابل للتحقق";
  const controls = !compact && eligible && state.draft.visualEnhancementEnabled ? `<div class="visual-action-row">
    <button class="secondary-btn compact" data-action="${hasIllustration ? "regenerate-visual" : "enhance-visual"}" data-plan-id="${escapeHtml(item.id)}" ${(busy || state.draft.status === "معتمد") ? "disabled" : ""}>${icon("spark")} ${busy ? "جارٍ تحسين الصورة…" : hasIllustration ? "إعادة توليد الصورة" : "تحسين الصورة ثنائية الأبعاد"}</button>
    ${hasIllustration ? `<button class="text-btn" data-action="restore-deterministic-visual" data-plan-id="${escapeHtml(item.id)}" ${(busy || state.draft.status === "معتمد") ? "disabled" : ""}>استخدام الرسم الحتمي فقط</button>` : ""}
  </div>` : "";
  const message = !compact && state.visualEnhancementMessages[item.id]
    ? `<p class="visual-enhancement-message" aria-live="polite">${escapeHtml(state.visualEnhancementMessages[item.id]!)}</p>`
    : "";
  return `<section class="plan-shared-visual ${compact ? "compact" : ""}"><div class="visual-heading"><strong>${escapeHtml(questionVisualTypeLabel(item.visual.type))}</strong><span>${escapeHtml(modeLabel)}</span></div>${renderQuestionVisualSvg(item.visual)}${controls}${message}</section>`;
}

function renderPlanItem(item: PlanItem, index: number): string {
  const chosen = state.draft.selectedProposalByPlanItem[item.id];
  const reference = state.draft.sourceReferences.find((entry) => entry.id === item.sourceReferenceId);
  const sourceLabel = reference
    ? `${reference.sourceTitle} · ${reference.pageFrom === reference.pageTo ? `ص ${reference.pageFrom}` : `ص ${reference.pageFrom}-${reference.pageTo}`}`
    : "مرجع غير محدد";
  return `<article class="plan-card">
    <header><div class="question-number">${index + 1}</div><div><h3>${item.questionType}</h3><p>${escapeHtml(item.lessonLabel)} · ${escapeHtml(sourceLabel)}</p></div><div class="plan-tags"><span>${item.cognitiveLevel}</span><span>${item.marks} ${item.marks === 1 ? "درجة" : "درجات"}</span></div></header>
    ${renderPlanVisual(item)}
    <div class="proposal-grid">${item.proposals.map((proposal, proposalIndex) => `<label class="proposal-card ${chosen === proposal.id ? "selected" : ""}"><input type="radio" name="proposal-${item.id}" data-plan-id="${item.id}" value="${proposal.id}" ${chosen === proposal.id ? "checked" : ""} ${state.draft.status === "معتمد" ? "disabled" : ""}/><div class="proposal-top"><span>البديل ${proposalIndex + 1}</span><div class="proposal-badges">${proposal.questionForm ? `<b class="question-form-badge">${escapeHtml(proposal.questionForm)}</b>` : ""}${proposal.needsReview ? `<b class="review-needed-badge">يحتاج تدقيقًا أدق</b>` : ""}</div></div>${proposal.stimulus ? `<div class="proposal-stimulus">${escapeHtml(proposal.stimulus)}</div>` : ""}<p>${escapeHtml(proposal.text)}</p>${renderProposalOptions(proposal.options)}<details class="proposal-evidence"><summary>الإجابة ونموذج التصحيح ودليل المصدر</summary><p class="proposal-answer"><strong>الإجابة:</strong> ${escapeHtml(proposal.answer)}</p>${renderMarkScheme(proposal.markScheme)}${proposal.rationale ? `<p><strong>سبب الإجابة:</strong> ${escapeHtml(proposal.rationale)}</p>` : ""}${proposal.sourceSupport ? `<blockquote>${escapeHtml(proposal.sourceSupport)}</blockquote>` : ""}${proposal.enrichmentSupport ? `<div class="proposal-enrichment-evidence"><strong>إثراء علمي موثوق:</strong><p>${escapeHtml(proposal.enrichmentSupport)}</p>${proposal.enrichmentSourceUrl ? `<a href="${escapeHtml(proposal.enrichmentSourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(proposal.enrichmentSourceTitle || "فتح المصدر الرسمي")}</a>` : ""}</div>` : ""}</details><span class="choose-label">${chosen === proposal.id ? `${icon("check")} تم الاختيار` : "اختر هذا السؤال"}</span></label>`).join("")}</div>
    <footer><button class="text-btn" data-regenerate="${item.id}" ${(state.questionGenerationBusy || state.draft.status === "معتمد") ? "disabled" : ""}>${icon("spark")} توليد ثلاثة بدائل مشابهة لهذه المفردة</button></footer>
  </article>`;
}

type SelectedPaperItem = { item: PlanItem; proposal: NonNullable<ReturnType<typeof selectedProposal>> };

interface PaperLayout {
  html: string;
  labels: Map<string, string>;
}

const ARABIC_SUBPART_LABELS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي"];

function renderPaperResponseArea(item: PlanItem, proposal: SelectedPaperItem["proposal"]): string {
  if (proposal.options?.length) {
    return `<ol class="paper-options">${proposal.options.map((option) => `<li><span class="paper-option-circle" aria-hidden="true"></span><em>${escapeHtml(option)}</em></li>`).join("")}</ol>`;
  }
  const lineCount = item.questionType === "إجابة طويلة" ? Math.max(5, item.marks + 2) : Math.max(2, item.marks + 1);
  return `${proposal.workingRequired ? `<p class="working-note">أظهر خطوات الحل بوضوح.</p>` : ""}<div class="answer-lines">${Array.from({ length: lineCount }, () => "<span></span>").join("")}</div>`;
}

function renderPaperPrompt(item: PlanItem, proposal: SelectedPaperItem["proposal"], label: string, subpart: boolean): string {
  return `<div class="${subpart ? "paper-subpart" : "paper-question"}">${proposal.stimulus ? `<div class="paper-stimulus">${escapeHtml(proposal.stimulus)}</div>` : ""}${renderPlanVisual(item, true)}<div class="paper-question-title"><b>${escapeHtml(label)}</b><span>${escapeHtml(proposal.text)}</span><strong>[${item.marks}]</strong></div>${renderPaperResponseArea(item, proposal)}</div>`;
}

function buildPaperLayout(selected: SelectedPaperItem[]): PaperLayout {
  const labels = new Map<string, string>();
  const ordered = interleaveAssessmentItems(
    selected,
    ({ item }) => item.questionType === "اختيار من متعدد",
  );
  let mainNumber = 1;
  const parts: string[] = [];

  for (let index = 0; index < ordered.length;) {
    const entry = ordered[index];
    if (!entry) break;
    if (entry.item.questionType === "اختيار من متعدد") {
      const label = `${mainNumber})`;
      labels.set(entry.item.id, `${mainNumber}`);
      parts.push(`<article class="standalone-question">${renderPaperPrompt(entry.item, entry.proposal, label, false)}</article>`);
      mainNumber += 1;
      index += 1;
      continue;
    }

    const lessonLabel = entry.item.lessonLabel || "مفردات مترابطة";
    const group: SelectedPaperItem[] = [entry];
    let cursor = index + 1;
    while (cursor < ordered.length) {
      const next = ordered[cursor];
      if (!next || next.item.questionType === "اختيار من متعدد" || (next.item.lessonLabel || "مفردات مترابطة") !== lessonLabel) break;
      group.push(next);
      cursor += 1;
    }

    if (group.length === 1) {
      const only = group[0]!;
      const label = `${mainNumber})`;
      labels.set(only.item.id, `${mainNumber}`);
      parts.push(`<article class="standalone-question constructed-standalone">${renderPaperPrompt(only.item, only.proposal, label, false)}</article>`);
    } else {
      const totalMarks = group.reduce((sum, item) => sum + item.item.marks, 0);
      const subparts = group.map((groupEntry, subIndex) => {
        const subLabel = `(${ARABIC_SUBPART_LABELS[subIndex] ?? subIndex + 1})`;
        labels.set(groupEntry.item.id, `${mainNumber}${subLabel}`);
        return renderPaperPrompt(groupEntry.item, groupEntry.proposal, subLabel, true);
      }).join("");
      parts.push(`<article class="structured-question"><header class="structured-question-header"><b>${mainNumber})</b><span>اقرأ الموقف أو البيانات الآتية، ثم أجب عن المفردات المرتبطة بدرس: ${escapeHtml(lessonLabel)}.</span><strong>[المجموع: ${totalMarks}]</strong></header>${subparts}</article>`);
    }
    mainNumber += 1;
    index = cursor;
  }

  return { html: parts.join(""), labels };
}

function renderAnswerKeyArticles(selected: SelectedPaperItem[], labels: Map<string, string>, exportMode = false): string {
  return selected.map(({ item, proposal }) => {
    const reference = state.draft.sourceReferences.find((entry) => entry.id === item.sourceReferenceId);
    const pages = reference ? (reference.pageFrom === reference.pageTo ? `ص ${reference.pageFrom}` : `ص ${reference.pageFrom}-${reference.pageTo}`) : "مرجع غير محدد";
    const label = labels.get(item.id) ?? "؟";
    const headClass = exportMode ? "teacher-key-head" : "answer-key-head";
    return `<article><div class="${headClass}"><strong>${escapeHtml(label)}) ${escapeHtml(proposal.answer)}</strong>${proposal.questionForm ? `<span>${escapeHtml(proposal.questionForm)}</span>` : ""}</div>${renderPlanVisual(item, true)}${renderMarkScheme(proposal.markScheme)}${proposal.rationale ? `<p>${escapeHtml(proposal.rationale)}</p>` : ""}<small>${escapeHtml(reference?.sourceTitle ?? "المصدر")} · ${pages}</small>${proposal.sourceSupport ? `<blockquote>${escapeHtml(proposal.sourceSupport)}</blockquote>` : ""}</article>`;
  }).join("");
}

function renderAnswerKey(selected: SelectedPaperItem[], labels: Map<string, string>): string {
  return `<details class="answer-key"><summary>نموذج الإجابة وأدلة المصدر</summary>${renderAnswerKeyArticles(selected, labels)}</details>`;
}

function renderTeacherAnswerKey(selected: SelectedPaperItem[], labels: Map<string, string>): string {
  return `<section class="teacher-key"><h2>نموذج الإجابة والتصحيح</h2>${renderAnswerKeyArticles(selected, labels, true)}</section>`;
}

interface ReviewReadiness {
  ready: boolean;
  checks: Array<{ label: string; okay: boolean }>;
}

function selectedPaperItems(): SelectedPaperItem[] {
  return state.draft.plan.flatMap((item) => {
    const proposal = selectedProposal(state.draft, item);
    return proposal ? [{ item, proposal }] : [];
  });
}

function visualSignature(item: PlanItem): string {
  if (!item.visual || item.visual.type === "none") return "";
  const { visualId: _visualId, title: _title, altText: _altText, purpose: _purpose, illustration: _illustration, ...structural } = item.visual;
  return JSON.stringify(structural);
}

function reviewReadiness(selected: SelectedPaperItem[]): ReviewReadiness {
  const setupValid = validateExamSetup(state.draft).valid;
  const markTotal = state.draft.plan.reduce((sum, item) => sum + item.marks, 0);
  const groundedGeneration = state.draft.generationVersion === SOURCE_GENERATION_VERSION;
  const markSchemesComplete = selected.length === state.draft.plan.length
    && selected.every(({ item, proposal }) => proposal.markScheme?.length === item.marks);
  const visualItems = state.draft.plan.filter((item) => item.visual && item.visual.type !== "none");
  const visualValidity = visualItems.every((item) => {
    try {
      validateQuestionVisualSpec(item.visual!);
      return true;
    } catch {
      return false;
    }
  });
  const signatures = visualItems.map(visualSignature).filter(Boolean);
  const visualsUnique = signatures.length === new Set(signatures).size;
  const checks = [
    { label: "ارتباط الدروس بالمصدر", okay: state.draft.sourceReferences.length > 0 },
    { label: "مجموع الدرجات", okay: markTotal === state.draft.totalMarks },
    { label: "اختيار مفردات الخطة", okay: isPlanComplete(state.draft) },
    { label: "توليد الأسئلة من المصدر", okay: groundedGeneration },
    { label: "نموذج تصحيح لكل درجة", okay: markSchemesComplete },
    { label: `العناصر البصرية (${visualItems.length})`, okay: visualValidity && visualsUnique },
    { label: "بيانات الاختبار والمواصفة", okay: setupValid },
  ];
  return { ready: checks.every((check) => check.okay), checks };
}

function renderStudentPaper(subject: string, paperLayout: PaperLayout): string {
  return `<section class="paper-preview">
    <header class="paper-header"><div class="ministry-mark">شعار<br/>الخنجر</div><div><strong>سلطنة عُمان</strong><span>وزارة التعليم</span><span>${escapeHtml(state.draft.directorate)}</span><span>${escapeHtml(state.draft.school)}</span></div></header>
    <div class="paper-title"><h2>${escapeHtml(state.draft.title)}</h2><p>${subject} · الصف ${state.draft.grade} · الفصل الدراسي ${escapeHtml(state.draft.semester)} · ${escapeHtml(state.draft.academicYear)}</p></div>
    <div class="student-row"><span>اسم الطالب: ____________________</span><span>التاريخ: ${formatArabicDate(state.draft.examDate)}</span><span>الزمن: ${state.draft.durationMinutes} دقيقة</span></div>
    <div class="paper-questions">${paperLayout.html}</div>
    <footer class="paper-footer">انتهت الأسئلة</footer>
  </section>`;
}

function exportDocumentHtml(kind: "student" | "answer"): { html: string; fileName: string } {
  const selected = selectedPaperItems();
  const paperLayout = buildPaperLayout(selected);
  const subject = SUBJECTS.find((item) => item.id === state.draft.subjectId)?.label ?? "المادة";
  const body = kind === "student"
    ? renderStudentPaper(subject, paperLayout)
    : `${renderStudentPaper(subject, paperLayout)}${renderTeacherAnswerKey(selected, paperLayout.labels)}`;
  const label = kind === "student" ? "ورقة_الطالب" : "نموذج_الإجابة";
  const fileName = safeExportFileName(`${state.draft.title}_${subject}_الصف_${state.draft.grade}_${label}`);
  return {
    html: buildStandaloneExamDocument({
      title: fileName,
      bodyHtml: body,
      kind,
      ...(state.draft.approvedAt ? { approvedAt: formatArabicDate(state.draft.approvedAt.slice(0, 10)) } : {}),
    }),
    fileName,
  };
}

function renderReviewStep(): string {
  const subject = SUBJECTS.find((item) => item.id === state.draft.subjectId)?.label ?? "المادة";
  const selected = selectedPaperItems();
  const paperLayout = buildPaperLayout(selected);
  const readiness = reviewReadiness(selected);
  const approved = state.draft.status === "معتمد";
  const approvalLabel = approved && state.draft.approvedAt
    ? `معتمد بتاريخ ${formatArabicDate(state.draft.approvedAt.slice(0, 10))}`
    : "مسودة قيد المراجعة";
  return `
    <div class="review-layout ${approved ? "approved-review" : ""}">
      ${renderStudentPaper(subject, paperLayout)}
      <aside class="review-panel">
        <div class="approval-status ${approved ? "approved" : "draft"}"><strong>${approved ? `${icon("check")} اختبار معتمد` : "اختبار غير معتمد"}</strong><span>${escapeHtml(approvalLabel)}</span></div>
        <div class="final-check"><h3>حالة ${approved ? "الاختبار" : "المسودة"}</h3>${readiness.checks.map((check) => checkRow(check.label, check.okay)).join("")}</div>
        <div class="review-summary"><span>الدرجة</span><strong>${state.draft.totalMarks}</strong><span>الأسئلة</span><strong>${state.draft.plan.length}</strong><span>الحالة</span><strong>${state.draft.status}</strong></div>
        ${renderAnswerKey(selected, paperLayout.labels)}
        <section class="export-panel"><h3>${approved ? "التصدير النهائي" : "تصدير نسخة مسودة للمراجعة"}</h3><div class="export-grid"><button class="secondary-btn" data-action="export-student-word">ورقة الطالب Word (.doc)</button><button class="secondary-btn" data-action="export-student-pdf">ورقة الطالب PDF / طباعة</button><button class="secondary-btn" data-action="export-answer-word">نموذج الإجابة Word (.doc)</button><button class="secondary-btn" data-action="export-answer-pdf">نموذج الإجابة PDF / طباعة</button></div></section>
        ${approved
          ? `<button class="secondary-btn full approval-toggle" data-action="reopen-draft">إلغاء الاعتماد للتعديل</button>`
          : `<button class="primary-btn full approval-toggle" data-action="approve-draft" ${readiness.ready ? "" : "disabled"}>${icon("check")} اعتماد الاختبار</button>`}
        <button class="secondary-btn full" data-action="save-now">${icon("save")} حفظ ${approved ? "الاختبار" : "المسودة"}</button>
        <p class="muted-note">${approved ? "تم قفل التعديل وتفعيل نسخ Word وPDF. ألغِ الاعتماد فقط عند الحاجة إلى تعديل فعلي." : "الأسئلة تحتاج مراجعة المعلم قبل الاستخدام. راجع الصياغة والرسومات ونموذج التصحيح، ثم اعتمد الاختبار لتفعيل التصدير النهائي."}</p>
      </aside>
    </div>
    ${renderWizardFooter(4, true)}
  `;
}

function checkRow(label: string, okay: boolean): string {
  return `<div class="check-row"><span>${okay ? icon("check") : "!"}</span><b>${label}</b><small>${okay ? "سليم" : "يحتاج مراجعة"}</small></div>`;
}

function renderWizardFooter(step: WizardStep, canContinue = true): string {
  const retrieving = step === 1 && state.sourceRetrievalBusy;
  const generating = step === 2 && state.questionGenerationBusy;
  const nextLabel = retrieving
    ? "جارٍ مطابقة المصادر…"
    : generating
      ? "جارٍ إنشاء الأسئلة من المصدر…"
      : `التالي ${icon("arrow")}`;
  const busy = retrieving || generating;
  return `<footer class="wizard-footer">${step > 1 ? `<button class="secondary-btn" data-action="previous-step" ${(busy || state.draft.status === "معتمد") ? "disabled" : ""}>السابق</button>` : `<button class="secondary-btn" data-nav="home">إلغاء</button>`}<div>${step < 4 ? `<button class="primary-btn" data-action="next-step" ${canContinue && !busy ? "" : "disabled"}>${nextLabel}</button>` : `<button class="secondary-btn" data-nav="library">الذهاب إلى اختباراتي</button>`}</div></footer>`;
}

function renderPolicyReference(): string {
  const grades58 = getOfficialShortTestSpec(5);
  const grade9 = getOfficialShortTestSpec(9);
  const grade10 = getOfficialShortTestSpec(10);
  const final58 = getOfficialFinalExamSpec(5);
  const final9 = getOfficialFinalExamSpec(9);
  const final10 = getOfficialFinalExamSpec(10);
  if (!grades58 || !grade9 || !grade10 || !final58 || !final9 || !final10) throw new Error("تعذر تحميل مرجع تقويم العلوم.");
  return `
    <section class="page-heading policy-heading">
      <div><span class="eyebrow">مرجع تنظيمي معتمد</span><h1>مرجع تقويم العلوم</h1><p>${escapeHtml(SCIENCE_ASSESSMENT_POLICY_TITLE)} · إصدار ${escapeHtml(SCIENCE_ASSESSMENT_POLICY_VERSION)} · ${escapeHtml(SCIENCE_ASSESSMENT_POLICY_PUBLISHED)}</p></div>
      <a class="primary-btn" href="${SCIENCE_ASSESSMENT_POLICY_DOCUMENT_PATH}" target="_blank" rel="noreferrer">فتح الوثيقة الأصلية</a>
    </section>

    <section class="policy-reference-hero">
      <div><h2>ما الذي يطبقه واثق الآن؟</h2><p>يستخدم واثق المرجع الرسمي لبناء الاختبار القصير أو النهائي، ثم يولد الأسئلة من صفحات الكتاب المفهرس. المرجع التقويمي يحدد البنية، والكتاب يحدد المحتوى العلمي.</p></div>
      <div class="policy-reference-badge">5-10<br/><small>الصفوف المشمولة</small></div>
    </section>

    <section class="policy-section">
      <div class="section-intro"><h2>أهداف التقويم</h2><p>توزع درجات الاختبار القصير بنسبة 40% معرفة، و40% تطبيق، و20% استدلال.</p></div>
      <div class="policy-goal-grid">
        <article><strong>المعرفة</strong><p>تذكر الحقائق والمصطلحات والقوانين ووصف الخصائص والعمليات.</p></article>
        <article><strong>التطبيق</strong><p>استخدام المعرفة في مواقف جديدة وتفسير الجداول والرسوم وتحويل المعلومات.</p></article>
        <article><strong>الاستدلال</strong><p>تحليل الأدلة، وتفسير النتائج، وحل المشكلات، والتبرير والتخطيط للاستقصاء.</p></article>
      </div>
    </section>

    <section class="policy-section">
      <div class="section-intro"><h2>مواصفات الاختبار القصير</h2><p>تعرض البطاقات النطاق الرسمي، ويستخدم واثق قالبًا ثابتًا متوافقًا داخله لتقليل التعقيد.</p></div>
      <div class="policy-spec-grid">
        ${renderPolicySpecCard("الصفوف 5-8", grades58)}
        ${renderPolicySpecCard("الصف 9", grade9)}
        ${renderPolicySpecCard("الصف 10", grade10)}
      </div>
    </section>

    <section class="policy-section">
      <div class="section-intro"><h2>مواصفات الاختبار النهائي</h2><p>يطبق واثق عددًا ثابتًا صالحًا داخل النطاق الرسمي مع توزيع 40% معرفة و40% تطبيق و20% استدلال، والتوزيع نفسه لمستويات الصعوبة.</p></div>
      <div class="policy-spec-grid">
        ${renderPolicySpecCard("الصفوف 5-8", final58)}
        ${renderPolicySpecCard("الصف 9", final9)}
        ${renderPolicySpecCard("الصف 10", final10)}
      </div>
    </section>

    <section class="policy-section">
      <div class="section-intro"><h2>ضوابط صياغة المفردات</h2><p>قواعد مختصرة يستخدمها مولد الأسئلة ويراجعها المعلم قبل الاعتماد.</p></div>
      <div class="policy-rule-grid">
        ${renderPolicyRuleCard("اختيار من متعدد", ASSESSMENT_ITEM_WRITING_RULES.multipleChoice)}
        ${renderPolicyRuleCard("إجابة قصيرة", ASSESSMENT_ITEM_WRITING_RULES.shortAnswer)}
        ${renderPolicyRuleCard("إجابة طويلة", ASSESSMENT_ITEM_WRITING_RULES.longAnswer)}
        ${renderPolicyRuleCard("قواعد عامة", ASSESSMENT_ITEM_WRITING_RULES.general)}
      </div>
    </section>

    <section class="policy-section">
      <div class="section-intro"><h2>مواءمة أسلوبية مع الاختبارات الدولية</h2><p>استلهام في بناء السياق والبيانات ونقاط التصحيح، مع بقاء الوثيقة العُمانية المرجع الحاكم وعدم نسخ أسئلة خارجية.</p></div>
      <div class="policy-rule-grid">
        ${renderPolicyRuleCard("مبادئ المواءمة", INTERNATIONAL_SCIENCE_QUESTION_STYLE_PRINCIPLES)}
        ${renderPolicyRuleCard("الناتج داخل واثق", ["مفردات مترابطة تحت سياق أو بيانات مشتركة عند الملاءمة.", "تنوع بين المفاهيم والحساب وقراءة البيانات والاستقصاء والمقارنة.", "نموذج تصحيح بنقطة مستقلة لكل درجة.", "مراجع المصدر للمعلم فقط، وورقة طالب نظيفة."])}
      </div>
    </section>

    <section class="policy-section policy-note-card">
      <h2>الفصل بين المرجعين</h2>
      <div class="policy-source-split">
        <div><strong>وثيقة التقويم</strong><p>تحدد عدد المفردات والدرجات وأنواعها وأهداف التقويم وضوابط الصياغة.</p></div>
        <div><strong>كتاب الطالب والمصادر العلمية</strong><p>توفر المعلومات العلمية والدليل النصي ورقم الصفحة الذي يبنى عليه السؤال.</p></div>
      </div>
    </section>
  `;
}

function renderPolicySpecCard(label: string, spec: NonNullable<ReturnType<typeof getOfficialAssessmentSpec>>): string {
  return `<article class="policy-spec-card"><span>${label}</span><h3>${spec.totalMarks} درجات</h3><p>${spec.minItems}-${spec.maxItems} مفردات · ${spec.durationLabel}</p><div><small>قالب واثق المتوافق</small><br/><b>${spec.counts.mcq}</b> اختيار من متعدد <b>${spec.counts.short}</b> قصيرة <b>${spec.counts.long}</b> طويلة</div><ul>${spec.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul></article>`;
}

function renderPolicyRuleCard(title: string, rules: readonly string[]): string {
  return `<article class="policy-rule-card"><h3>${title}</h3><ul>${rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul></article>`;
}

interface LibraryCardExam {
  id: string;
  title: string;
  subject: string;
  grade: number;
  status: "مسودة" | "معتمد";
  date: string;
  progress?: number;
  hasModelB?: boolean;
  isLocal: boolean;
  isComplete?: boolean;
}

function renderLibrary(): string {
  const localExam: LibraryCardExam[] = loadDrafts().map((draft) => ({
    id: draft.id,
    title: draft.title || "مسودة اختبار بلا عنوان",
    subject: SUBJECTS.find((item) => item.id === draft.subjectId)?.label ?? "غير محددة",
    grade: draft.grade ?? 0,
    status: draft.status === "معتمد" ? "معتمد" : "مسودة",
    date: draft.updatedAt.slice(0, 10),
    progress: draft.status === "معتمد" ? 100 : draft.currentStep * 25,
    isLocal: true,
    isComplete: draft.currentStep >= 4 && isPlanComplete(draft),
  }));
  const examples: LibraryCardExam[] = MOCK_LIBRARY.map((exam) => ({ ...exam, isLocal: false }));
  const exams = [...localExam, ...examples]
    .filter((exam) => state.libraryFilter === "الكل" || exam.status === state.libraryFilter);

  return `
    <section class="page-heading"><div><span class="eyebrow">مكتبتك الخاصة</span><h1>اختباراتي</h1><p>افتح الاختبار المعتمد أو نزّل ورقة الطالب ونموذج الإجابة مباشرة من هنا.</p></div><button class="primary-btn" data-action="new-exam">${icon("plus")} اختبار جديد</button></section>
    <div class="filter-bar"><div class="segmented small">${["الكل", "مسودة", "معتمد"].map((filter) => `<button data-library-filter="${filter}" class="${state.libraryFilter === filter ? "active" : ""}">${filter}</button>`).join("")}</div><label class="search-field"><span>بحث</span><input id="library-search" placeholder="ابحث بالعنوان أو المادة"/></label></div>
    <div class="library-grid" id="library-grid">${exams.map(renderExamCard).join("") || `<div class="empty-state"><h2>لا توجد نتائج</h2><p>جرّب مرشحًا آخر بدل معاقبة قاعدة البيانات بنظرات الاستغراب.</p></div>`}</div>
  `;
}

function renderExamCard(exam: LibraryCardExam): string {
  const exportActions = `<button class="secondary-btn compact" data-action="library-export-student-word">الطالب Word</button>
         <button class="secondary-btn compact" data-action="library-export-student-pdf">الطالب PDF</button>
         <button class="secondary-btn compact" data-action="library-export-answer-word">الإجابة Word</button>
         <button class="secondary-btn compact" data-action="library-export-answer-pdf">الإجابة PDF</button>`;
  const draftAttr = exam.isLocal ? ` data-draft-id="${escapeHtml(exam.id)}"` : "";
  const exportActionsWithDraft = exam.isLocal
    ? exportActions.replaceAll("data-action=", `${draftAttr} data-action=`)
    : exportActions;
  const actions = exam.isLocal
    ? exam.status === "مسودة"
      ? exam.isComplete
        ? `<button class="primary-btn compact"${draftAttr} data-action="preview-library-exam">معاينة المسودة</button><button class="secondary-btn compact"${draftAttr} data-action="resume-draft">متابعة التعديل</button>${exportActionsWithDraft}<button class="ghost-btn compact"${draftAttr} data-action="delete-draft">حذف</button>`
        : `<button class="primary-btn compact"${draftAttr} data-action="resume-draft">متابعة</button><button class="ghost-btn compact"${draftAttr} data-action="delete-draft">حذف</button>`
      : `<button class="primary-btn compact"${draftAttr} data-action="preview-library-exam">معاينة الاختبار</button>${exportActionsWithDraft}`
    : `<button class="ghost-btn compact" data-action="mock-download">مثال توضيحي</button>`;
  return `<article class="exam-card" data-search-text="${escapeHtml(`${exam.title} ${exam.subject} ${exam.grade}`)}"><div class="exam-card-head"><span class="status-badge ${exam.status === "معتمد" ? "approved" : "draft"}">${exam.status}</span>${exam.hasModelB ? `<span class="model-badge">أ + ب</span>` : ""}</div><h2>${escapeHtml(exam.title)}</h2><p>${escapeHtml(exam.subject)} · الصف ${exam.grade || "غير محدد"}</p><div class="exam-meta"><span>${formatArabicDate(exam.date)}</span>${exam.progress ? `<span>${exam.progress}% مكتمل</span>` : ""}</div>${exam.progress ? `<div class="progress-track"><span style="width:${exam.progress}%"></span></div>` : ""}<div class="exam-actions library-exam-actions">${actions}</div></article>`;
}



function renderSourceStoragePanel(): string {
  const busy = state.sourceStorageBusy ? "disabled" : "";
  if (!centralSourceStore || state.sourceStorageStatus === "محلي") {
    return `<section class="central-storage-card local-mode" aria-label="حالة تخزين المصادر">
      <div><span class="storage-state">تخزين محلي</span><h2>سجل المصادر محفوظ في هذا المتصفح</h2><p>${escapeHtml(state.sourceStorageMessage)}</p></div>
      <span class="storage-note">أكمل إعداد Supabase لتوحيد السجل بين أجهزتك.</span>
    </section>`;
  }
  if (state.sourceStorageStatus === "يتطلب تسجيل الدخول") {
    return `<section class="central-storage-card login-mode" aria-label="تسجيل دخول مالك المنصة">
      <div><span class="storage-state">Supabase جاهز</span><h2>تسجيل دخول مالك المنصة</h2><p>${escapeHtml(state.sourceStorageMessage)}</p></div>
      <div class="owner-login-grid">
        <label class="field"><span>البريد الإلكتروني</span><input id="owner-email" type="email" autocomplete="username" placeholder="owner@example.com"/></label>
        <label class="field"><span>كلمة المرور</span><input id="owner-password" type="password" autocomplete="current-password" placeholder="••••••••"/></label>
        <button class="primary-btn" data-action="owner-login" ${busy}>${state.sourceStorageBusy ? "جارٍ الاتصال…" : "تسجيل الدخول"}</button>
      </div>
    </section>`;
  }
  if (state.sourceStorageStatus === "خطأ") {
    return `<section class="central-storage-card error-mode" aria-label="خطأ التخزين المركزي">
      <div><span class="storage-state">تعذر الاتصال</span><h2>السجل المحلي ما زال محفوظًا</h2><p>${escapeHtml(state.sourceStorageMessage)}</p></div>
      <div class="storage-actions"><button class="secondary-btn compact" data-action="refresh-central-sources" ${busy}>إعادة المحاولة</button><button class="ghost-btn compact" data-action="owner-logout">تسجيل الخروج</button></div>
    </section>`;
  }
  return `<section class="central-storage-card connected-mode" aria-label="التخزين المركزي متصل">
    <div><span class="storage-state">متصل مركزيًا</span><h2>سجل المصادر موحّد بين الأجهزة</h2><p>الحساب: <b dir="ltr">${escapeHtml(state.ownerEmail)}</b>. تُحفظ التغييرات في Supabase مع إبقاء نسخة محلية احتياطية.</p></div>
    <div class="storage-actions"><button class="secondary-btn compact" data-action="refresh-central-sources" ${busy}>${state.sourceStorageBusy ? "جارٍ المزامنة…" : "مزامنة الآن"}</button><button class="ghost-btn compact" data-action="owner-logout">تسجيل الخروج</button></div>
  </section>`;
}

function renderGoogleDrivePanel(): string {
  const busy = state.driveBusy ? "disabled" : "";
  if (!googleDriveService || state.driveStatus === "غير مهيأ") {
    return `<section class="drive-connection-card setup-mode" aria-label="حالة Google Drive">
      <div><span class="storage-state">إعداد غير مكتمل</span><h2>Google Drive غير مهيأ بعد</h2><p>${escapeHtml(state.driveMessage)}</p></div>
      <span class="storage-note">أضف Google OAuth Client ID وانشر Edge Function لإتاحة الربط.</span>
    </section>`;
  }
  if (state.sourceStorageStatus !== "متصل" || state.driveStatus === "يتطلب تسجيل الدخول") {
    return `<section class="drive-connection-card waiting-mode" aria-label="Google Drive ينتظر تسجيل الدخول">
      <div><span class="storage-state">Google Drive</span><h2>سجّل دخول مالك المنصة أولًا</h2><p>بعد تسجيل الدخول إلى Supabase سيظهر زر ربط Drive. خطوة واحدة، بلا مهرجان نوافذ.</p></div>
    </section>`;
  }
  if (state.driveStatus === "خطأ") {
    return `<section class="drive-connection-card error-mode" aria-label="خطأ Google Drive">
      <div><span class="storage-state">تعذر الاتصال</span><h2>Google Drive يحتاج إعادة تحقق</h2><p>${escapeHtml(state.driveMessage)}</p></div>
      <div class="storage-actions"><button class="secondary-btn compact" data-action="refresh-drive-status" ${busy}>إعادة المحاولة</button>${state.driveRootFolderUrl ? `<a class="ghost-btn compact" href="${escapeHtml(state.driveRootFolderUrl)}" target="_blank" rel="noreferrer">فتح المجلد</a>` : ""}</div>
    </section>`;
  }
  if (state.driveStatus === "غير متصل") {
    return `<section class="drive-connection-card disconnected-mode" aria-label="ربط Google Drive">
      <div><span class="storage-state">Google Drive</span><h2>غير متصل</h2><p>${escapeHtml(state.driveMessage)}</p></div>
      <button class="primary-btn" data-action="connect-google-drive" ${busy}>${state.driveBusy ? "جارٍ تجهيز الربط…" : "ربط Google Drive"}</button>
    </section>`;
  }
  return `<section class="drive-connection-card connected-mode" aria-label="Google Drive متصل">
    <div>
      <span class="storage-state">متصل وجاهز</span>
      <h2>مجلد واثق مرتبط بـ Google Drive</h2>
      <p>${state.driveFoldersReady ? "تم التحقق من المجلدات الأساسية، ولن تُنشأ نسخ مكررة عند الفحص." : "الاتصال قائم، لكن يلزم التحقق من المجلدات الأساسية."}</p>
      <div class="drive-folder-summary">${state.driveFolders.map((folder) => `<span>${icon("check")} ${escapeHtml(folder.name)}</span>`).join("")}</div>
    </div>
    <div class="storage-actions">
      ${state.driveRootFolderUrl ? `<a class="secondary-btn compact" href="${escapeHtml(state.driveRootFolderUrl)}" target="_blank" rel="noreferrer">فتح مجلد واثق</a>` : ""}
      <button class="ghost-btn compact" data-action="verify-drive-folders" ${busy}>${state.driveBusy ? "جارٍ التحقق…" : "التحقق من المجلدات"}</button>
      <button class="danger-link compact" data-action="disconnect-google-drive" ${busy}>فصل الاتصال</button>
    </div>
  </section>`;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 بايت";
  const units = ["بايت", "ك.ب", "م.ب", "ج.ب"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function renderPendingSourceUpload(): string {
  const pending = state.pendingSourceUpload;
  if (!pending) return "";
  const percent = pending.fileSizeBytes > 0 ? Math.round((pending.bytesUploaded / pending.fileSizeBytes) * 100) : 0;
  return `<section class="pending-upload-card" aria-label="رفع غير مكتمل">
    <div>
      <span class="storage-state">رفع غير مكتمل</span>
      <h2>${escapeHtml(pending.source.title)}</h2>
      <p>توقف رفع <b>${escapeHtml(pending.fileName)}</b> عند ${percent}%. افتح النموذج واختر الملف نفسه لاستكماله من آخر جزء محفوظ.</p>
      <div class="upload-progress-track"><span style="width:${percent}%"></span></div>
    </div>
    <div class="storage-actions">
      <button class="secondary-btn compact" data-action="resume-pending-upload">استكمال الرفع</button>
      <button class="danger-link compact" data-action="cancel-pending-upload">إلغاء الجلسة</button>
    </div>
  </section>`;
}

function renderSourceIndexingProgress(): string {
  if (!state.sourceIndexingId) return "";
  const source = state.sources.find((item) => item.id === state.sourceIndexingId);
  return `<section class="source-indexing-card" aria-live="polite">
    <div>
      <span class="storage-state">استخراج وفهرسة</span>
      <h2>${escapeHtml(source?.title ?? "مصدر PDF")}</h2>
      <p>${escapeHtml(state.sourceIndexingMessage || "جارٍ تجهيز ملف PDF…")}</p>
      <div class="upload-progress-track"><span style="width:${state.sourceIndexingProgress}%"></span></div>
    </div>
    <strong dir="ltr">${state.sourceIndexingProgress}%</strong>
  </section>`;
}

function renderAdmin(): string {
  const activeSources = state.sources.filter((source) => source.status !== "مؤرشف").length;
  const indexedSources = state.sources.filter((source) => source.status === "مفهرس").length;
  const reviewSources = state.sources.filter((source) => source.status === "يحتاج مراجعة").length;
  const visibleSources = state.sources.filter((source) => state.sourceFilter === "الكل" || source.status === state.sourceFilter);
  const selectedSource = state.sources.find((source) => source.id === state.selectedSourceId);
  return `
    <section class="page-heading"><div><span class="eyebrow">لوحة مالك المنصة</span><h1>إدارة المصادر</h1><p>ارفع المصادر واستخرج نصها وفهرسه حسب الصفحات والمقاطع. لا يحتاج المصدر إلى تحليل فهرس بصري كي يصبح جاهزًا للاستخدام.</p></div><span class="demo-badge">Phase 0-H3 · فهرسة حسب الصفحات</span></section>

    ${renderSourceStoragePanel()}
    ${renderGoogleDrivePanel()}
    ${renderPendingSourceUpload()}
    ${renderSourceIndexingProgress()}

    <section class="source-stats" aria-label="ملخص المصادر">
      <article><span>المصادر النشطة</span><strong>${activeSources}</strong></article>
      <article><span>المفهرسة</span><strong>${indexedSources}</strong></article>
      <article><span>تحتاج مراجعة</span><strong>${reviewSources}</strong></article>
      <article><span>المؤرشفة</span><strong>${state.sources.filter((source) => source.status === "مؤرشف").length}</strong></article>
    </section>

    <section class="admin-grid">
      <article class="admin-action"><span>${icon("files")}</span><h2>إضافة ملف PDF</h2><p>كتاب طالب أو دليل معلم أو نواتج تعلم أو جدول مواصفات أو ورقة كامبريدج.</p><button class="secondary-btn" data-action="open-source-form" data-source-kind="file">إضافة ملف</button></article>
      <article class="admin-action"><span>${icon("spark")}</span><h2>إضافة رابط عالمي</h2><p>سجّل رابطًا موثوقًا بعد مراجعة حقوق الاستخدام، ثم اربطه بالمادة والصف.</p><button class="secondary-btn" data-action="open-source-form" data-source-kind="url">إضافة رابط</button></article>
    </section>

    <section class="registry-actions" aria-label="نسخ سجل المصادر">
      <div><h2>نسخة احتياطية لسجل المصادر</h2><p>التصدير يحفظ بيانات السجل فقط. ملفات PDF المرفوعة تبقى داخل Google Drive ولا تُضمَّن في ملف JSON.</p></div>
      <div class="registry-buttons">
        <button class="secondary-btn compact" data-action="export-source-registry">تصدير JSON</button>
        <label class="ghost-btn compact file-button">استيراد JSON<input id="source-registry-file" type="file" accept="application/json,.json"/></label>
      </div>
    </section>

    ${state.sourceFormOpen ? renderSourceForm() : ""}
    ${selectedSource ? renderSourceDetails(selectedSource) : ""}

    <section class="source-table-wrap">
      <div class="source-list-heading">
        <div><h2>مكتبة المصادر</h2><p>بعد رفع PDF يستخرج واثق النص ويحفظ كل مقطع مع رقم صفحته. OCR العربي يبقى للملفات المصورة أو المشوهة فقط.</p></div>
        <label class="search-field"><span>بحث</span><input id="source-search" placeholder="اسم المصدر أو المادة أو رقم الفهرسة"/></label>
      </div>
      <div class="source-filter-row">${(["الكل", "جاهز للفهرسة", "مفهرس", "يحتاج مراجعة", "مؤرشف"] as const).map((filter) => `<button class="filter-chip ${state.sourceFilter === filter ? "active" : ""}" data-source-filter="${filter}">${filter}</button>`).join("")}</div>
      <div class="source-table">${visibleSources.map(renderSourceRow).join("") || `<div class="empty-state"><h3>لا توجد مصادر هنا</h3><p>المرشح الحالي نظيف أكثر من اللازم، وهي مشكلة نادرة في حياة البشر.</p></div>`}</div>
    </section>
  `;
}

function renderSourceForm(): string {
  const draft = state.sourceDraft;
  const validation = validateSourceDraft(draft);
  const path = buildSourceDrivePath(draft);
  const availableSourceSubjects = draft.grade
    ? SUBJECTS.filter((subject) => subject.grades.includes(draft.grade as number))
    : SUBJECTS;
  const issueFor = (field: string) => validation.issues.find((issue) => issue.field === field)?.message ?? "";
  return `
    <section class="source-form-card" aria-label="إضافة مصدر جديد">
      <header><div><span class="eyebrow">${draft.mode === "file" ? "مصدر PDF" : "رابط عالمي"}</span><h2>${draft.mode === "file" ? "إضافة ملف إلى مكتبة المصادر" : "إضافة رابط إلى مكتبة المصادر"}</h2></div><button class="ghost-btn compact" data-action="close-source-form">إغلاق</button></header>
      <div class="form-grid two-columns">
        <label class="field full"><span>اسم المصدر</span><input id="source-title" value="${escapeHtml(draft.title)}" placeholder="مثال: كتاب الطالب للفيزياء"/>${issueFor("title") ? `<small class="field-error">${issueFor("title")}</small>` : ""}</label>
        <label class="field"><span>نوع المصدر</span><select id="source-kind">${SOURCE_KINDS.map((kind) => `<option value="${kind}" ${draft.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}</select></label>
        <label class="field"><span>الإصدار أو السنة</span><input id="source-version" value="${escapeHtml(draft.version)}" placeholder="مثال: 2026 أو الإصدار الثاني"/>${issueFor("version") ? `<small class="field-error">${issueFor("version")}</small>` : ""}</label>
        <label class="field"><span>الفصل الدراسي</span><select id="source-semester"><option value="">اختر الفصل</option>${SOURCE_SEMESTERS.map((semester) => `<option value="${semester}" ${draft.semester === semester ? "selected" : ""}>${semester}</option>`).join("")}</select>${issueFor("semester") ? `<small class="field-error">${issueFor("semester")}</small>` : ""}</label>
        <label class="field"><span>الصف</span><select id="source-grade"><option value="">اختر الصف</option>${Array.from({ length: 12 }, (_, index) => index + 1).map((grade) => `<option value="${grade}" ${draft.grade === grade ? "selected" : ""}>الصف ${grade}</option>`).join("")}</select>${issueFor("grade") ? `<small class="field-error">${issueFor("grade")}</small>` : ""}</label>
        <label class="field"><span>المادة</span><select id="source-subject" ${draft.grade ? "" : "disabled"}><option value="">اختر المادة</option>${availableSourceSubjects.map((subject) => `<option value="${subject.id}" ${draft.subjectId === subject.id ? "selected" : ""}>${subject.label}</option>`).join("")}</select>${issueFor("subjectId") ? `<small class="field-error">${issueFor("subjectId")}</small>` : ""}</label>
        ${draft.mode === "file" ? `
          <label class="field full"><span>ملف PDF</span><input id="source-file" type="file" accept="application/pdf,.pdf" ${state.sourceUploadBusy ? "disabled" : ""}/><small>${state.sourceFile ? `الملف المختار: ${escapeHtml(state.sourceFile.name)} · ${formatFileSize(state.sourceFile.size)}` : draft.fileName ? `اختر الملف نفسه لاستكمال رفع: ${escapeHtml(draft.fileName)}` : "اختر ملف PDF؛ سيُرفع فعليًا إلى المجلد الصحيح في Google Drive."}</small>${issueFor("fileName") ? `<small class="field-error">${issueFor("fileName")}</small>` : ""}</label>
        ` : `
          <label class="field full"><span>رابط المصدر</span><input id="source-url" type="url" value="${escapeHtml(draft.url)}" placeholder="https://example.org/source"/>${issueFor("url") ? `<small class="field-error">${issueFor("url")}</small>` : ""}</label>
          <label class="rights-check full"><input id="source-rights" type="checkbox" ${draft.rightsConfirmed ? "checked" : ""}/><span>راجعت حقوق الاستخدام وسياسة الموقع، وأسمح بتسجيل الرابط كمصدر مركزي.</span></label>
          ${issueFor("rightsConfirmed") ? `<p class="field-error full">${issueFor("rightsConfirmed")}</p>` : ""}
        `}
      </div>
      <div class="drive-path-preview"><span>مسار الحفظ في Google Drive</span><code>${escapeHtml(path)}</code><small>${draft.mode === "file" ? "سيُنشئ واثق المجلدات الناقصة تلقائيًا ثم يرفع الملف دون تكرار." : "الرابط يُحفظ في سجل المصادر ولا يُرفع كملف."}</small></div>
      ${state.sourceUploadBusy || state.sourceUploadMessage ? `<div class="source-upload-progress" aria-live="polite"><div><strong>${escapeHtml(state.sourceUploadMessage || "جارٍ تجهيز الرفع…")}</strong><span>${state.sourceUploadProgress}%</span></div><div class="upload-progress-track"><span style="width:${state.sourceUploadProgress}%"></span></div></div>` : ""}
      <footer><button class="secondary-btn" data-action="close-source-form" ${state.sourceUploadBusy ? "disabled" : ""}>إلغاء</button><button class="primary-btn" data-action="save-source" ${state.sourceUploadBusy ? "disabled" : ""}>${state.sourceUploadBusy ? "جارٍ الرفع…" : draft.mode === "file" ? (state.pendingSourceUpload ? "استكمال الرفع والحفظ" : "رفع وحفظ المصدر") : (state.sourceStorageStatus === "متصل" ? "حفظ في السجل المركزي" : "حفظ المصدر")}</button></footer>
    </section>
  `;
}

function renderSourceDetails(source: ManagedSource): string {
  const subject = SUBJECTS.find((item) => item.id === source.subjectId)?.label ?? "غير محددة";
  const reference = source.mode === "file" ? source.fileName ?? "ملف PDF" : source.url ?? "رابط";
  const extractionStatus = source.extractionStatus ?? "لم يبدأ";
  const headings = source.detectedHeadings ?? [];
  return `
    <section class="source-details-card" aria-label="تفاصيل المصدر">
      <header><div><span class="eyebrow">تفاصيل المصدر</span><h2>${escapeHtml(source.title)}</h2></div><button class="ghost-btn compact" data-action="close-source-details">إغلاق</button></header>
      <div class="source-details-grid">
        <div><span>رقم الفهرسة</span><strong dir="ltr">${escapeHtml(source.catalogCode)}</strong></div>
        <div><span>الجهة</span><strong>${escapeHtml(source.authority)}</strong></div>
        <div><span>النوع</span><strong>${escapeHtml(source.kind)}</strong></div>
        <div><span>المادة والصف</span><strong>${escapeHtml(subject)} · الصف ${source.grade}</strong></div>
        <div><span>الإصدار</span><strong>${escapeHtml(source.version)}</strong></div>
        <div><span>الفصل الدراسي</span><strong>${escapeHtml(source.semester ?? "غير محدد")}</strong></div>
        <div><span>الحالة</span><strong>${escapeHtml(source.status)}</strong></div>
        <div><span>حالة الملف</span><strong>${escapeHtml(source.uploadState ?? (source.mode === "url" ? "رابط" : "غير مرفوع"))}</strong></div>
        <div><span>حالة الاستخراج</span><strong>${escapeHtml(extractionStatus)}</strong></div>
        <div><span>حجم الملف</span><strong>${source.fileSizeBytes ? formatFileSize(source.fileSizeBytes) : "—"}</strong></div>
        <div><span>الصفحات المستخرجة</span><strong>${source.extractedPageCount ?? "—"}</strong></div>
        <div><span>عدد الحروف</span><strong>${source.extractedCharacterCount?.toLocaleString("ar-OM") ?? "—"}</strong></div>
        <div><span>لغة النص</span><strong>${escapeHtml(source.extractedLanguage ?? "—")}</strong></div>
        <div><span>أضيف في</span><strong>${formatArabicDate(source.createdAt.slice(0, 10))}</strong></div>
        <div><span>آخر تحديث</span><strong>${formatArabicDate(source.updatedAt.slice(0, 10))}</strong></div>
      </div>
      <div class="source-reference"><span>${source.mode === "file" ? "اسم الملف" : "الرابط"}</span><code>${escapeHtml(reference)}</code></div>
      <div class="source-reference"><span>مسار Google Drive</span><code>${escapeHtml(source.drivePath)}</code></div>
      ${source.extractionMessage ? `<div class="extraction-note status-${extractionStatus === "مكتمل" ? "ok" : extractionStatus === "يحتاج OCR" || extractionStatus === "فشل" ? "warn" : "idle"}"><strong>${escapeHtml(extractionStatus)}</strong><p>${escapeHtml(source.extractionMessage)}</p></div>` : ""}
      ${source.extractionPreview ? `<div class="extraction-preview"><span>معاينة النص المستخرج</span><p>${escapeHtml(source.extractionPreview)}</p></div>` : ""}
      ${headings.length ? `<div class="detected-headings"><span>عناوين مستخرجة للمساعدة في البحث، وليست فهرسًا للكتاب</span><div>${headings.slice(0, 12).map((heading) => `<small>${escapeHtml(heading)}</small>`).join("")}</div></div>` : ""}
      ${renderSourceReadinessPanel(source)}
      <div class="source-detail-actions">
        ${source.mode === "file" && source.driveFileId && source.status !== "مؤرشف" ? `<button class="primary-btn compact" data-action="index-source" data-source-id="${source.id}" ${state.sourceIndexingId ? "disabled" : ""}>${sourceExtractionActionLabel(source, state.sourceIndexingId === source.id)}</button>` : ""}
        ${source.driveWebViewLink ? `<a class="secondary-btn compact source-drive-link" href="${escapeHtml(source.driveWebViewLink)}" target="_blank" rel="noreferrer">فتح الملف في Google Drive</a>` : ""}
      </div>
    </section>
  `;
}

function renderSourceReadinessPanel(source: ManagedSource): string {
  const complete = source.mode === "file" && source.extractionStatus === "مكتمل" && source.status === "مفهرس";
  const needsOcr = source.extractionStatus === "يحتاج OCR";
  const failed = source.extractionStatus === "فشل";
  const pageCount = source.extractedPageCount ?? 0;
  const characterCount = source.extractedCharacterCount ?? 0;
  const statusLabel = complete ? "جاهز للاستخدام" : needsOcr ? "يحتاج OCR" : failed ? "تعذر الاستخراج" : "بانتظار الفهرسة";
  const message = complete
    ? `تم حفظ نص ${pageCount} صفحة مع أرقام الصفحات، وأصبح المصدر جاهزًا للبحث والاسترجاع دون تحليل فهرس بصري.`
    : needsOcr
      ? "شغّل OCR العربي لاستخراج نص الصفحات المصورة، ثم يصبح المصدر جاهزًا للاستخدام."
      : failed
        ? "أعد محاولة الاستخراج أو OCR. لا توجد خطوة خاصة بفهرس الوحدات والدروس."
        : "استخرج نص PDF وفهرسه حسب الصفحات. هذا هو المسار المعتمد والوحيد المطلوب حاليًا.";
  return `<section class="source-readiness-card ${complete ? "ready" : needsOcr || failed ? "warning" : "pending"}">
    <header><div><span class="eyebrow">الفهرسة المعتمدة</span><h3>${statusLabel}</h3><p>${escapeHtml(message)}</p></div><span class="source-readiness-badge">${complete ? "صفحات ومقاطع" : "لا يحتاج فهرسًا بصريًا"}</span></header>
    <div class="source-readiness-metrics">
      <div><span>الصفحات</span><strong>${pageCount || "—"}</strong></div>
      <div><span>الحروف المستخرجة</span><strong>${characterCount ? characterCount.toLocaleString("ar-OM") : "—"}</strong></div>
      <div><span>طريقة العمل</span><strong>استرجاع حسب الصفحة والمقطع</strong></div>
    </div>
    <p class="source-readiness-note">الوحدات والدروس ليست شرطًا لتشغيل واثق. يمكن إضافة ربط يدوي اختياري لاحقًا عندما تحتاجه مرحلة إنشاء الاختبارات، من دون OCR للفهرس.</p>
  </section>`;
}







function renderSourceRow(source: ManagedSource): string {
  const subject = SUBJECTS.find((item) => item.id === source.subjectId)?.label ?? "غير محددة";
  const sourceRef = source.mode === "file" ? source.fileName ?? "ملف PDF" : source.url ?? "رابط";
  const indexing = state.sourceIndexingId === source.id;
  const canExtract = source.mode === "file" && Boolean(source.driveFileId) && source.uploadState === "مرفوع";
  const extractLabel = sourceExtractionActionLabel(source, indexing);
  const actions = source.status === "مؤرشف"
    ? `<button class="text-btn" data-action="view-source" data-source-id="${source.id}">تفاصيل</button><button class="text-btn" data-action="restore-source" data-source-id="${source.id}">استعادة</button>`
    : `<button class="text-btn" data-action="view-source" data-source-id="${source.id}">تفاصيل</button>${canExtract ? `<button class="text-btn" data-action="index-source" data-source-id="${source.id}" ${state.sourceIndexingId ? "disabled" : ""}>${extractLabel}</button>` : ""}<button class="text-btn danger-text" data-action="archive-source" data-source-id="${source.id}" ${indexing ? "disabled" : ""}>أرشفة</button>`;
  return `<article class="source-row-card" data-source-search="${escapeHtml(`${source.title} ${source.catalogCode} ${source.authority} ${source.kind} ${subject} ${source.grade} ${source.semester ?? "غير محدد"} ${source.version} ${sourceRef}`)}">
    <div class="source-main"><span class="source-mode-icon">${source.mode === "file" ? icon("files") : icon("spark")}</span><div><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.catalogCode)}</small></div></div>
    <div class="source-meta"><span>${escapeHtml(subject)} · الصف ${source.grade}</span><small>${escapeHtml(source.authority)} · ${escapeHtml(source.semester ?? "غير محدد")} · ${escapeHtml(source.version)}${source.fileSizeBytes ? ` · ${formatFileSize(source.fileSizeBytes)}` : ""}</small></div>
    <div class="source-state-stack"><span class="source-status status-${sourceStatusSlug(source.status)}">${source.status}</span>${source.mode === "file" ? `<small class="upload-state upload-${source.uploadState === "مرفوع" ? "done" : source.uploadState === "مؤرشف" ? "archived" : "pending"}">${escapeHtml(source.uploadState ?? "غير مرفوع")}</small>` : ""}${source.mode === "file" ? `<small class="extraction-state extraction-${extractionStatusSlug(source.extractionStatus)}">${escapeHtml(source.extractionStatus ?? "لم يبدأ")}</small>` : ""}</div>
    <div class="source-actions">${actions}</div>
    <code class="source-path">${escapeHtml(source.drivePath)}</code>
  </article>`;
}

function sourceExtractionActionLabel(source: ManagedSource, busy: boolean): string {
  if (busy) return source.extractionVersion?.startsWith("google-cloud-vision") ? "جارٍ OCR…" : "جارٍ الاستخراج…";
  if (source.extractionStatus === "يحتاج OCR") return "تشغيل OCR العربي";
  if (source.extractionVersion?.startsWith("google-cloud-vision-ocr-pending")) return "استكمال OCR";
  if (source.extractionVersion?.startsWith("google-cloud-vision")) return "إعادة OCR";
  if (source.extractionStatus === "فشل") return "إعادة المحاولة";
  if (source.extractionStatus === "مكتمل") return "إعادة الفهرسة";
  return "استخراج وفهرسة";
}

function extractionStatusSlug(status: ManagedSource["extractionStatus"]): string {
  if (status === "مكتمل") return "done";
  if (status === "جارٍ الاستخراج") return "busy";
  if (status === "يحتاج OCR" || status === "فشل") return "review";
  return "idle";
}

function sourceStatusSlug(status: SourceStatus): string {
  if (status === "مفهرس") return "indexed";
  if (status === "يحتاج مراجعة") return "review";
  if (status === "مؤرشف") return "archived";
  return "ready";
}

function bindEvents(): void {
  document.querySelectorAll<HTMLElement>("[data-nav]").forEach((element) => {
    element.addEventListener("click", () => navigate(element.dataset.nav as ViewName));
  });

  document.querySelectorAll<HTMLElement>("[data-step]").forEach((element) => {
    element.addEventListener("click", () => setStep(Number(element.dataset.step) as WizardStep));
  });

  document.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
    element.addEventListener("click", () => handleAction(element.dataset.action ?? "", element));
  });

  bindContentStep();
  bindSetupStep();
  bindPlanStep();
  bindLibrary();
  bindAdmin();
}

function handleAction(action: string, element: HTMLElement): void {
  const requestedDraftId = element.dataset.draftId ?? "";
  if (action === "new-exam") {
    persistDraftCheckpoint(false);
    const profile = loadProfile();
    state.draft = createEmptyDraft();
    state.questionGenerationBusy = false;
    state.questionGenerationMessage = "";
    state.sourceRetrievalMessage = "";
    state.visualEnhancementBusyIds.clear();
    state.visualEnhancementMessages = {};
    state.visualEnhancementAutoStarted = false;
    if (profile) {
      state.draft.school = profile.school;
      state.draft.directorate = profile.directorate;
    }
    saveDraft(state.draft);
    navigate("wizard");
    scheduleSave();
    return;
  }
  if (action === "resume-draft") {
    const loaded = loadDraft(requestedDraftId || undefined);
    if (loaded) {
      state.draft = loaded;
      setActiveDraftId(loaded.id);
    }
    state.visualEnhancementBusyIds.clear();
    state.visualEnhancementMessages = {};
    state.visualEnhancementAutoStarted = false;
    navigate("wizard");
    return;
  }
  if (action === "preview-library-exam") {
    const loaded = loadDraft(requestedDraftId || undefined);
    if (!loaded) return showToast("تعذر العثور على الاختبار المحفوظ.");
    state.draft = loaded;
    setActiveDraftId(loaded.id);
    state.visualEnhancementBusyIds.clear();
    state.visualEnhancementMessages = {};
    state.visualEnhancementAutoStarted = false;
    state.draft.currentStep = 4;
    navigate("wizard");
    return;
  }
  if (["library-export-student-word", "library-export-student-pdf", "library-export-answer-word", "library-export-answer-pdf"].includes(action)) {
    const loaded = loadDraft(requestedDraftId || undefined);
    if (!loaded || loaded.currentStep < 4 || !isPlanComplete(loaded)) return showToast("لا يوجد اختبار مكتمل قابل للتصدير.");
    state.draft = loaded;
    const kind = action.includes("answer") ? "answer" as const : "student" as const;
    const document = exportDocumentHtml(kind);
    if (action.endsWith("word")) {
      void downloadWordHtml(document.fileName, document.html)
        .then(() => showToast(loaded.status === "معتمد" ? "تم تجهيز ملف Word للتنزيل." : "تم تجهيز نسخة مسودة غير معتمدة للمراجعة."))
        .catch((error: unknown) => showToast(error instanceof Error ? error.message : "تعذر تجهيز ملف Word."));
    } else if (!printHtmlDocument(document.fileName, document.html)) {
      showToast("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
    }
    return;
  }
  if (action === "enhance-visual" || action === "regenerate-visual") {
    const planItemId = element.dataset.planId ?? "";
    if (planItemId) void enhancePlanVisual(planItemId);
    return;
  }
  if (action === "restore-deterministic-visual") {
    const planItemId = element.dataset.planId ?? "";
    if (planItemId) restoreDeterministicVisual(planItemId);
    return;
  }
  if (action === "save-now") return saveNow();
  if (action === "approve-draft") {
    const readiness = reviewReadiness(selectedPaperItems());
    if (!readiness.ready) {
      showToast("لا يمكن اعتماد الاختبار قبل اكتمال جميع فحوص المراجعة.");
      return;
    }
    approveExamDraft(state.draft);
    saveNow();
    render();
    showToast("تم اعتماد الاختبار وقفل التعديل وتفعيل التصدير.");
    return;
  }
  if (action === "reopen-draft") {
    reopenExamDraft(state.draft);
    saveNow();
    render();
    showToast("تم إلغاء الاعتماد وفتح الاختبار للتعديل.");
    return;
  }
  if (["export-student-word", "export-student-pdf", "export-answer-word", "export-answer-pdf"].includes(action)) {
    if (!isPlanComplete(state.draft) || state.draft.currentStep < 4) {
      showToast("أكمل اختيار مفردات الاختبار قبل التصدير.");
      return;
    }
    const kind = action.includes("answer") ? "answer" as const : "student" as const;
    const document = exportDocumentHtml(kind);
    if (action.endsWith("word")) {
      void downloadWordHtml(document.fileName, document.html)
        .then(() => showToast(state.draft.status === "معتمد" ? "تم تجهيز ملف Word للتنزيل مع تحويل الرسومات إلى صور واضحة." : "تم تجهيز نسخة مسودة غير معتمدة للمراجعة."))
        .catch((error: unknown) => showToast(error instanceof Error ? error.message : "تعذر تجهيز ملف Word."));
    } else if (!printHtmlDocument(document.fileName, document.html)) {
      showToast("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
    }
    return;
  }
  if (action === "previous-step") return setStep(Math.max(1, state.draft.currentStep - 1) as WizardStep);
  if (action === "next-step") { void nextStep(); return; }
  if (action === "apply-suggestion") return applySuggestedCounts();
  if (action === "delete-draft") {
    const targetDraftId = requestedDraftId || state.draft.id;
    clearDraft(targetDraftId);
    const remaining = loadDraft();
    state.draft = remaining ?? createEmptyDraft();
    state.questionGenerationBusy = false;
    state.questionGenerationMessage = "";
    state.sourceRetrievalMessage = "";
    state.visualEnhancementBusyIds.clear();
    state.visualEnhancementMessages = {};
    state.visualEnhancementAutoStarted = false;
    showToast("تم حذف المسودة المحلية.");
    return;
  }
  if (action === "mock-download") {
    showToast("التصدير الحقيقي مؤجل لمرحلة التصدير.");
    return;
  }
  if (action === "owner-login") {
    void signInOwner();
    return;
  }
  if (action === "owner-logout") {
    void signOutOwner();
    return;
  }
  if (action === "refresh-central-sources") {
    void loadAndSyncCentralSources();
    return;
  }
  if (action === "connect-google-drive") {
    void connectGoogleDrive();
    return;
  }
  if (action === "refresh-drive-status") {
    void loadGoogleDriveStatus();
    return;
  }
  if (action === "verify-drive-folders") {
    void verifyGoogleDriveFolders();
    return;
  }
  if (action === "disconnect-google-drive") {
    void disconnectGoogleDrive();
    return;
  }
  if (action === "resume-pending-upload") {
    const pending = state.pendingSourceUpload;
    if (!pending) return;
    state.sourceDraft = {
      mode: "file",
      title: pending.source.title,
      kind: pending.source.kind,
      grade: pending.source.grade,
      subjectId: pending.source.subjectId,
      version: pending.source.version,
      semester: pending.source.semester === "غير محدد" ? "" : pending.source.semester,
      fileName: pending.fileName,
      url: "",
      rightsConfirmed: true,
    };
    state.sourceFile = null;
    state.sourceFormOpen = true;
    state.sourceUploadMessage = "اختر الملف نفسه ثم اضغط استكمال الرفع والحفظ.";
    state.sourceUploadProgress = pending.fileSizeBytes > 0 ? Math.round((pending.bytesUploaded / pending.fileSizeBytes) * 100) : 0;
    render();
    window.setTimeout(() => document.querySelector(".source-form-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    return;
  }
  if (action === "cancel-pending-upload") {
    void cancelPendingSourceUpload();
    return;
  }
  if (action === "open-source-form") {
    const mode = element.dataset.sourceKind === "url" ? "url" : "file";
    state.sourceDraft = createEmptySourceDraft(mode);
    state.sourceFile = null;
    state.sourceUploadProgress = 0;
    state.sourceUploadMessage = "";
    state.sourceFormOpen = true;
    render();
    window.setTimeout(() => document.querySelector(".source-form-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    return;
  }
  if (action === "close-source-form") {
    state.sourceFormOpen = false;
    state.sourceFile = null;
    state.sourceUploadMessage = "";
    state.sourceUploadProgress = 0;
    render();
    return;
  }
  if (action === "save-source") {
    void saveSourceFromForm();
    return;
  }
  if (action === "export-source-registry") return exportSourceRegistry();
  if (action === "close-source-details") {
    state.selectedSourceId = "";
    render();
    return;
  }
  const sourceId = element.dataset.sourceId;
  if (action === "view-source" && sourceId) {
    state.selectedSourceId = sourceId;
    render();
    window.setTimeout(() => document.querySelector(".source-details-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    return;
  }
  if (action === "archive-source" && sourceId) { void archiveSource(sourceId); return; }
  if (action === "restore-source" && sourceId) { void restoreSource(sourceId); return; }
  if (action === "index-source" && sourceId) { void extractAndIndexSource(sourceId); return; }
}

const MAX_AUTO_VISUAL_ENHANCEMENTS = 3;

function visualEnhancementProposal(item: PlanItem): PlanItem["proposals"][number] | undefined {
  return selectedProposal(state.draft, item) ?? item.proposals[0];
}

async function enhancePlanVisual(planItemId: string, automatic = false): Promise<boolean> {
  const item = state.draft.plan.find((entry) => entry.id === planItemId);
  if (!item?.visual || item.visual.type === "none" || !isAiIllustrationEligible(item.visual)) {
    if (!automatic) showToast("هذا الرسم يجب أن يبقى حتميًا لحماية دقته العلمية.");
    return false;
  }
  if (!state.draft.visualEnhancementEnabled) {
    if (!automatic) showToast("فعّل خيار الرسوم الهجينة أولًا؛ بقي الرسم العلمي الحتمي مستخدمًا.");
    return false;
  }
  if (state.draft.status === "معتمد" || state.visualEnhancementBusyIds.has(planItemId)) return false;
  if (!questionGenerationService || !centralSourceStore?.currentSession || state.sourceStorageStatus !== "متصل") {
    const message = "يلزم تسجيل دخول مالك المنصة لتوليد الصورة؛ بقي الرسم العلمي الحتمي محفوظًا.";
    state.visualEnhancementMessages[planItemId] = message;
    if (!automatic) showToast(message);
    render();
    return false;
  }
  const proposal = visualEnhancementProposal(item);
  if (!proposal || state.draft.grade === null) return false;
  const subject = SUBJECTS.find((entry) => entry.id === state.draft.subjectId)?.label ?? state.draft.subjectId;
  const previousAssetPath = item.visual.illustration?.assetPath ?? "";
  const startedDraftId = state.draft.id;
  state.visualEnhancementBusyIds.add(planItemId);
  state.visualEnhancementMessages[planItemId] = "جارٍ إنشاء صورة 2D ثم فحصها علميًا؛ الرسم الحتمي باقٍ كخطة رجوع.";
  render();
  try {
    const result = await questionGenerationService.generateIllustration({
      action: "generate_visual_illustration",
      draftId: state.draft.id,
      planItemId: item.id,
      grade: state.draft.grade,
      subject,
      lessonLabel: item.lessonLabel,
      questionText: `${proposal.stimulus ? `${proposal.stimulus} ` : ""}${proposal.text}`.trim(),
      sourceSupport: proposal.sourceSupport || item.outcomeLabel || item.lessonLabel,
      ...(previousAssetPath ? { previousAssetPath } : {}),
      visual: stripQuestionVisualIllustration(item.visual),
    });
    if (state.draft.id !== startedDraftId) return false;
    if (result.status === "ready" && result.illustration) {
      item.visual = { ...stripQuestionVisualIllustration(item.visual), illustration: result.illustration };
      state.visualEnhancementMessages[planItemId] = "تم اعتماد صورة 2D بعد الفحص العلمي، مع الاحتفاظ بالرسم الحتمي خلفها.";
      scheduleSave();
      if (!automatic) showToast("تم تحسين الرسم بصريًا واعتماده علميًا.");
      return true;
    }
    state.visualEnhancementMessages[planItemId] = result.reason || "لم تجتز الصورة الفحص؛ استخدم واثق الرسم الحتمي دون تعطيل الاختبار.";
    if (!automatic) showToast("لم تعتمد الصورة الجديدة؛ بقي الرسم الحتمي الآمن.");
    return false;
  } catch (error) {
    if (state.draft.id !== startedDraftId) return false;
    const message = error instanceof Error ? error.message : "تعذر تحسين الصورة.";
    state.visualEnhancementMessages[planItemId] = `${message} بقي الرسم الحتمي محفوظًا.`;
    if (!automatic) showToast(state.visualEnhancementMessages[planItemId]!);
    return false;
  } finally {
    state.visualEnhancementBusyIds.delete(planItemId);
    if (state.draft.id === startedDraftId) render();
  }
}

async function enhanceEligibleVisuals(): Promise<void> {
  if (state.visualEnhancementAutoStarted || !state.draft.visualEnhancementEnabled || state.draft.status === "معتمد") return;
  state.visualEnhancementAutoStarted = true;
  const candidates = state.draft.plan
    .filter((item) => item.visual && item.visual.type !== "none" && isAiIllustrationEligible(item.visual) && !item.visual.illustration?.validated)
    .slice(0, MAX_AUTO_VISUAL_ENHANCEMENTS);
  for (const item of candidates) {
    await enhancePlanVisual(item.id, true);
  }
}

function restoreDeterministicVisual(planItemId: string): void {
  const item = state.draft.plan.find((entry) => entry.id === planItemId);
  if (!item?.visual || state.draft.status === "معتمد") return;
  item.visual = stripQuestionVisualIllustration(item.visual);
  state.visualEnhancementMessages[planItemId] = "تمت العودة إلى الرسم العلمي الحتمي فقط.";
  scheduleSave();
  render();
  showToast("تم استخدام الرسم الحتمي فقط.");
}

function mergeReusablePlan(expected: PlanItem[], existing: PlanItem[]): PlanItem[] {
  const existingById = new Map(existing.map((item) => [item.id, item]));
  return expected.map((item) => {
    const saved = existingById.get(item.id);
    const sameStructure = saved
      && saved.lessonLabel === item.lessonLabel
      && saved.questionType === item.questionType
      && saved.cognitiveLevel === item.cognitiveLevel
      && saved.marks === item.marks
      && saved.sourceReferenceId === item.sourceReferenceId;
    return sameStructure ? { ...item, proposals: saved.proposals, ...(saved.visual ? { visual: saved.visual } : {}) } : item;
  });
}

function replacePlanItems(plan: PlanItem[], replacements: PlanItem[]): PlanItem[] {
  const replacementById = new Map(replacements.map((item) => [item.id, item]));
  return plan.map((item) => replacementById.get(item.id) ?? item);
}

async function nextStep(): Promise<void> {
  const step = state.draft.currentStep;
  if (step === 1) {
    const lessons = normalizeLessonTopics(state.draft.lessonTopics);
    if (state.draft.grade === null || !state.draft.subjectId || lessons.length < MIN_LESSON_TOPICS || lessons.length > MAX_LESSON_TOPICS) {
      return showToast(`اختر الصف والمادة وحدد من ${MIN_LESSON_TOPICS} إلى ${MAX_LESSON_TOPICS} دروس من القائمة.`);
    }
    syncDraftTopicFromLessons(state.draft);
    const matched = await prepareSourceContext();
    if (!matched) return;
    return setStep(2);
  }
  if (step === 2) {
    syncSetupFieldsFromDom();
    const validation = validateExamSetup(state.draft);
    if (!validation.valid) return showToast("اضبط البيانات المشار إليها قبل المتابعة.");
    const expectedPlan = buildPlan(state.draft);
    state.draft.plan = mergeReusablePlan(expectedPlan, state.draft.plan);
    const validPlanIds = new Set(state.draft.plan.map((item) => item.id));
    state.draft.selectedProposalByPlanItem = Object.fromEntries(
      Object.entries(state.draft.selectedProposalByPlanItem).filter(([planItemId]) => validPlanIds.has(planItemId)),
    );
    if (!persistDraftCheckpoint()) return;
    const generated = await generateQuestionsForPlan(state.draft.plan);
    if (!generated) return;
    setStep(3);
    void enhanceEligibleVisuals();
    return;
  }
  if (step === 3) {
    if (!isPlanComplete(state.draft)) return showToast("اختر سؤالًا واحدًا لكل مفردة.");
    if (state.draft.status !== "معتمد") state.draft.status = "جاهز للمراجعة";
    return setStep(4);
  }
}

async function generateQuestionsForPlan(plan: PlanItem[]): Promise<boolean> {
  if (!questionGenerationService || !centralSourceStore?.currentSession || state.sourceStorageStatus !== "متصل") {
    invalidateGeneratedQuestions();
    state.questionGenerationMessage = "يلزم تسجيل دخول مالك المنصة وتشغيل خدمة توليد الأسئلة قبل المتابعة.";
    render();
    showToast(state.questionGenerationMessage);
    return false;
  }
  if (state.draft.grade === null) {
    showToast("الصف الدراسي غير محدد.");
    return false;
  }
  const subject = SUBJECTS.find((item) => item.id === state.draft.subjectId)?.label ?? state.draft.subjectId;
  if (state.draft.generationMode === "whole_exam_v2" && plan.length <= 12) {
    const completeV2 = plan.length > 0 && plan.every((item) => item.proposals.length === 1);
    if (completeV2) {
      state.questionGenerationMessage = `اكتمل تصميم الاختبار الكامل وحُفظت ${plan.length} مفردات؛ راجعها قبل الاعتماد.`;
      return true;
    }
    state.questionGenerationBusy = true;
    state.questionGenerationMessage = "جارٍ تصميم الاختبار كاملًا، ثم مراجعته علميًا وتقويميًا كوحدة واحدة…";
    if (!persistDraftCheckpoint()) {
      state.questionGenerationBusy = false;
      return false;
    }
    render();
    try {
      const request = buildWholeExamGenerationRequestV2(
        state.draft.assessmentType,
        state.draft.topic,
        state.draft.lessonTopics,
        state.draft.grade,
        subject,
        state.draft.difficulty,
        state.draft.sourceReferences,
        state.draft.plan,
        state.lessonCatalog,
        state.draft.trustedEnrichmentEnabled,
      );
      const rawResponse = await questionGenerationService.generateWholeExam(request);
      const response = parseWholeExamGenerationResponseV2(rawResponse, request.items);
      state.draft.plan = applyWholeExamQuestionsV2(state.draft.plan, response);
      state.draft.selectedProposalByPlanItem = Object.fromEntries(
        state.draft.plan.map((item) => [item.id, item.proposals[0]?.id ?? ""]).filter((entry) => Boolean(entry[1])),
      );
      state.draft.generationVersion = ASSESSMENT_GENERATION_V2_VERSION;
      state.draft.generationModel = response.model;
      state.draft.generatedAt = response.generatedAt;
      state.questionGenerationBusy = false;
      state.questionGenerationMessage = `تم تصميم اختبار كامل من ${state.draft.plan.length} مفردات ومراجعته كوحدة واحدة. راجع الأسئلة ثم اعتمدها أو جدد مفردة محددة.`;
      persistDraftCheckpoint(false);
      render();
      return true;
    } catch (error) {
      state.questionGenerationBusy = false;
      const detail = error instanceof Error ? error.message : "تعذر تصميم الاختبار الكامل.";
      const saved = persistDraftCheckpoint(false);
      state.questionGenerationMessage = `${detail} بقيت المسودة على محرك تصميم الاختبار كاملًا ولم يغيّر واثق طريقة التوليد؛ ${saved ? "حُفظت المسودة الحالية ويمكنك إعادة المحاولة من الموضع نفسه." : "تعذر حفظ المسودة في تخزين المتصفح؛ استخدم زر الحفظ قبل مغادرة الصفحة."}`;
      render();
      showToast(detail);
      return false;
    }
  }
  if (state.draft.generationMode === "whole_exam_v2" && plan.length > 12) {
    state.draft.generationMode = "legacy_items";
    state.questionGenerationMessage = "محرك الاختبار الكامل V2 يدعم الاختبارات القصيرة حتى 12 مفردة في هذه المرحلة؛ حوّل واثق هذه المسودة إلى المحرك السابق للاختبار النهائي مع بقاء الخطة كاملة.";
    scheduleSave();
    render();
  }
  const pendingItems = plan.filter((item) => item.proposals.length !== 3);
  if (!pendingItems.length) {
    state.questionGenerationMessage = `اكتملت ${plan.length} مفردات وحُفظت؛ يمكنك الانتقال إلى الاختيار.`;
    return true;
  }
  const batches = splitQuestionGenerationBatches(pendingItems);
  let completedCount = plan.length - pendingItems.length;
  state.questionGenerationBusy = true;
  render();
  try {
    const generateBatch = async (batch: PlanItem[]): Promise<void> => {
      const request = buildQuestionGenerationRequest(
        state.draft.assessmentType,
        state.draft.topic,
        state.draft.lessonTopics,
        state.draft.grade!,
        subject,
        state.draft.difficulty,
        state.draft.sourceReferences,
        batch,
        state.draft.plan,
        state.lessonCatalog,
        state.draft.trustedEnrichmentEnabled,
      );
      const response = await questionGenerationService.generate(request);
      const replacements = applyGeneratedQuestions(batch, response);
      state.draft.plan = replacePlanItems(state.draft.plan, replacements);
      state.draft.generationVersion = SOURCE_GENERATION_VERSION;
      state.draft.generationModel = response.model;
      state.draft.generatedAt = response.generatedAt;
      completedCount += batch.length;
      persistDraftCheckpoint(false);
    };

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      if (!batch) continue;
      state.questionGenerationMessage = `جارٍ إنشاء الدفعة ${batchIndex + 1} من ${batches.length}؛ اكتمل ${completedCount} من ${plan.length} مفردات…`;
      render();
      try {
        await generateBatch(batch);
      } catch (batchError) {
        if (batch.length === 1) throw batchError;
        state.questionGenerationMessage = `تعذر اعتماد دفعة من مفردتين؛ يعزل واثق كل مفردة الآن حتى لا تضيع المفردة السليمة. اكتمل ${completedCount} من ${plan.length}…`;
        render();
        for (const isolatedItem of batch) {
          await generateBatch([isolatedItem]);
        }
      }
    }
    state.draft.selectedProposalByPlanItem = {};
    state.questionGenerationBusy = false;
    state.questionGenerationMessage = `تم إنشاء ${state.draft.plan.length} مفردات موثقة على دفعات؛ اختر البديل الأنسب لكل مفردة.`;
    persistDraftCheckpoint(false);
    render();
    return true;
  } catch (error) {
    state.questionGenerationBusy = false;
    const completed = state.draft.plan.filter((item) => item.proposals.length === 3).length;
    const detail = error instanceof Error ? error.message : "تعذر إنشاء الأسئلة من المصدر.";
    const saved = persistDraftCheckpoint(false);
    state.questionGenerationMessage = `${detail} تم الاحتفاظ بـ ${completed} من ${state.draft.plan.length} مفردات مكتملة${saved ? " وحفظها" : ""}؛ اضغط التالي لإكمال الباقي فقط.`;
    render();
    showToast(detail);
    return false;
  }
}

async function regeneratePlanItem(item: PlanItem): Promise<void> {
  if (state.questionGenerationBusy) return;
  if (!questionGenerationService || state.draft.grade === null) {
    showToast("خدمة توليد الأسئلة غير جاهزة.");
    return;
  }
  const subject = SUBJECTS.find((entry) => entry.id === state.draft.subjectId)?.label ?? state.draft.subjectId;
  state.questionGenerationBusy = true;
  state.questionGenerationMessage = `جارٍ توليد بدائل مشابهة للسؤال ${state.draft.plan.indexOf(item) + 1}…`;
  render();
  try {
    const request = buildQuestionGenerationRequest(
      state.draft.assessmentType,
      state.draft.topic,
      state.draft.lessonTopics,
      state.draft.grade,
      subject,
      state.draft.difficulty,
      state.draft.sourceReferences,
      [item],
      state.draft.plan,
      state.lessonCatalog,
      state.draft.trustedEnrichmentEnabled,
    );
    const anchor = selectedProposal(state.draft, item) ?? item.proposals[0];
    if (anchor && request.items[0]) {
      request.items[0].regenerationAnchor = {
        stimulus: anchor.stimulus ?? "",
        text: anchor.text,
        answer: anchor.answer,
        questionForm: anchor.questionForm ?? request.items[0].styleTarget,
      };
    }
    const response = await questionGenerationService.generate(request);
    const [generatedReplacement] = applyGeneratedQuestions([item], response);
    if (!generatedReplacement) throw new Error("تعذر ربط البدائل الجديدة بمفردة الخطة.");
    const replacement = state.draft.generationMode === "whole_exam_v2"
      ? { ...generatedReplacement, proposals: generatedReplacement.proposals.slice(0, 1).map((proposal) => ({ ...proposal, id: `${item.id}-v2-primary` })) }
      : generatedReplacement;
    state.draft.plan = state.draft.plan.map((entry) => entry.id === item.id ? replacement : entry);
    if (state.draft.generationMode === "whole_exam_v2" && replacement.proposals[0]) {
      state.draft.selectedProposalByPlanItem[item.id] = replacement.proposals[0].id;
      state.draft.generationVersion = ASSESSMENT_GENERATION_V2_VERSION;
    } else {
      delete state.draft.selectedProposalByPlanItem[item.id];
      state.draft.generationVersion = SOURCE_GENERATION_VERSION;
    }
    state.draft.generationModel = response.model;
    state.draft.generatedAt = response.generatedAt;
    state.questionGenerationBusy = false;
    state.questionGenerationMessage = state.draft.generationMode === "whole_exam_v2"
      ? "تم تجديد السؤال المحدد مع الحفاظ على وضع تصميم الاختبار الكامل."
      : "تم توليد ثلاثة بدائل مشابهة لهذه المفردة.";
    scheduleSave();
    render();
    showToast(state.questionGenerationMessage);
  } catch (error) {
    state.questionGenerationBusy = false;
    state.questionGenerationMessage = error instanceof Error ? error.message : "تعذر تجديد بدائل السؤال.";
    render();
    showToast(state.questionGenerationMessage);
  }
}

async function prepareSourceContext(): Promise<boolean> {
  if (!centralSourceStore?.currentSession || state.sourceStorageStatus !== "متصل") {
    state.sourceRetrievalMessage = "يلزم تسجيل دخول مالك المنصة للوصول إلى المقاطع المفهرسة.";
    render();
    showToast(state.sourceRetrievalMessage);
    return false;
  }
  const lessons = normalizeLessonTopics(state.draft.lessonTopics);
  if (lessons.length < MIN_LESSON_TOPICS || lessons.length > MAX_LESSON_TOPICS) {
    state.sourceRetrievalMessage = `حدد من ${MIN_LESSON_TOPICS} إلى ${MAX_LESSON_TOPICS} دروس من القائمة قبل المتابعة.`;
    render();
    showToast(state.sourceRetrievalMessage);
    return false;
  }
  syncDraftTopicFromLessons(state.draft);
  const eligible = state.sources.filter((source) =>
    source.grade === state.draft.grade &&
    source.subjectId === state.draft.subjectId &&
    source.status === "مفهرس" &&
    source.extractionStatus === "مكتمل",
  );
  if (!eligible.length) {
    state.draft.sourceReferences = [];
    state.draft.sourceRetrievalVersion = "";
    state.sourceRetrievalMessage = "لا يوجد مصدر مفهرس مطابق لهذا الصف والمادة.";
    render();
    showToast(state.sourceRetrievalMessage);
    return false;
  }

  invalidateGeneratedQuestions();
  state.sourceRetrievalBusy = true;
  state.sourceRetrievalMessage = `جارٍ مطابقة ${lessons.length} دروس مع صفحات المصادر…`;
  render();
  try {
    const chunkGroups = await Promise.all(eligible.map(async (source) => ({
      source,
      chunks: await centralSourceStore.listSourceChunks(source.id),
    })));
    const candidates: SourceChunkCandidate[] = chunkGroups.flatMap(({ source, chunks }) =>
      chunks.map((chunk) => ({ source, chunk })),
    );
    const catalogByLabel = new Map(state.lessonCatalog.map((lesson) => [lesson.label, lesson]));
    const lessonResults = lessons.map((lesson, lessonIndex) => {
      const catalogLesson = catalogByLabel.get(lesson);
      const sourceScoped = catalogLesson
        ? candidates.filter((candidate) => candidate.source.id === catalogLesson.sourceId)
        : candidates;
      const pageStart = catalogLesson?.pageStart;
      const pageEnd = catalogLesson?.pageEnd ?? pageStart;
      const exactPageScoped = pageStart && pageEnd
        ? sourceScoped.filter((candidate) => candidate.chunk.pageFrom <= pageEnd && candidate.chunk.pageTo >= pageStart)
        : sourceScoped;
      // Curated TOC pages are mapped to PDF pages, but extraction boundaries may drift by a page or two.
      // Search the exact lesson range first, then a small PDF neighbourhood, then the source with strict title matching.
      const paddedPageScoped = pageStart && pageEnd
        ? sourceScoped.filter((candidate) => candidate.chunk.pageFrom <= pageEnd + 3 && candidate.chunk.pageTo >= Math.max(1, pageStart - 3))
        : sourceScoped;
      const query = catalogLesson ? `${catalogLesson.code} ${catalogLesson.title}` : lesson;
      const exactResult = rankSourceChunks(query, exactPageScoped, 2);
      const paddedResult = exactResult.references.length ? exactResult : rankSourceChunks(query, paddedPageScoped, 2);
      const result = paddedResult.references.length ? paddedResult : rankSourceChunks(query, sourceScoped, 2);
      return {
        lesson,
        references: result.references.map((reference) => ({
          ...reference,
          id: `${reference.id}:lesson-${lessonIndex + 1}`,
          lessonTopic: lesson,
        })),
      };
    });
    const missingLessons = lessonResults.filter((result) => result.references.length === 0).map((result) => result.lesson);
    if (missingLessons.length) {
      state.draft.sourceReferences = [];
      state.draft.sourceRetrievalVersion = "";
      state.sourceRetrievalBusy = false;
      state.sourceRetrievalMessage = `لم يجد واثق صفحات واضحة للدروس: ${missingLessons.join("، ")}. راجع اختيار الدروس من شجرة الكتاب.`;
      render();
      showToast("بعض الدروس لم ترتبط بصفحات من المصدر.");
      return false;
    }
    state.draft.sourceReferences = lessonResults.flatMap((result) => result.references);
    state.draft.sourceRetrievalVersion = SOURCE_RETRIEVAL_VERSION;
    state.sourceRetrievalBusy = false;
    const matchedSources = new Set(state.draft.sourceReferences.map((reference) => reference.sourceId)).size;
    state.sourceRetrievalMessage = `تم ربط ${lessons.length} دروس بـ ${state.draft.sourceReferences.length} مقاطع من ${matchedSources} مصدر.`;
    scheduleSave();
    render();
    return true;
  } catch (error) {
    state.sourceRetrievalBusy = false;
    state.draft.sourceReferences = [];
    state.draft.sourceRetrievalVersion = "";
    state.sourceRetrievalMessage = error instanceof Error ? error.message : "تعذر قراءة مقاطع المصادر المفهرسة.";
    render();
    showToast(state.sourceRetrievalMessage);
    return false;
  }
}

async function loadLessonCatalogForCurrentSelection(force = false): Promise<void> {
  const key = lessonCatalogSelectionKey();
  if (!force && (state.lessonCatalogBusy || state.lessonCatalogKey === key)) return;
  state.lessonCatalogKey = key;
  state.lessonCatalog = [];
  state.lessonCatalogMessage = "";
  if (state.draft.grade === null || !state.draft.subjectId) return;
  const eligible = eligibleSourcesForDraft();
  if (!eligible.length) {
    state.lessonCatalogMessage = "لا يوجد مصدر مفهرس مطابق للصف والمادة.";
    return;
  }
  state.lessonCatalogBusy = true;
  render();
  try {
    const structures = new Map<string, SourceStructureNode[]>();
    if (centralSourceStore?.currentSession && state.sourceStorageStatus === "متصل") {
      const loaded = await Promise.all(eligible.map(async (source) => {
        try {
          const storedNodes = await centralSourceStore.listSourceStructure(source.id);
          const curatedNodes = buildCuratedBookStructure(source);
          let nodes = [...storedNodes, ...curatedNodes];
          // ندمج البنية المستخرجة الموثوقة بدل استبدال شجرة بأخرى؛ فالاستبدال كان يسقط دروسًا صحيحة.
          const chunks = await centralSourceStore.listSourceChunks(source.id);
          const extracted = extractSourceStructure(
            source.id,
            chunks,
            source.extractedPageCount ?? 0,
            { allowUnitHeadingFallback: false },
          );
          if (extracted.reliableTocFound) nodes = [...nodes, ...extracted.nodes];
          return [source.id, nodes] as const;
        } catch {
          return [source.id, [] as SourceStructureNode[]] as const;
        }
      }));
      loaded.forEach(([sourceId, nodes]) => structures.set(sourceId, nodes));
    }
    state.lessonCatalog = buildLessonCatalog(eligible, structures);
    const unitGroups = buildLessonUnitGroups(state.lessonCatalog);
    state.lessonCatalogActiveUnitKey = resolveActiveLessonUnitKey(
      unitGroups,
      new Set(normalizeLessonTopics(state.draft.lessonTopics)),
    );
    const validLabels = new Set(state.lessonCatalog.map((lesson) => lesson.label));
    const retained = normalizeLessonTopics(state.draft.lessonTopics).filter((label) => validLabels.has(label));
    if (retained.length !== normalizeLessonTopics(state.draft.lessonTopics).length) {
      state.draft.lessonTopics = retained;
      syncDraftTopicFromLessons(state.draft);
      invalidateSourceAndGeneratedQuestions();
      scheduleSave();
    }
    const curatedCount = state.lessonCatalog.filter((lesson) => lesson.origin === "curated-book-tree").length;
    const detectedCount = state.lessonCatalog.filter((lesson) => lesson.origin === "detected-heading").length;
    const unitCount = buildLessonUnitGroups(state.lessonCatalog).length;
    state.lessonCatalogMessage = state.lessonCatalog.length
      ? `${curatedCount ? "تم تجهيز شجرة الكتاب المعتمدة" : "تم تجهيز شجرة المصدر"}: ${unitCount} وحدات و${state.lessonCatalog.length} درسًا${detectedCount ? `، منها ${detectedCount} دروس مكتملة من عناوين المصدر` : ""}.`
      : "لا توجد شجرة محتوى موثوقة لهذا الكتاب بعد.";
  } finally {
    state.lessonCatalogBusy = false;
    render();
  }
}

function bindContentStep(): void {
  const gradeSelect = document.querySelector<HTMLSelectElement>("#grade-select");
  gradeSelect?.addEventListener("change", () => {
    state.draft.grade = gradeSelect.value ? Number(gradeSelect.value) : null;
    applyOfficialAssessmentTemplate(state.draft);
    state.draft.subjectId = "";
    state.draft.lessonTopics = [];
    state.draft.topic = "";
    state.lessonCatalog = [];
    state.lessonCatalogKey = "";
    state.lessonCatalogMessage = "";
    state.lessonCatalogActiveUnitKey = "";
    invalidateSourceAndGeneratedQuestions();
    scheduleSave();
    render();
  });

  const subjectSelect = document.querySelector<HTMLSelectElement>("#subject-select");
  subjectSelect?.addEventListener("change", () => {
    state.draft.subjectId = subjectSelect.value;
    state.draft.lessonTopics = [];
    state.draft.topic = "";
    state.lessonCatalog = [];
    state.lessonCatalogKey = "";
    state.lessonCatalogMessage = "";
    state.lessonCatalogActiveUnitKey = "";
    invalidateSourceAndGeneratedQuestions();
    scheduleSave();
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-lesson-unit-target]").forEach((control) => {
    control.addEventListener("click", () => {
      const target = control.dataset.lessonUnitTarget;
      if (!target || target === state.lessonCatalogActiveUnitKey) return;
      state.lessonCatalogActiveUnitKey = target;
      render();
      document.querySelector<HTMLElement>(".lesson-catalog-field")?.scrollIntoView({ block: "start" });
    });
  });

  document.querySelector<HTMLSelectElement>("#lesson-unit-select")?.addEventListener("change", (event) => {
    state.lessonCatalogActiveUnitKey = (event.target as HTMLSelectElement).value;
    render();
    document.querySelector<HTMLElement>(".lesson-catalog-field")?.scrollIntoView({ block: "start" });
  });

  document.querySelectorAll<HTMLInputElement>("[data-lesson-option-id]").forEach((input) => {
    input.addEventListener("change", () => {
      const option = state.lessonCatalog.find((lesson) => lesson.id === input.dataset.lessonOptionId);
      if (!option) return;
      state.lessonCatalogActiveUnitKey = input.dataset.lessonUnitKey ?? state.lessonCatalogActiveUnitKey;
      const selected = new Set(normalizeLessonTopics(state.draft.lessonTopics));
      if (input.checked) {
        if (selected.size >= MAX_LESSON_TOPICS) {
          input.checked = false;
          showToast(`يمكن اختيار ${MAX_LESSON_TOPICS} دروس كحد أقصى.`);
          return;
        }
        selected.add(option.label);
      } else {
        selected.delete(option.label);
      }
      state.draft.lessonTopics = state.lessonCatalog.filter((lesson) => selected.has(lesson.label)).map((lesson) => lesson.label);
      syncDraftTopicFromLessons(state.draft);
      invalidateSourceAndGeneratedQuestions();
      scheduleSave();
      render();
    });
  });

  if (state.draft.grade !== null && state.draft.subjectId && !state.lessonCatalogBusy && state.lessonCatalogKey !== lessonCatalogSelectionKey()) {
    window.setTimeout(() => { void loadLessonCatalogForCurrentSelection(); }, 0);
  }
}

function syncSetupFieldsFromDom(): void {
  const dateInput = document.querySelector<HTMLInputElement>("#date-input");
  if (dateInput?.value) state.draft.examDate = dateInput.value;
  const schoolInput = document.querySelector<HTMLInputElement>("#school-input");
  if (schoolInput) state.draft.school = schoolInput.value;
  const directorateInput = document.querySelector<HTMLInputElement>("#directorate-input");
  if (directorateInput) state.draft.directorate = directorateInput.value;
  const academicYearInput = document.querySelector<HTMLInputElement>("#academic-year-input");
  if (academicYearInput) state.draft.academicYear = academicYearInput.value;
  const semesterSelect = document.querySelector<HTMLSelectElement>("#semester-select");
  if (semesterSelect) state.draft.semester = semesterSelect.value;
}

function bindSetupStep(): void {
  document.querySelector<HTMLSelectElement>("#exam-title-select")?.addEventListener("change", (event) => {
    const title = (event.target as HTMLSelectElement).value as ExamTitleOption;
    setExamTitle(state.draft, title);
    state.questionGenerationMessage = "";
    scheduleSave();
    render();
  });

  const inputBindings: Array<[string, keyof Pick<ExamDraft, "examDate" | "school" | "directorate" | "academicYear">]> = [
    ["date-input", "examDate"],
    ["school-input", "school"],
    ["directorate-input", "directorate"],
    ["academic-year-input", "academicYear"],
  ];
  inputBindings.forEach(([id, key]) => {
    const input = document.querySelector<HTMLInputElement>(`#${id}`);
    const update = (): void => {
      state.draft[key] = input?.value ?? "";
      scheduleSave();
    };
    input?.addEventListener("input", update);
    input?.addEventListener("change", update);
    input?.addEventListener("blur", update);
  });

  document.querySelector<HTMLSelectElement>("#semester-select")?.addEventListener("change", (event) => {
    state.draft.semester = (event.target as HTMLSelectElement).value;
    scheduleSave();
  });

  document.querySelectorAll<HTMLInputElement>('input[name="generation-mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.draft.generationMode = input.value === "legacy_items" ? "legacy_items" : "whole_exam_v2";
      invalidateGeneratedQuestions();
      state.questionGenerationMessage = state.draft.generationMode === "whole_exam_v2"
        ? "سيصمم واثق الاختبار كاملًا في طلب واحد، ثم يراجعه بوصفه وحدة متكاملة قبل عرضه."
        : "تم اختيار المحرك السابق الذي يولد المفردات على دفعات صغيرة.";
      scheduleSave();
      render();
    });
  });

  document.querySelector<HTMLInputElement>("#trusted-enrichment-toggle")?.addEventListener("change", (event) => {
    state.draft.trustedEnrichmentEnabled = (event.target as HTMLInputElement).checked;
    state.questionGenerationMessage = state.draft.trustedEnrichmentEnabled
      ? "سيستخدم واثق إثراءً موثقًا في المفردات الجديدة أو المعاد توليدها، مع بقاء صفحات الكتاب حاكمة للسؤال والإجابة."
      : "تم إيقاف الإثراء الخارجي للمفردات الجديدة أو المعاد توليدها؛ ولن تُحذف الأسئلة المكتملة.";
    scheduleSave();
    render();
  });

  document.querySelector<HTMLInputElement>("#visual-enhancement-toggle")?.addEventListener("change", (event) => {
    state.draft.visualEnhancementEnabled = (event.target as HTMLInputElement).checked;
    state.visualEnhancementAutoStarted = false;
    state.questionGenerationMessage = state.draft.visualEnhancementEnabled
      ? "سيحافظ واثق على الرسوم الحتمية، ويضيف صورًا ثنائية الأبعاد مدققة للمشاهد المؤهلة فقط."
      : "تم إيقاف تحسين الصور الجديدة؛ وتبقى الرسوم الحالية والأسئلة المكتملة محفوظة.";
    scheduleSave();
    render();
  });

  document.querySelector<HTMLInputElement>("#duration-input")?.addEventListener("change", (event) => {
    state.draft.durationMinutes = Number((event.target as HTMLInputElement).value);
    scheduleSave();
    render();
  });

  document.querySelector<HTMLInputElement>("#marks-input")?.addEventListener("change", (event) => {
    state.draft.totalMarks = Number((event.target as HTMLInputElement).value);
    invalidateGeneratedQuestions();
    scheduleSave();
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => {
      state.draft.difficulty = button.dataset.difficulty as ExamDraft["difficulty"];
      invalidateGeneratedQuestions();
      scheduleSave();
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-count-change]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.countKey as keyof QuestionCounts;
      const change = Number(button.dataset.countChange);
      state.draft.counts[key] = Math.max(0, state.draft.counts[key] + change);
      invalidateGeneratedQuestions();
      scheduleSave();
      render();
    });
  });

  document.querySelectorAll<HTMLInputElement>("[data-count-input]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.countInput as keyof QuestionCounts;
      state.draft.counts[key] = Math.max(0, Number(input.value));
      invalidateGeneratedQuestions();
      scheduleSave();
      render();
    });
  });
}

function applySuggestedCounts(): void {
  const officialSpec = getOfficialAssessmentSpec(state.draft.grade, state.draft.title);
  if (officialSpec) {
    applyOfficialAssessmentTemplate(state.draft);
  } else {
    const suggestion = validateExamSetup(state.draft).suggestedCounts;
    if (!suggestion) return;
    state.draft.counts = suggestion;
  }
  invalidateGeneratedQuestions();
  scheduleSave();
  render();
}

function bindPlanStep(): void {
  document.querySelectorAll<HTMLInputElement>("[data-plan-id]").forEach((input) => {
    input.addEventListener("change", () => {
      if (state.draft.status === "معتمد") return;
      const planId = input.dataset.planId;
      if (!planId) return;
      state.draft.selectedProposalByPlanItem[planId] = input.value;
      scheduleSave();
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-regenerate]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.draft.status === "معتمد") return;
      const planId = button.dataset.regenerate;
      const item = state.draft.plan.find((entry) => entry.id === planId);
      if (!item) return;
      void regeneratePlanItem(item);
    });
  });
}

function bindLibrary(): void {
  document.querySelectorAll<HTMLElement>("[data-library-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.libraryFilter = button.dataset.libraryFilter as AppState["libraryFilter"];
      render();
    });
  });

  document.querySelector<HTMLInputElement>("#library-search")?.addEventListener("input", (event) => {
    const query = (event.target as HTMLInputElement).value.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>(".exam-card").forEach((card) => {
      card.hidden = !(card.dataset.searchText ?? "").toLowerCase().includes(query);
    });
  });
}


function bindAdmin(): void {
  document.querySelectorAll<HTMLElement>("[data-source-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.sourceFilter = button.dataset.sourceFilter as AppState["sourceFilter"];
      render();
    });
  });

  document.querySelector<HTMLInputElement>("#source-search")?.addEventListener("input", (event) => {
    const query = (event.target as HTMLInputElement).value.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>("[data-source-search]").forEach((row) => {
      row.hidden = !(row.dataset.sourceSearch ?? "").toLowerCase().includes(query);
    });
  });

  bindSourceTextInput("source-title", "title");
  bindSourceTextInput("source-version", "version");
  bindSourceTextInput("source-url", "url");

  document.querySelector<HTMLSelectElement>("#source-kind")?.addEventListener("change", (event) => {
    state.sourceDraft.kind = (event.target as HTMLSelectElement).value as SourceDraft["kind"];
    render();
  });
  document.querySelector<HTMLSelectElement>("#source-semester")?.addEventListener("change", (event) => {
    state.sourceDraft.semester = (event.target as HTMLSelectElement).value as SourceDraft["semester"];
    render();
  });
  document.querySelector<HTMLSelectElement>("#source-grade")?.addEventListener("change", (event) => {
    const value = (event.target as HTMLSelectElement).value;
    state.sourceDraft.grade = value ? Number(value) : null;
    const subjectStillValid = SUBJECTS.some(
      (subject) => subject.id === state.sourceDraft.subjectId && state.sourceDraft.grade !== null && subject.grades.includes(state.sourceDraft.grade),
    );
    if (!subjectStillValid) state.sourceDraft.subjectId = "";
    render();
  });
  document.querySelector<HTMLSelectElement>("#source-subject")?.addEventListener("change", (event) => {
    state.sourceDraft.subjectId = (event.target as HTMLSelectElement).value;
    render();
  });
  document.querySelector<HTMLInputElement>("#source-file")?.addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    state.sourceFile = file;
    state.sourceDraft.fileName = file?.name ?? state.sourceDraft.fileName;
    state.sourceUploadMessage = file ? `جاهز للرفع: ${file.name}` : "";
    render();
  });
  document.querySelector<HTMLInputElement>("#source-rights")?.addEventListener("change", (event) => {
    state.sourceDraft.rightsConfirmed = (event.target as HTMLInputElement).checked;
  });


  document.querySelector<HTMLInputElement>("#source-registry-file")?.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await importSourceRegistry(file);
  });
}

function bindSourceTextInput(id: string, key: "title" | "version" | "url"): void {
  document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener("input", (event) => {
    state.sourceDraft[key] = (event.target as HTMLInputElement).value;
  });
}

async function saveSourceFromForm(): Promise<void> {
  const validation = validateSourceDraft(state.sourceDraft);
  if (!validation.valid) {
    render();
    showToast(validation.issues[0]?.message ?? "أكمل بيانات المصدر.");
    return;
  }

  if (state.sourceDraft.mode === "url") {
    const duplicate = findDuplicateSource(state.sources, state.sourceDraft);
    if (duplicate) {
      showToast(`هذا المصدر مسجل بالفعل برقم ${duplicate.catalogCode}.`);
      return;
    }
    const source = createManagedSource(state.sourceDraft);
    state.sources = [source, ...state.sources];
    saveSources(state.sources);
    state.sourceFormOpen = false;
    state.sourceDraft = createEmptySourceDraft();
    render();
    if (state.sourceStorageStatus === "متصل") await persistSourcesCentrally([source], "تم حفظ الرابط في السجل المركزي.");
    else showToast("تم حفظ الرابط محليًا، وسيُنقل إلى السجل المركزي بعد الاتصال.");
    return;
  }

  if (!googleDriveService || state.driveStatus !== "متصل" || state.sourceStorageStatus !== "متصل") {
    showToast("سجّل الدخول واربط Google Drive قبل رفع ملف PDF.");
    return;
  }
  if (!state.sourceFile) {
    showToast(state.pendingSourceUpload ? "اختر ملف PDF نفسه لاستكمال الرفع." : "اختر ملف PDF قبل الرفع.");
    return;
  }

  const pending = state.pendingSourceUpload;
  const source = pending && pending.fileName === state.sourceFile.name
    ? {
        ...pending.source,
        title: state.sourceDraft.title.trim(),
        kind: state.sourceDraft.kind,
        grade: state.sourceDraft.grade ?? pending.source.grade,
        subjectId: state.sourceDraft.subjectId,
        version: state.sourceDraft.version.trim(),
        semester: state.sourceDraft.semester || "غير محدد",
        fileName: state.sourceFile.name,
        drivePath: buildSourceDrivePath(state.sourceDraft),
        updatedAt: new Date().toISOString(),
      }
    : createManagedSource(state.sourceDraft);
  const metadataDuplicate = findDuplicateSource(state.sources, state.sourceDraft);
  if (!pending && metadataDuplicate) {
    showToast(`هذا المصدر مسجل بالفعل برقم ${metadataDuplicate.catalogCode}.`);
    return;
  }

  state.sourceUploadBusy = true;
  state.sourceUploadProgress = pending?.fileSizeBytes ? Math.round((pending.bytesUploaded / pending.fileSizeBytes) * 100) : 0;
  state.sourceUploadMessage = pending ? "جارٍ التحقق من آخر جزء مرفوع…" : "جارٍ حساب بصمة الملف وتجهيز المجلد…";
  render();
  try {
    const uploaded = await googleDriveService.uploadPdfSource(
      { ...source, subjectLabel: sourceSubjectLabel(source.subjectId) } as ManagedSource & { subjectLabel: string },
      state.sourceFile,
      updateSourceUploadProgress,
    );
    const contentDuplicate = uploaded.contentFingerprint ? findDuplicateContentSource(state.sources, uploaded.contentFingerprint) : undefined;
    state.sources = [uploaded, ...state.sources.filter((item) => item.id !== uploaded.id && item.id !== contentDuplicate?.id)];
    saveSources(state.sources);
    state.pendingSourceUpload = null;
    state.sourceUploadBusy = false;
    state.sourceUploadProgress = 100;
    state.sourceUploadMessage = "اكتمل الرفع والحفظ في Google Drive.";
    state.sourceFormOpen = false;
    state.sourceFile = null;
    state.sourceDraft = createEmptySourceDraft();
    const remoteSources = await centralSourceStore?.listSources();
    if (remoteSources) { state.sources = remoteSources; saveSources(remoteSources); }
    render();
    showToast("تم رفع ملف PDF وحفظ سجله المركزي بنجاح.");
  } catch (error) {
    state.pendingSourceUpload = googleDriveService.getPendingUpload();
    state.sourceUploadBusy = false;
    state.sourceUploadMessage = error instanceof Error ? error.message : "تعذر رفع ملف PDF.";
    render();
    showToast(state.sourceUploadMessage);
  }
}

function updateSourceUploadProgress(progress: SourceUploadProgress): void {
  state.sourceUploadProgress = progress.percent;
  state.sourceUploadMessage = progress.message;
  state.pendingSourceUpload = googleDriveService?.getPendingUpload() ?? null;
  const label = document.querySelector<HTMLElement>(".source-upload-progress strong");
  const percent = document.querySelector<HTMLElement>(".source-upload-progress > div > span");
  const bar = document.querySelector<HTMLElement>(".source-upload-progress .upload-progress-track span");
  if (label) label.textContent = progress.message;
  if (percent) percent.textContent = `${progress.percent}%`;
  if (bar) bar.style.width = `${progress.percent}%`;
}

async function cancelPendingSourceUpload(): Promise<void> {
  if (!googleDriveService) return;
  if (!window.confirm("سيُلغى الرفع غير المكتمل فقط، ولن يُحذف أي مصدر مكتمل. هل تريد المتابعة؟")) return;
  try {
    await googleDriveService.cancelPendingUpload();
    state.pendingSourceUpload = null;
    state.sourceUploadMessage = "";
    state.sourceUploadProgress = 0;
    state.sourceFile = null;
    state.sourceFormOpen = false;
    render();
    showToast("تم إلغاء جلسة الرفع غير المكتملة.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "تعذر إلغاء جلسة الرفع. أعد المحاولة.");
  }
}

async function extractAndIndexSource(sourceId: string): Promise<void> {
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source || source.mode !== "file" || !source.driveFileId) {
    showToast("هذا المصدر لا يحتوي ملف PDF مرفوعًا قابلًا للاستخراج.");
    return;
  }
  if (!googleDriveService || !centralSourceStore || state.driveStatus !== "متصل" || state.sourceStorageStatus !== "متصل") {
    showToast("سجّل الدخول وتأكد من اتصال Google Drive قبل الفهرسة.");
    return;
  }
  if (state.sourceIndexingId) {
    showToast("انتظر اكتمال فهرسة المصدر الحالي أولًا.");
    return;
  }

  const useOcr = source.extractionStatus === "يحتاج OCR"
    || source.extractionStatus === "فشل"
    || Boolean(source.extractionVersion?.startsWith("google-cloud-vision"));
  const pendingOcr = source.extractionVersion?.startsWith("google-cloud-vision-ocr-pending") === true;

  state.sourceIndexingId = sourceId;
  state.sourceIndexingProgress = 1;
  state.sourceIndexingMessage = useOcr ? "جارٍ تجهيز OCR العربي…" : "جارٍ تجهيز رابط PDF الآمن…";
  state.sources = state.sources.map((item) => item.id === sourceId
    ? { ...item, extractionStatus: "جارٍ الاستخراج", extractionMessage: state.sourceIndexingMessage }
    : item);
  render();

  try {
    const access = await googleDriveService.getPdfSourceAccess(sourceId);
    let result: SourceExtractionResult;
    if (useOcr) {
      if (!pendingOcr && (source.extractionStatus === "مكتمل" || source.extractionStatus === "فشل")) {
        await centralSourceStore.clearOcrPages(sourceId);
      }
      await centralSourceStore.updateExtractionState(
        sourceId,
        "جارٍ الاستخراج",
        "جارٍ تشغيل OCR العربي عبر Google Cloud Vision مع حفظ كل صفحة للاستكمال بعد الانقطاع.",
        "google-cloud-vision-ocr-pending-1",
      );
      const existingPages = await centralSourceStore.listOcrPages(sourceId);
      result = await extractPdfWithArabicOcr(
        sourceId,
        access,
        existingPages,
        ({ sourceId: requestSourceId, pageNumber, totalPages, image }) => googleDriveService.ocrSourcePage(
          requestSourceId,
          pageNumber,
          totalPages,
          image,
        ),
        (progress) => updateSourceIndexingProgress(progress),
      );
    } else {
      await centralSourceStore.updateExtractionState(sourceId, "جارٍ الاستخراج", "جارٍ قراءة صفحات PDF واستخراج النص القابل للتحديد.");
      result = await extractPdfText(access, updateSourceIndexingProgress);
    }

    state.sourceIndexingProgress = 96;
    state.sourceIndexingMessage = result.requiresOcr
      ? result.method === "google-vision-ocr"
        ? "اكتمل OCR، لكن النص الناتج لم يجتز بوابة الجودة العربية."
        : result.quality.message
      : `جارٍ حفظ ${result.chunks.length} مقطعًا في سجل الفهرسة…`;
    render();
    const saved = await centralSourceStore.saveSourceExtraction(sourceId, result);
    const remoteSources = await centralSourceStore.listSources();
    state.sources = remoteSources;
    saveSources(remoteSources);
    state.sourceIndexingProgress = 100;
    state.sourceIndexingMessage = saved.requiresOcr
      ? result.method === "google-vision-ocr"
        ? "لم يجتز نص OCR بوابة الجودة؛ راجع جودة الملف أو أعد المسح بدقة أعلى."
        : result.quality.message
      : `${result.method === "google-vision-ocr" ? "اكتمل OCR والفهرسة" : "اكتملت الفهرسة"}: ${saved.pageCount} صفحة و${saved.chunkCount} مقطع.`;
    render();
    showToast(state.sourceIndexingMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر استخراج نص PDF.";
    await centralSourceStore.updateExtractionState(sourceId, "فشل", message).catch(() => undefined);
    const remoteSources = await centralSourceStore.listSources().catch(() => null);
    if (remoteSources) { state.sources = remoteSources; saveSources(remoteSources); }
    state.sourceIndexingMessage = message;
    render();
    showToast(message);
  } finally {
    window.setTimeout(() => {
      if (state.sourceIndexingId === sourceId) {
        state.sourceIndexingId = "";
        state.sourceIndexingProgress = 0;
        state.sourceIndexingMessage = "";
        render();
      }
    }, 900);
  }
}

function updateSourceIndexingProgress(progress: PdfExtractionProgress): void {
  state.sourceIndexingProgress = progress.percent;
  state.sourceIndexingMessage = progress.message;
  const message = document.querySelector<HTMLElement>(".source-indexing-card p");
  const value = document.querySelector<HTMLElement>(".source-indexing-card > strong");
  const bar = document.querySelector<HTMLElement>(".source-indexing-card .upload-progress-track span");
  if (message) message.textContent = progress.message;
  if (value) value.textContent = `${progress.percent}%`;
  if (bar) bar.style.width = `${progress.percent}%`;
}

















function exportSourceRegistry(): void {
  const backup = createRegistryBackup(state.sources);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `wathiq-source-registry-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("تم تصدير نسخة احتياطية من سجل المصادر.");
}

async function importSourceRegistry(file: File): Promise<void> {
  const parsed = parseRegistryBackup(await file.text());
  if (!parsed.valid) {
    showToast(parsed.issues[0] ?? "تعذر استيراد سجل المصادر.");
    return;
  }
  const merged = mergeSourceRegistry(state.sources, parsed.sources);
  state.sources = merged.sources;
  saveSources(state.sources);
  render();
  const message = `تمت إضافة ${merged.addedCount} وتجاوز ${merged.skippedCount} مصدر مكرر.`;
  if (state.sourceStorageStatus === "متصل" && merged.addedCount > 0) {
    void persistSourcesCentrally(state.sources, message);
  } else {
    showToast(message);
  }
}

async function archiveSource(sourceId: string): Promise<void> {
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source) return;
  if (source.mode === "file" && source.driveFileId && googleDriveService && state.driveStatus === "متصل") {
    try {
      const updated = await googleDriveService.archiveSourceFile(sourceId);
      state.sources = state.sources.map((item) => item.id === sourceId ? updated : item);
      saveSources(state.sources);
      render();
      showToast("تم نقل الملف إلى أرشيف واثق دون حذفه.");
      return;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "تعذر أرشفة ملف Drive.");
      return;
    }
  }
  updateSourceStatus(sourceId, "مؤرشف", "تمت أرشفة المصدر دون حذفه.");
}

async function restoreSource(sourceId: string): Promise<void> {
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source) return;
  if (source.mode === "file" && source.driveFileId && googleDriveService && state.driveStatus === "متصل") {
    try {
      const updated = await googleDriveService.restoreSourceFile(sourceId);
      state.sources = state.sources.map((item) => item.id === sourceId ? updated : item);
      saveSources(state.sources);
      render();
      showToast("تمت استعادة الملف إلى مجلده الأصلي.");
      return;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "تعذر استعادة ملف Drive.");
      return;
    }
  }
  updateSourceStatus(sourceId, "جاهز للفهرسة", "تمت استعادة المصدر إلى المكتبة.");
}

function updateSourceStatus(sourceId: string, status: SourceStatus, message: string): void {
  state.sources = changeSourceStatus(state.sources, sourceId, status);
  saveSources(state.sources);
  const updated = state.sources.find((source) => source.id === sourceId);
  render();
  if (state.sourceStorageStatus === "متصل" && centralSourceStore && updated) {
    void centralSourceStore.updateStatus(sourceId, status, updated.updatedAt)
      .then(() => showToast(message))
      .catch((error: unknown) => markCentralStorageError(error));
  } else {
    showToast(message);
  }
}

async function signInOwner(): Promise<void> {
  if (!centralSourceStore) return;
  const email = document.querySelector<HTMLInputElement>("#owner-email")?.value.trim() ?? "";
  const password = document.querySelector<HTMLInputElement>("#owner-password")?.value ?? "";
  if (!email || !password) {
    showToast("أدخل البريد الإلكتروني وكلمة المرور.");
    return;
  }
  state.sourceStorageBusy = true;
  render();
  try {
    const session = await centralSourceStore.signIn(email, password);
    state.ownerEmail = session.email;
    await loadAndSyncCentralSources();
  } catch (error) {
    state.sourceStorageStatus = "يتطلب تسجيل الدخول";
    state.sourceStorageMessage = error instanceof Error ? error.message : "تعذر تسجيل الدخول.";
    state.sourceStorageBusy = false;
    render();
    showToast(state.sourceStorageMessage);
  }
}

async function signOutOwner(): Promise<void> {
  if (!centralSourceStore) return;
  state.sourceStorageBusy = true;
  render();
  await centralSourceStore.signOut();
  state.sourceStorageStatus = "يتطلب تسجيل الدخول";
  state.sourceStorageMessage = "تم تسجيل الخروج. تبقى النسخة المحلية متاحة على هذا الجهاز.";
  state.sourceStorageBusy = false;
  state.ownerEmail = "";
  resetGoogleDriveState("يتطلب تسجيل الدخول", "سجّل دخول مالك المنصة أولًا، ثم اربط Google Drive مرة واحدة.");
  render();
}

async function loadAndSyncCentralSources(): Promise<void> {
  if (!centralSourceStore?.currentSession) {
    state.sourceStorageStatus = "يتطلب تسجيل الدخول";
    state.sourceStorageBusy = false;
    render();
    return;
  }
  state.sourceStorageBusy = true;
  state.sourceStorageMessage = "جارٍ مزامنة سجل المصادر…";
  render();
  try {
    const localSources = loadSources() ?? [];
    if (localSources.length) await centralSourceStore.upsertSources(localSources);
    let remoteSources = await centralSourceStore.listSources();
    remoteSources = await repairLegacyLowQualityExtractions(remoteSources);
    state.sources = remoteSources;
    saveSources(remoteSources);
    state.sourceStorageStatus = "متصل";
    state.sourceStorageMessage = "تمت مزامنة سجل المصادر المركزي.";
    state.sourceStorageBusy = false;
    state.ownerEmail = centralSourceStore.currentSession?.email ?? state.ownerEmail;
    render();
    showToast("تمت مزامنة سجل المصادر المركزي.");
    void loadGoogleDriveStatus();
  } catch (error) {
    markCentralStorageError(error);
  }
}

async function repairLegacyLowQualityExtractions(sources: ManagedSource[]): Promise<ManagedSource[]> {
  if (!centralSourceStore) return sources;
  const candidates = sources.filter((source) => (
    source.mode === "file"
    && source.extractionStatus === "مكتمل"
    && Boolean(source.extractionPreview)
    && !source.extractionVersion?.includes("arabic-quality-gate-1")
    && shouldInvalidateLegacyExtraction(source.extractionPreview ?? "")
  ));
  if (!candidates.length) return sources;

  const message = "اكتشف واثق أن النص المستخرج سابقًا مشوه وغير صالح للفهرسة؛ حُذفت المقاطع القديمة وحُوّل الملف إلى مسار OCR.";
  for (const source of candidates) {
    await centralSourceStore.invalidateLegacyExtraction(source.id, message);
  }
  return centralSourceStore.listSources();
}

async function persistSourcesCentrally(sources: ManagedSource[], successMessage: string): Promise<void> {
  if (!centralSourceStore?.currentSession) return;
  state.sourceStorageBusy = true;
  render();
  try {
    await centralSourceStore.upsertSources(sources);
    const remoteSources = await centralSourceStore.listSources();
    state.sources = remoteSources;
    saveSources(remoteSources);
    state.sourceStorageStatus = "متصل";
    state.sourceStorageBusy = false;
    render();
    showToast(successMessage);
  } catch (error) {
    markCentralStorageError(error);
  }
}

function resetGoogleDriveState(
  status: AppState["driveStatus"],
  message: string,
): void {
  state.driveStatus = status;
  state.driveMessage = message;
  state.driveBusy = false;
  state.driveRootFolderUrl = "";
  state.driveFoldersReady = false;
  state.driveFolders = [];
}

function applyGoogleDriveStatus(status: GoogleDriveStatus): void {
  if (!status.connected) {
    resetGoogleDriveState("غير متصل", "اربط حساب Google Drive الخاص بمالك المنصة لإنشاء مجلدات واثق الأساسية.");
    return;
  }
  state.driveStatus = "متصل";
  state.driveMessage = status.foldersReady ? "الاتصال والمجلدات الأساسية جاهزة." : "الاتصال قائم، ويلزم التحقق من المجلدات.";
  state.driveBusy = false;
  state.driveRootFolderUrl = status.rootFolderUrl;
  state.driveFoldersReady = status.foldersReady;
  state.driveFolders = status.folders;
}

async function connectGoogleDrive(): Promise<void> {
  if (!googleDriveService || state.sourceStorageStatus !== "متصل") return;
  state.driveBusy = true;
  state.driveMessage = "جارٍ تجهيز صفحة موافقة Google…";
  render();
  try {
    const authUrl = await googleDriveService.beginConnection();
    window.location.assign(authUrl);
  } catch (error) {
    state.driveStatus = "خطأ";
    state.driveMessage = error instanceof Error ? error.message : "تعذر بدء ربط Google Drive.";
    state.driveBusy = false;
    render();
    showToast(state.driveMessage);
  }
}

async function loadGoogleDriveStatus(): Promise<void> {
  if (!googleDriveService) return;
  if (!centralSourceStore?.currentSession || state.sourceStorageStatus !== "متصل") {
    resetGoogleDriveState("يتطلب تسجيل الدخول", "سجّل دخول مالك المنصة أولًا، ثم اربط Google Drive مرة واحدة.");
    render();
    return;
  }
  state.driveBusy = true;
  render();
  try {
    applyGoogleDriveStatus(await googleDriveService.getStatus());
    render();
  } catch (error) {
    state.driveStatus = "خطأ";
    state.driveMessage = error instanceof Error ? error.message : "تعذر قراءة حالة Google Drive.";
    state.driveBusy = false;
    render();
  }
}

async function verifyGoogleDriveFolders(): Promise<void> {
  if (!googleDriveService || state.driveStatus !== "متصل") return;
  state.driveBusy = true;
  render();
  try {
    applyGoogleDriveStatus(await googleDriveService.verifyFolders());
    render();
    showToast("تم التحقق من مجلدات واثق دون إنشاء نسخ مكررة.");
  } catch (error) {
    state.driveStatus = "خطأ";
    state.driveMessage = error instanceof Error ? error.message : "تعذر التحقق من مجلدات Google Drive.";
    state.driveBusy = false;
    render();
    showToast(state.driveMessage);
  }
}

async function disconnectGoogleDrive(): Promise<void> {
  if (!googleDriveService) return;
  if (!window.confirm("سيُفصل اتصال Google Drive فقط، ولن تُحذف المجلدات أو الملفات. هل تريد المتابعة؟")) return;
  state.driveBusy = true;
  render();
  try {
    await googleDriveService.disconnect();
    resetGoogleDriveState("غير متصل", "تم فصل الاتصال. بقيت مجلدات واثق وملفاتها في Google Drive دون حذف.");
    render();
    showToast("تم فصل Google Drive دون حذف أي ملف.");
  } catch (error) {
    state.driveStatus = "خطأ";
    state.driveMessage = error instanceof Error ? error.message : "تعذر فصل Google Drive.";
    state.driveBusy = false;
    render();
    showToast(state.driveMessage);
  }
}

function consumeGoogleDriveCallback(): { state: "connected" | "error"; message: string } | null {
  const url = new URL(window.location.href);
  const result = url.searchParams.get("drive");
  if (result !== "connected" && result !== "error") return null;
  const message = url.searchParams.get("message") ?? "";
  url.searchParams.delete("drive");
  url.searchParams.delete("message");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  return { state: result, message };
}

function markCentralStorageError(error: unknown): void {
  state.sourceStorageStatus = "خطأ";
  state.sourceStorageMessage = error instanceof Error ? error.message : "تعذر الاتصال بالتخزين المركزي.";
  state.sourceStorageBusy = false;
  render();
  showToast("تعذر الحفظ المركزي؛ احتُفظ بالنسخة المحلية.");
}

async function bootstrapCentralStorage(): Promise<void> {
  const driveCallback = consumeGoogleDriveCallback();
  if (driveCallback) {
    state.view = "admin";
    syncActiveView("admin", true);
  }
  if (!centralSourceStore) {
    render();
    return;
  }
  const session = centralSourceStore.restoreSession();
  if (!session) {
    state.sourceStorageStatus = "يتطلب تسجيل الدخول";
    render();
    return;
  }
  state.ownerEmail = session.email;
  await loadAndSyncCentralSources();
  if (driveCallback?.state === "error") {
    state.driveStatus = "خطأ";
    state.driveMessage = driveCallback.message || "لم يكتمل ربط Google Drive.";
    state.driveBusy = false;
    render();
    showToast(state.driveMessage);
    return;
  }
  if (driveCallback?.state === "connected") {
    await loadGoogleDriveStatus();
    showToast("تم ربط Google Drive وإنشاء مجلدات واثق الأساسية.");
  }
}

function renderTopSaveState(): void {
  const labels = [document.querySelector("#save-label"), document.querySelector("#save-label-secondary")];
  labels.forEach((label) => {
    if (label) label.textContent = state.saveState;
  });
}

syncActiveView(state.view, true);
render();
void bootstrapCentralStorage();
