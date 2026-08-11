import { SUBJECTS } from "./data.js";
import {
  applyAssessmentPreset,
  approveExamDraft,
  buildPlan,
  createEmptyDraft,
  MAX_LESSON_TOPICS,
  MIN_LESSON_TOPICS,
  normalizeLessonTopics,
  reopenExamDraft,
  isPlanComplete,
  selectedProposal,
  setCambridgeProgramme,
  setCambridgeSubject,
  setExamTitle,
  syncDraftTopicFromLessons,
  validateExamSetup,
} from "./domain.js";
import { clearDraft, loadDraft, loadDrafts, loadProfile, loadSources, saveDraft, saveProfile, saveSources, setActiveDraftId } from "./storage.js";
import type { ExamDraft, ExamTitleOption, ManagedSource, PlanItem, QuestionCounts, QuestionVisualJobSnapshot, SourceDraft, SourceStatus, SourceExtractionResult, ViewName, WizardStep } from "./types.js";
import { escapeHtml, formatArabicDate, icon } from "./ui.js";
import { questionVisualAssetRequirement, questionVisualTypeLabel, renderQuestionVisualSvg, stripQuestionVisualIllustration, validateQuestionVisualSpec } from "./question-visual.js";
import { buildStandaloneExamDocument, downloadWordHtml, interleaveAssessmentItems, printHtmlDocument, safeExportFileName } from "./exam-export.js";
import { changeSourceStatus, createEmptySourceDraft, createManagedSource, findDuplicateContentSource, findDuplicateSource, SOURCE_KINDS, validateSourceDraft } from "./source-domain.js";
import { createRegistryBackup, mergeSourceRegistry, parseRegistryBackup } from "./source-registry.js";
import { CentralSourceStore } from "./central-source-store.js";
import { getRuntimeConfig, isCentralStorageConfigured } from "./runtime-config.js";
import { extractPdfText, shouldInvalidateLegacyExtraction, type PdfExtractionProgress } from "./pdf-indexer.js";
import { extractPdfWithArabicOcr } from "./ocr-indexer.js";
import { resolveInitialView, viewFromHash, viewHash } from "./navigation.js";
import { rankSourceChunks, SOURCE_RETRIEVAL_VERSION, type SourceChunkCandidate } from "./source-retrieval.js";
import { buildLessonCatalog, type LessonCatalogOption } from "./lesson-catalog.js";
import { AssessmentGenerationJobService } from "./assessment-generation-jobs.js";
import { AssessmentGenerationWorkerService } from "./assessment-generation-worker.js";
import { ProgressiveAssessmentGenerationOrchestrator } from "./assessment-generation-orchestrator.js";
import {
  ASSESSMENT_PROGRESSIVE_GENERATION_VERSION,
  buildProgressiveGenerationPayload,
  type ProgressiveGenerationPayload,
} from "./assessment-generation-progressive.js";
import {
  reviewCompletedAssessment,
  type AssessmentGenerationItemSnapshot,
  type AssessmentGenerationRunSnapshot,
  type AssessmentItemContract,
} from "./assessment-engine/index.js";
import { VisualJobService, isVisualJobPending, requiredVisualJobItems } from "./visual-jobs.js";
import { EXAM_TITLE_OPTIONS } from "./cambridge-assessment.js";
import {
  CAMBRIDGE_PROGRAMMES,
  curriculumDisplayName,
  stageLabel,
  stagesForProgramme,
  subjectsForProgramme,
} from "./cambridge-curriculum.js";

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
  sourceFile: File | null;
  sourceUploadBusy: boolean;
  sourceUploadProgress: number;
  sourceUploadMessage: string;
  sourceIndexingId: string;
  sourceIndexingProgress: number;
  sourceIndexingMessage: string;
  sourceRetrievalBusy: boolean;
  sourceRetrievalMessage: string;
  questionGenerationBusy: boolean;
  questionGenerationMessage: string;
  assessmentGenerationRun: AssessmentGenerationRunSnapshot | null;
  visualJobSyncBusy: boolean;
}


const runtimeConfig = getRuntimeConfig();
const centralSourceStore = isCentralStorageConfigured(runtimeConfig)
  ? new CentralSourceStore(runtimeConfig)
  : null;
const assessmentGenerationJobService = centralSourceStore
  ? new AssessmentGenerationJobService(runtimeConfig, () => centralSourceStore.getActiveSession())
  : null;
const assessmentGenerationWorkerService = centralSourceStore
  ? new AssessmentGenerationWorkerService(runtimeConfig, () => centralSourceStore.getActiveSession())
  : null;
let assessmentGenerationOrchestrator = assessmentGenerationJobService && assessmentGenerationWorkerService
  ? new ProgressiveAssessmentGenerationOrchestrator(assessmentGenerationJobService, assessmentGenerationWorkerService, { concurrency: 2 })
  : null;
const visualJobService = centralSourceStore
  ? new VisualJobService(runtimeConfig, () => centralSourceStore.getActiveSession())
  : null;

const savedDraft = loadDraft();
const savedProfile = loadProfile();
const initialDraft = savedDraft ?? createEmptyDraft();
if (savedProfile) {
  initialDraft.school = savedProfile.school;
}

const initialView = resolveInitialView(window.location.hash, window.sessionStorage.getItem(ACTIVE_VIEW_STORAGE_KEY));

const state: AppState = {
  view: initialView,
  draft: initialDraft,
  saveState: savedDraft ? "محفوظ" : "غير محفوظ",
  libraryFilter: "الكل",
  toast: "",
  sources: loadSources() ?? [],
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
  sourceFile: null,
  sourceUploadBusy: false,
  sourceUploadProgress: 0,
  sourceUploadMessage: "",
  sourceIndexingId: "",
  sourceIndexingProgress: 0,
  sourceIndexingMessage: "",
  sourceRetrievalBusy: false,
  sourceRetrievalMessage: "",
  questionGenerationBusy: false,
  questionGenerationMessage: "",
  assessmentGenerationRun: null,
  visualJobSyncBusy: false,
};

if (savedDraft) restoreDraftRuntimeContext(savedDraft);

let saveTimer: number | undefined;
let visualJobPollTimer: number | undefined;
let visualJobAutoEnqueueTimer: number | undefined;
let lastAutoVisualEnqueueSignature = "";
const VISUAL_JOB_POLL_INTERVAL_MS = 3_500;
const VISUAL_JOB_AUTO_ENQUEUE_DELAY_MS = 250;

function persistDraftCheckpoint(showFailure = true): boolean {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  try {
    state.draft.updatedAt = new Date().toISOString();
    saveDraft(state.draft);
    saveProfile({ school: state.draft.school });
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
  const activeRunId = state.draft.generationRunId;
  assessmentGenerationOrchestrator?.stop();
  if (activeRunId && assessmentGenerationJobService) {
    void assessmentGenerationJobService.cancelRun(activeRunId).catch(() => undefined);
  }
  state.assessmentGenerationRun = null;
  state.draft.plan = [];
  state.draft.selectedProposalByPlanItem = {};
  state.draft.visualJobs = {};
  stopVisualJobPolling();
  state.draft.generationRunId = "";
  state.draft.generationEpoch = Math.max(1, state.draft.generationEpoch + 1);
  state.draft.generationMode = "progressive_items_v1";
  state.draft.generationVersion = "";
  state.draft.generationModel = "";
  state.draft.generatedAt = "";
  state.draft.approvedAt = "";
  state.draft.status = "مسودة";
  state.questionGenerationBusy = false;
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
        <span><strong>واثق</strong><small>اختبارات علوم Cambridge ببساطة</small></span>
      </button>
      <nav class="desktop-nav" aria-label="التنقل الرئيسي">
        ${navButton("home", "الرئيسية", "home")}
        ${navButton("wizard", "اختبار جديد", "plus")}
        ${navButton("library", "اختباراتي", "files")}
        ${navButton("admin", "مصادر اختيارية", "admin")}
      </nav>
      <div class="header-actions"><button class="ghost-btn compact" data-action="save-now">${icon("save")}<span id="save-label">${state.saveState}</span></button></div>
    </header>
  `;
}

function navButton(view: ViewName, label: string, iconName: Parameters<typeof icon>[0]): string {
  const active = state.view === view;
  return `<button class="nav-button ${active ? "active" : ""}" data-nav="${view}" ${active ? 'aria-current="page"' : ""}>${icon(iconName)}<span>${label}</span></button>`;
}

function renderMobileNav(): string {
  return `<nav class="mobile-nav" aria-label="التنقل للجوال">
    ${navButton("home", "الرئيسية", "home")}
    ${navButton("wizard", "جديد", "plus")}
    ${navButton("library", "اختباراتي", "files")}
    ${navButton("admin", "المصادر", "admin")}
  </nav>`;
}

function renderView(): string {
  if (state.view === "home") return renderHome();
  if (state.view === "wizard") return renderWizard();
  if (state.view === "library") return renderLibrary();
  return renderAdmin();
}

function renderHome(): string {
  const hasDraft = Boolean(loadDraft());
  return `
    <section class="hero-panel">
      <div class="hero-copy">
        <span class="eyebrow">Cambridge Primary · Lower Secondary · IGCSE</span>
        <h1>اسم الموضوع يكفي.</h1>
        <p>اختر برنامج Cambridge والمرحلة ومادة العلوم والموضوع. واثق يؤلف بحرية، ثم يراجع العلم والقياس بصرامة. رفع الكتب أو الأدلة اختياري للتخصيص فقط.</p>
        <div class="hero-actions">
          <button class="primary-btn" data-action="new-exam">${icon("plus")} إنشاء اختبار</button>
          ${hasDraft ? `<button class="secondary-btn" data-action="resume-draft">متابعة المسودة ${icon("arrow")}</button>` : ""}
        </div>
      </div>
      <div class="confidence-card"><div class="confidence-score">واثق</div><ul>
        <li>${icon("check")} Primary Science 0097 · Stages 1-6</li>
        <li>${icon("check")} Lower Secondary Science 0893 · Stages 7-9</li>
        <li>${icon("check")} IGCSE Physics / Chemistry / Biology / Sciences</li>
        <li>${icon("check")} مؤلف AI حر + مراجع علمي مستقل</li>
      </ul></div>
    </section>
    <section class="dashboard-grid">
      <article class="action-card featured"><span class="card-icon">${icon("plus")}</span><div><h2>اختبار جديد</h2><p>برنامج، مرحلة، مادة، موضوع. هذا كل ما يحتاجه المسار الأساسي.</p></div><button class="card-link" data-action="new-exam">ابدأ الآن ${icon("arrow")}</button></article>
      <article class="action-card"><span class="card-icon">${icon("files")}</span><div><h2>اختباراتي</h2><p>المسودات والاختبارات المعتمدة في مكان واحد.</p></div><button class="card-link" data-nav="library">فتح المكتبة ${icon("arrow")}</button></article>
      <article class="action-card"><span class="card-icon">${icon("admin")}</span><div><h2>مصادر اختيارية</h2><p>أضف PDF فقط عندما تريد تخصيص الاختبار بكتاب أو دليل محدد. التوليد لا يتوقف عليها.</p></div><button class="card-link" data-nav="admin">إدارة المصادر ${icon("arrow")}</button></article>
    </section>
  `;
}

function renderWizard(): string {
  const resumeLabel = state.draft.currentStep > 1 || state.draft.plan.length || state.draft.sourceReferences.length
    ? "متابعة المسودة المحفوظة"
    : "إنشاء اختبار جديد";
  return `
    <section class="page-heading">
      <div><span class="eyebrow">${resumeLabel}</span><h1>${wizardTitle(state.draft.currentStep)}</h1></div>
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


function splitLessonLabel(label: string): { code: string; title: string } {
  const normalized = label.trim();
  const match = /^([0-9٠-٩۰-۹]{1,2}\s*[-.]\s*[0-9٠-٩۰-۹]{1,2})\s*[:：\-]?\s*(.+)$/u.exec(normalized);
  if (!match) return { code: "درس", title: normalized || "درس" };
  return { code: match[1]!.replace(/\s+/g, "").replace(".", "-"), title: match[2]!.trim() };
}

function restoreDraftRuntimeContext(draft: ExamDraft): void {
  assessmentGenerationOrchestrator?.stop();
  state.assessmentGenerationRun = null;
  state.questionGenerationBusy = false;
  state.questionGenerationMessage = draft.generationRunId && !isPlanComplete(draft)
    ? "سيستعيد واثق دورة التوليد من Supabase بعد تسجيل الدخول."
    : "";
  state.sourceRetrievalMessage = draft.sourceReferences.length
    ? `تمت استعادة ${draft.sourceReferences.length} مقاطع مرجعية محفوظة مع المسودة.`
    : "لا توجد مقاطع مرجعية محفوظة في هذه المسودة.";
}

function parseLessonInput(value: string): string[] {
  const seen = new Set<string>();
  const lessons: string[] = [];
  for (const raw of value.split(/[\n،;,]+/u)) {
    const lesson = raw.replace(/\s+/g, " ").trim();
    if (!lesson) continue;
    const key = lesson.normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase("ar");
    if (seen.has(key)) continue;
    seen.add(key);
    lessons.push(lesson);
    if (lessons.length >= MAX_LESSON_TOPICS) break;
  }
  return lessons;
}

function lessonSuggestions(): LessonCatalogOption[] {
  if (state.draft.grade === null || !state.draft.subjectId) return [];
  return buildLessonCatalog(eligibleSourcesForDraft()).slice(0, 60);
}

function renderLessonSuggestions(): string {
  const suggestions = lessonSuggestions();
  if (!suggestions.length) {
    return `<div class="lesson-catalog-empty">لم أجد عناوين دروس موثوقة تلقائيًا. اكتب اسم الدرس كما يظهر في الكتاب؛ هذا لا يمنع التوليد.</div>`;
  }
  const selected = new Set(normalizeLessonTopics(state.draft.lessonTopics));
  return `<div class="lesson-suggestion-panel"><div><strong>اقتراحات من عناوين PDF</strong><small>اختيارية؛ اضغط لإضافة الدرس ويمكنك الكتابة يدويًا.</small></div><div class="lesson-suggestion-chips">${suggestions.map((lesson) => `<button type="button" class="lesson-suggestion-chip ${selected.has(lesson.label) ? "selected" : ""}" data-lesson-suggestion="${escapeHtml(lesson.label)}" ${selected.has(lesson.label) ? "disabled" : ""}><b>${escapeHtml(lesson.code)}</b> ${escapeHtml(lesson.title)}</button>`).join("")}</div></div>`;
}

function renderContentStep(): string {
  const programme = CAMBRIDGE_PROGRAMMES.find((item) => item.id === state.draft.programmeId) ?? CAMBRIDGE_PROGRAMMES[0]!;
  const stages = stagesForProgramme(state.draft.programmeId);
  const subjects = subjectsForProgramme(state.draft.programmeId);
  const references = state.draft.sourceReferences;
  const eligibleSources = eligibleSourcesForDraft();
  return `
    <div class="section-intro"><h2>حدد نطاق Cambridge</h2><p>لا تحتاج إلى رفع كتاب أو دليل. اختر المسار والمرحلة والمادة، ثم اكتب اسم موضوع أو أكثر كما تعرفه في منهج Cambridge.</p></div>
    <div class="form-grid two-columns">
      <label class="field"><span>برنامج Cambridge</span><select id="programme-select">${CAMBRIDGE_PROGRAMMES.map((item) => `<option value="${item.id}" ${state.draft.programmeId === item.id ? "selected" : ""}>${item.label}</option>`).join("")}</select><small>${programme.note}</small></label>
      ${state.draft.programmeId === "igcse"
        ? `<label class="field readonly-field"><span>المرحلة</span><input value="Cambridge IGCSE" readonly/></label>`
        : `<label class="field"><span>المرحلة</span><select id="stage-select">${stages.map((stage) => `<option value="${stage}" ${state.draft.grade === stage ? "selected" : ""}>Stage ${stage}</option>`).join("")}</select></label>`}
      <label class="field"><span>المادة</span><select id="subject-select"><option value="">اختر المادة</option>${subjects.map((item) => `<option value="${item.id}" ${state.draft.subjectId === item.id ? "selected" : ""}>${item.label} · ${item.syllabusCode}</option>`).join("")}</select></label>
      <label class="field readonly-field"><span>المسار الحالي</span><input value="${escapeHtml(state.draft.subjectId ? curriculumDisplayName(state.draft.programmeId, state.draft.subjectId, state.draft.grade) : programme.label)}" readonly/></label>
      <section class="field full lesson-catalog-field" aria-labelledby="lesson-topics-label">
        <div class="lesson-topics-head"><div><span id="lesson-topics-label">الموضوعات / الدروس</span><small>موضوع واحد يكفي، وحتى ${MAX_LESSON_TOPICS} موضوعات</small></div><b>${normalizeLessonTopics(state.draft.lessonTopics).length}/${MAX_LESSON_TOPICS}</b></div>
        <textarea id="lesson-topics-input" rows="4" placeholder="مثال: Static electricity
أو: الاحتكاك والشحن الكهربائي">${escapeHtml(normalizeLessonTopics(state.draft.lessonTopics).join("\n"))}</textarea>
        ${renderLessonSuggestions()}
      </section>
    </div>
    <section class="source-match-card ${references.length ? "ready" : ""}">
      <div><span class="source-match-label">تعزيز اختياري بالمصادر</span><h3>${eligibleSources.length ? `${eligibleSources.length} مصدر مفهرس متاح` : "لا تحتاج إلى مصدر مرفوع"}</h3><p>${escapeHtml(state.sourceRetrievalMessage || (references.length ? `استخدم واثق ${references.length} مقطعًا اختياريًا لتخصيص السياق.` : "سيستخدم واثق معرفة Cambridge العالمية. يمكنك إضافة PDF لاحقًا إذا أردت تخصيصًا بكتاب معين."))}</p></div>
      ${eligibleSources.length ? `<button class="secondary-btn compact" data-action="match-optional-sources" ${state.sourceRetrievalBusy ? "disabled" : ""}>${state.sourceRetrievalBusy ? "جارٍ المطابقة…" : "استخدام المصادر المتاحة"}</button>` : ""}
      ${references.length ? `<div class="source-reference-list">${references.map(renderSourceReference).join("")}</div>` : ""}
    </section>
    ${renderWizardFooter(1, true)}
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
  return `
    <div class="section-intro"><h2>إعداد بسيط</h2><p>قوالب واثق أدناه نقطة بداية عملية وليست ادعاءً بأنها مواصفة ورقة Cambridge رسمية. يمكنك تعديل الزمن والدرجة وأنواع الأسئلة.</p></div>
    ${renderSourceContextSummary()}
    <div class="form-grid two-columns">
      ${examTitleSelect()}
      ${inputField("date-input", "تاريخ الاختبار", state.draft.examDate, "date")}
      ${inputField("school-input", "المدرسة (اختياري)", state.draft.school, "text")}
      ${inputField("academic-year-input", "العام الدراسي", state.draft.academicYear, "text")}
      ${inputField("duration-input", "الزمن بالدقائق", state.draft.durationMinutes, "number", "", "5")}
      ${inputField("marks-input", "الدرجة الكلية", state.draft.totalMarks, "number", "", "5")}
    </div>
    <div class="compact-section"><h3>مستوى التحدي</h3><div class="segmented">${["سهل", "متوسط", "متقدم"].map((level) => `<button data-difficulty="${level}" class="${state.draft.difficulty === level ? "active" : ""}">${level}</button>`).join("")}</div></div>
    <div class="compact-section"><div class="selection-header"><div><h3>أنواع الأسئلة</h3><p>المؤلف حر في صياغة السياق والبنية داخل النوع والدرجة المطلوبة.</p></div><span class="marks-summary">المجموع: <b>${validation.computedMarks}</b></span></div><div class="count-grid">
      ${countField("mcq", "اختيار من متعدد", state.draft.counts.mcq, "أربعة بدائل ومشتتات علمية معقولة")}
      ${countField("short", "إجابة قصيرة", state.draft.counts.short, "تفسير أو حساب أو قراءة بيانات")}
      ${countField("long", "إجابة طويلة", state.draft.counts.long, "استدلال أو تفسير ممتد أو استقصاء")}
    </div></div>
    <section class="generation-mode-panel progressive-engine-panel"><div class="generation-mode-heading"><div><span class="eyebrow">محرك الجودة</span><h3>تأليف حر + مراجعة علمية مستقلة</h3></div><span class="generation-mode-badge">Cambridge-first</span></div><div class="progressive-engine-summary">
      <div><strong>المؤلف يكتب بحرية</strong><small>لا قوالب خفية تفرض شكل السؤال؛ يختار المؤلف أفضل صياغة ثم يراجعها علميًا.</small></div>
      <div><strong>المراجع يحكم على العلم</strong><small>يفحص الدقة والملاءمة للمرحلة ونموذج التصحيح، ويعيد الكتابة عند الحاجة.</small></div>
      <div><strong>المصادر اختيارية</strong><small>الملف المرفوع يعزز السياق، لكنه لا يقرر إن كان واثق قادرًا على البدء.</small></div>
    </div></section>
    <div class="trusted-enrichment-card visual-enhancement-card enabled durable-visual-policy"><span class="trusted-enrichment-check">${icon("check")}</span><span><strong>مرئيات 2D علمية فقط عند الحاجة</strong><small>لا line-art احتياطي. البيانات الرقمية الدقيقة تبقى حتمية، والمرئي التوضيحي يمر بمراجعة علمية قبل الاعتماد.</small></span></div>
    ${renderCompliance(validation)}
    ${state.questionGenerationMessage ? `<div class="generation-status ${state.questionGenerationBusy ? "busy" : "notice"}">${state.questionGenerationBusy ? icon("spark") : "!"}<div><strong>حالة التوليد</strong><p>${escapeHtml(state.questionGenerationMessage)}</p></div></div>` : ""}
    ${renderWizardFooter(2, validation.valid)}
  `;
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
  if (validation.valid) return `<div class="compliance success">${icon("check")}<div><strong>جاهز للتوليد</strong><p>${escapeHtml(curriculumDisplayName(state.draft.programmeId, state.draft.subjectId, state.draft.grade))} · المصادر المرفوعة اختيارية.</p></div></div>`;
  return `<div class="compliance warning"><div class="warning-mark">!</div><div><strong>اضبط هذه البيانات</strong><ul>${validation.issues.map((issue) => `<li>${escapeHtml(issue.message)}</li>`).join("")}</ul>${validation.suggestedCounts ? `<button class="secondary-btn compact" data-action="apply-suggestion">ضبط الأعداد لتناسب ${state.draft.totalMarks} درجة</button>` : ""}</div></div>`;
}

function generationItemStatusLabel(status: AssessmentGenerationItemSnapshot["status"] | "pending"): string {
  const labels: Record<AssessmentGenerationItemSnapshot["status"] | "pending", string> = {
    pending: "بانتظار إنشاء الدورة",
    queued: "في طابور التوليد",
    grounding: "يبني سياق Cambridge",
    generating: "يكتب السؤال",
    normalizing: "يضبط بنية المفردة",
    validating: "يتحقق علميًا وتقويميًا",
    ready: "مكتملة ومحفوظة",
    retry_pending: "بانتظار إعادة المحاولة",
    failed: "تعذرت",
    cancelled: "ملغاة",
    superseded: "استُبدلت بدورة أحدث",
  };
  return labels[status];
}

function generationItemStatusClass(status: AssessmentGenerationItemSnapshot["status"] | "pending"): string {
  if (status === "ready") return "success";
  if (status === "failed" || status === "cancelled") return "error";
  if (status === "superseded") return "muted";
  if (["grounding", "generating", "normalizing", "validating"].includes(status)) return "active";
  return "queued";
}

function generationItemUserMessage(task: AssessmentGenerationItemSnapshot): string {
  const transient = task.errorCode === "MODEL_RATE_LIMITED" || task.errorCode === "MODEL_UNAVAILABLE" || task.errorCode === "MODEL_TIMEOUT";
  if (!transient) return task.errorMessage;
  if (task.status === "retry_pending") {
    return "خدمة توليد الأسئلة مشغولة مؤقتًا. احتفظ واثق بالمفردات المكتملة وسيعيد محاولة هذه المفردة تلقائيًا.";
  }
  if (task.status === "failed") {
    return "تعذر إكمال هذه المفردة بسبب ضغط مؤقت في خدمة التوليد. المفردات المكتملة محفوظة ويمكن إعادة هذه المفردة وحدها لاحقًا.";
  }
  return task.errorMessage || "خدمة توليد الأسئلة مشغولة مؤقتًا.";
}

function renderProgressiveGenerationPanel(): string {
  const snapshot = state.assessmentGenerationRun;
  const total = snapshot?.totalItems ?? state.draft.plan.length;
  const completed = snapshot?.completedItems ?? state.draft.plan.filter((item) => item.proposals.length > 0).length;
  const failed = snapshot?.failedItems ?? 0;
  const active = snapshot?.items.filter((item) => ["grounding", "generating", "normalizing", "validating"].includes(item.status)).length ?? 0;
  const queued = snapshot?.items.filter((item) => item.status === "queued" || item.status === "retry_pending").length ?? Math.max(0, total - completed);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const canCancel = Boolean(snapshot && !["completed", "cancelled", "superseded"].includes(snapshot.status)
    && snapshot.items.some((item) => ["queued", "retry_pending", "grounding", "generating", "normalizing", "validating"].includes(item.status)));
  const canResume = Boolean(snapshot && ["partial", "failed"].includes(snapshot.status) && !state.questionGenerationBusy);
  const runState = snapshot ? progressiveRunMessage(snapshot) : (state.questionGenerationMessage || "جارٍ إعداد دورة التوليد المستقلة لكل مفردة.");
  return `<section class="generation-progress-panel" aria-live="polite">
    <div class="generation-progress-head"><div><span class="eyebrow">التوليد التدريجي</span><h3>${completed} من ${total} مفردات مكتملة</h3><p>${escapeHtml(runState)}</p></div><strong>${percent}%</strong></div>
    <div class="generation-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
    <div class="generation-progress-metrics"><span><b>${completed}</b> محفوظة</span><span><b>${active}</b> قيد التنفيذ</span><span><b>${queued}</b> في الطابور</span><span class="${failed ? "has-error" : ""}"><b>${failed}</b> متعذرة</span></div>
    ${(canCancel || canResume) ? `<div class="generation-progress-actions">${canResume ? `<button class="secondary-btn compact" data-generation-resume>${icon("spark")} استكمال المفردات المتبقية</button>` : ""}${canCancel ? `<button class="text-btn danger-text" data-generation-cancel>إلغاء الدورة الحالية</button>` : ""}</div>` : ""}
  </section>`;
}

function renderPlanStep(): string {
  const selectedCount = Object.keys(state.draft.selectedProposalByPlanItem).length;
  const generationLabel = state.draft.generationModel
    ? `تم التوليد عبر ${state.draft.generationModel} في ${formatArabicDate(state.draft.generatedAt.slice(0, 10))}.`
    : "تُحفظ كل مفردة فور اكتمالها، ويمكن استكمال البقية بعد تحديث الصفحة.";
  return `
    <div class="section-intro inline"><div><h2>التوليد التدريجي ومراجعة الاختبار</h2><p>${escapeHtml(state.questionGenerationMessage || generationLabel)} راجع كل مفردة مكتملة، بينما يستمر واثق في إنشاء البقية دون إعادة ما حُفظ.</p></div><span class="progress-pill">${selectedCount} من ${state.draft.plan.length}</span></div>
    ${renderProgressiveGenerationPanel()}
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

function visualJobMessage(job: QuestionVisualJobSnapshot | undefined): string {
  if (!job) return "لم تُنشأ مهمة الصورة بعد.";
  if (job.status === "queued") return "الصورة في طابور التنفيذ الدائم.";
  if (job.status === "generating") return `يجري توليد الأصل البصري 2D، المحاولة ${job.attemptCount} من ${job.maxAttempts}.`;
  if (job.status === "validating") return "تم توليد الصورة ويجري الآن فحصها علميًا وبصريًا.";
  if (job.status === "retry_pending") return job.errorMessage || "سيعيد واثق محاولة الصورة تلقائيًا.";
  if (job.status === "ready") return "اكتمل الأصل البصري واعتمد علميًا، وهو المستخدم في المعاينة وWord وPDF.";
  if (job.status === "failed") return job.errorMessage || "فشلت مهمة الصورة بعد استنفاد المحاولات.";
  return "أُلغيت مهمة الصورة.";
}

function renderPlanVisual(item: PlanItem, compact = false): string {
  if (!item.visual || item.visual.type === "none") return "";
  const requirement = questionVisualAssetRequirement(item.visual);
  const job = state.draft.visualJobs[item.id];
  const ready = Boolean(job?.status === "ready" && job.asset?.validated && item.visual.illustration?.validated);
  const pending = Boolean(job && isVisualJobPending(job.status));
  const failed = job?.status === "failed" || job?.status === "cancelled";
  const modeLabel = !requirement.required
    ? "تمثيل علمي منظم دقيق"
    : ready
      ? "صورة تعليمية 2D معتمدة"
      : pending
        ? "مهمة بصرية دائمة قيد التنفيذ"
        : failed
          ? "فشل الأصل البصري المطلوب"
          : "أصل بصري مطلوب قبل الاعتماد";
  const controls = !compact && requirement.required ? `<div class="visual-action-row">
    <button class="secondary-btn compact" data-action="${ready ? "regenerate-visual-job" : failed ? "retry-visual-job" : "sync-visual-job"}" data-plan-id="${escapeHtml(item.id)}" ${(pending || state.draft.status === "معتمد" || state.visualJobSyncBusy) ? "disabled" : ""}>${icon("spark")} ${pending ? "جارٍ التنفيذ…" : ready ? "إعادة توليد الأصل" : failed ? "إعادة المحاولة" : "إنشاء الأصل 2D"}</button>
  </div>` : "";
  const message = !compact && requirement.required
    ? `<p class="visual-enhancement-message ${failed ? "error" : ready ? "success" : ""}" aria-live="polite">${escapeHtml(visualJobMessage(job))}</p>`
    : "";
  return `<section class="plan-shared-visual ${compact ? "compact" : ""}"><div class="visual-heading"><strong>${escapeHtml(questionVisualTypeLabel(item.visual.type))}</strong><span>${escapeHtml(modeLabel)}</span></div>${renderQuestionVisualSvg(item.visual)}${controls}${message}</section>`;
}

function renderGenerationPlaceholder(item: PlanItem): string {
  const task = generationItemSnapshot(item.id);
  const status = task?.status ?? "pending";
  const attempts = task ? `${task.attemptCount} من ${task.maxAttempts}` : "0 من 2";
  const errorMessage = task ? generationItemUserMessage(task) : "";
  const error = errorMessage ? `<p class="generation-item-error">${escapeHtml(errorMessage)}</p>` : "";
  const retry = task?.status === "failed" && state.draft.status !== "معتمد"
    ? `<button class="secondary-btn compact" data-generation-retry="${escapeHtml(task.id)}" ${state.questionGenerationBusy ? "disabled" : ""}>${icon("spark")} إعادة هذه المفردة فقط</button>`
    : "";
  return `<div class="generation-item-placeholder ${generationItemStatusClass(status)}">
    <div class="generation-item-state"><span class="generation-item-pulse" aria-hidden="true"></span><div><strong>${escapeHtml(generationItemStatusLabel(status))}</strong><small>المحاولة ${attempts}</small></div></div>
    ${error}
    ${retry}
  </div>`;
}

function renderPlanItem(item: PlanItem, index: number): string {
  const chosen = state.draft.selectedProposalByPlanItem[item.id];
  const reference = state.draft.sourceReferences.find((entry) => entry.id === item.sourceReferenceId);
  const sourceLabel = reference
    ? `${reference.sourceTitle} · ${reference.pageFrom === reference.pageTo ? `ص ${reference.pageFrom}` : `ص ${reference.pageFrom}-${reference.pageTo}`}`
    : "مرجع غير محدد";
  const task = generationItemSnapshot(item.id);
  const status = task?.status ?? (item.proposals.length ? "ready" : "pending");
  const proposals = item.proposals.length
    ? `<div class="proposal-grid">${item.proposals.map((proposal, proposalIndex) => {
      const selected = chosen === proposal.id || item.proposals.length === 1;
      const legacyChoice = item.proposals.length > 1;
      return `<${legacyChoice ? "label" : "div"} class="proposal-card ${selected ? "selected" : ""} ${legacyChoice ? "" : "progressive-single-proposal"}">${legacyChoice ? `<input type="radio" name="proposal-${item.id}" data-plan-id="${item.id}" value="${proposal.id}" ${selected ? "checked" : ""} ${state.draft.status === "معتمد" ? "disabled" : ""}/>` : ""}<div class="proposal-top"><span>${legacyChoice ? `البديل ${proposalIndex + 1}` : "المفردة المعتمدة من المحرك"}</span><div class="proposal-badges"><b class="generation-item-badge ${generationItemStatusClass(status)}">${escapeHtml(generationItemStatusLabel(status))}</b>${false ? `<b class="review-needed-badge">يحتاج تدقيقًا أدق</b>` : ""}</div></div>${proposal.stimulus ? `<div class="proposal-stimulus">${escapeHtml(proposal.stimulus)}</div>` : ""}<p>${escapeHtml(proposal.text)}</p>${renderProposalOptions(proposal.options)}<details class="proposal-evidence"><summary>الإجابة ونموذج التصحيح ودليل المصدر</summary><p class="proposal-answer"><strong>الإجابة:</strong> ${escapeHtml(proposal.answer)}</p>${renderMarkScheme(proposal.markScheme)}${proposal.rationale ? `<p><strong>سبب الإجابة:</strong> ${escapeHtml(proposal.rationale)}</p>` : ""}${proposal.sourceSupport ? `<blockquote>${escapeHtml(proposal.sourceSupport)}</blockquote>` : ""}</details>${legacyChoice ? `<span class="choose-label">${selected ? `${icon("check")} تم الاختيار` : "اختر هذا السؤال"}</span>` : `<span class="choose-label">${icon("check")} حُفظت خادميًا واختيرت تلقائيًا</span>`}</${legacyChoice ? "label" : "div"}>`;
    }).join("")}</div>`
    : renderGenerationPlaceholder(item);
  const footer = task?.status === "failed"
    ? `<footer><button class="text-btn" data-generation-retry="${escapeHtml(task.id)}" ${state.questionGenerationBusy ? "disabled" : ""}>${icon("spark")} إعادة هذه المفردة فقط</button></footer>`
    : item.proposals.length
      ? `<footer class="generation-item-footer"><span>${icon("check")} محفوظة داخل دورة التوليد الدائمة</span>${task?.stageTimings.totalMs ? `<small>${Math.max(1, Math.round(task.stageTimings.totalMs / 1000))} ثانية</small>` : ""}</footer>`
      : "";
  return `<article class="plan-card generation-plan-card ${generationItemStatusClass(status)}">
    <header><div class="question-number">${index + 1}</div><div><h3>${item.questionType}</h3><p>${escapeHtml(item.lessonLabel)} · ${escapeHtml(sourceLabel)}</p></div><div class="plan-tags"><span>${item.cognitiveLevel}</span><span>${item.marks} ${item.marks === 1 ? "درجة" : "درجات"}</span></div></header>
    ${renderPlanVisual(item)}
    ${proposals}
    ${footer}
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
    return `<article><div class="${headClass}"><strong>${escapeHtml(label)}) ${escapeHtml(proposal.answer)}</strong></div>${renderPlanVisual(item, true)}${renderMarkScheme(proposal.markScheme)}${proposal.rationale ? `<p>${escapeHtml(proposal.rationale)}</p>` : ""}<small>${escapeHtml(reference?.sourceTitle ?? "المصدر")} · ${pages}</small>${proposal.sourceSupport ? `<blockquote>${escapeHtml(proposal.sourceSupport)}</blockquote>` : ""}</article>`;
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
  const groundedGeneration = state.draft.generationVersion === ASSESSMENT_PROGRESSIVE_GENERATION_VERSION;
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
  const requiredVisualItems = visualItems.filter((item) => questionVisualAssetRequirement(item.visual!).required);
  const requiredVisualsReady = requiredVisualItems.every((item) => {
    const requirement = questionVisualAssetRequirement(item.visual!);
    const job = state.draft.visualJobs[item.id];
    const illustration = item.visual?.illustration;
    return job?.status === "ready"
      && job.requiredMode === requirement.mode
      && Boolean(job.asset?.validated)
      && job.asset?.renderMode === requirement.mode
      && Boolean(illustration?.validated)
      && job.asset?.assetPath === illustration?.assetPath;
  });
  const checks = [
    { label: "هوية Cambridge", okay: Boolean(state.draft.programmeId && state.draft.syllabusCode && state.draft.subjectId) },
    { label: "مجموع الدرجات", okay: markTotal === state.draft.totalMarks },
    { label: "اختيار مفردات الخطة", okay: isPlanComplete(state.draft) },
    { label: "توليد Cambridge الحالي", okay: groundedGeneration },
    { label: "نموذج تصحيح لكل درجة", okay: markSchemesComplete },
    { label: `العناصر البصرية العلمية (${visualItems.length})`, okay: visualValidity && visualsUnique },
    { label: `الأصول البصرية المطلوبة (${requiredVisualItems.length})`, okay: requiredVisualsReady },
    { label: "بيانات الاختبار والمواصفة", okay: setupValid },
  ];
  return { ready: checks.every((check) => check.okay), checks };
}

function renderStudentPaper(subject: string, paperLayout: PaperLayout): string {
  const curriculum = curriculumDisplayName(state.draft.programmeId, state.draft.subjectId, state.draft.grade);
  return `<section class="paper-preview">
    <header class="paper-header cambridge-paper-header"><div class="wathiq-paper-mark">واثق</div><div><strong>${escapeHtml(curriculum)}</strong>${state.draft.school ? `<span>${escapeHtml(state.draft.school)}</span>` : ""}<span>اختبار علوم مُنشأ ومراجع داخل واثق</span></div></header>
    <div class="paper-title"><h2>${escapeHtml(state.draft.title)}</h2><p>${subject} · ${stageLabel(state.draft.programmeId, state.draft.grade)} · ${escapeHtml(state.draft.syllabusCode)}</p></div>
    <div class="student-row"><span>اسم الطالب: ____________________</span><span>التاريخ: ${formatArabicDate(state.draft.examDate)}</span><span>الزمن: ${state.draft.durationMinutes} دقيقة</span><span>الدرجة: ${state.draft.totalMarks}</span></div>
    <div class="paper-questions">${paperLayout.html}</div>
    <footer class="paper-footer">انتهت الأسئلة</footer>
  </section>`;
}

async function verifyRequiredVisualAssetsForExport(): Promise<void> {
  const selected = selectedPaperItems();
  const required = state.draft.plan.filter((item) => item.visual && questionVisualAssetRequirement(item.visual).required);
  const urls = required.map((item) => item.visual?.illustration?.url ?? "");
  if (urls.some((url) => !url)) throw new Error("تعذر التصدير لأن أحد الأصول البصرية المطلوبة غير مرتبط بالمفردة.");
  await Promise.all([...new Set(urls)].map(async (url) => {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error(`تعذر الوصول إلى أحد الأصول البصرية (${response.status}).`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size === 0) throw new Error("أحد الأصول البصرية المحفوظة ليس صورة صالحة للتصدير.");
  }));
}

async function executeExamExport(action: string, approved: boolean): Promise<void> {
  try {
    await verifyRequiredVisualAssetsForExport();
    const kind = action.includes("answer") ? "answer" as const : "student" as const;
    const document = exportDocumentHtml(kind);
    if (action.endsWith("word")) {
      await downloadWordHtml(document.fileName, document.html);
      showToast(approved ? "تم تجهيز ملف Word للتنزيل بعد التحقق من جميع الأصول البصرية." : "تم تجهيز نسخة مسودة غير معتمدة للمراجعة.");
      return;
    }
    if (!printHtmlDocument(document.fileName, document.html)) {
      showToast("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : "تعذر تجهيز التصدير.");
  }
}

function exportDocumentHtml(kind: "student" | "answer"): { html: string; fileName: string } {
  const selected = selectedPaperItems();
  const paperLayout = buildPaperLayout(selected);
  const subject = SUBJECTS.find((item) => item.id === state.draft.subjectId)?.label ?? "المادة";
  const body = kind === "student"
    ? renderStudentPaper(subject, paperLayout)
    : `${renderStudentPaper(subject, paperLayout)}${renderTeacherAnswerKey(selected, paperLayout.labels)}`;
  const label = kind === "student" ? "ورقة_الطالب" : "نموذج_الإجابة";
  const fileName = safeExportFileName(`${state.draft.title}_${subject}_${stageLabel(state.draft.programmeId, state.draft.grade)}_${label}`);
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
  const generating = (step === 2 || step === 3) && state.questionGenerationBusy;
  const nextLabel = retrieving
    ? "جارٍ مطابقة المصادر…"
    : generating
      ? "جارٍ إنشاء الأسئلة من المصدر…"
      : `التالي ${icon("arrow")}`;
  const busy = retrieving || generating;
  return `<footer class="wizard-footer">${step > 1 ? `<button class="secondary-btn" data-action="previous-step" ${(busy || state.draft.status === "معتمد") ? "disabled" : ""}>السابق</button>` : `<button class="secondary-btn" data-nav="home">إلغاء</button>`}<div>${step < 4 ? `<button class="primary-btn" data-action="next-step" ${canContinue && !busy ? "" : "disabled"}>${nextLabel}</button>` : `<button class="secondary-btn" data-nav="library">الذهاب إلى اختباراتي</button>`}</div></footer>`;
}

interface LibraryCardExam {
  id: string;
  title: string;
  subject: string;
  grade: number;
  status: "مسودة" | "معتمد";
  date: string;
  progress?: number;
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
    isComplete: draft.currentStep >= 4 && isPlanComplete(draft),
  }));
  const exams = localExam.filter((exam) => state.libraryFilter === "الكل" || exam.status === state.libraryFilter);

  return `
    <section class="page-heading"><div><span class="eyebrow">مكتبتك الخاصة</span><h1>اختباراتي</h1><p>افتح الاختبار المعتمد أو نزّل ورقة الطالب ونموذج الإجابة مباشرة من هنا.</p></div><button class="primary-btn" data-action="new-exam">${icon("plus")} اختبار جديد</button></section>
    <div class="filter-bar"><div class="segmented small">${["الكل", "مسودة", "معتمد"].map((filter) => `<button data-library-filter="${filter}" class="${state.libraryFilter === filter ? "active" : ""}">${filter}</button>`).join("")}</div><label class="search-field"><span>بحث</span><input id="library-search" placeholder="ابحث بالعنوان أو المادة"/></label></div>
    <div class="library-grid" id="library-grid">${exams.map(renderExamCard).join("") || `<div class="empty-state"><h2>لا توجد نتائج</h2><p>جرّب مرشحًا آخر بدل معاقبة قاعدة البيانات بنظرات الاستغراب.</p></div>`}</div>
  `;
}

function renderExamCard(exam: LibraryCardExam): string {
  const draftAttr = ` data-draft-id="${escapeHtml(exam.id)}"`;
  const exportActions = `<button class="secondary-btn compact"${draftAttr} data-action="library-export-student-word">الطالب Word</button>
         <button class="secondary-btn compact"${draftAttr} data-action="library-export-student-pdf">الطالب PDF</button>
         <button class="secondary-btn compact"${draftAttr} data-action="library-export-answer-word">الإجابة Word</button>
         <button class="secondary-btn compact"${draftAttr} data-action="library-export-answer-pdf">الإجابة PDF</button>`;
  const actions = exam.status === "مسودة"
    ? exam.isComplete
      ? `<button class="primary-btn compact"${draftAttr} data-action="preview-library-exam">معاينة المسودة</button><button class="secondary-btn compact"${draftAttr} data-action="resume-draft">متابعة التعديل</button>${exportActions}<button class="ghost-btn compact"${draftAttr} data-action="delete-draft">حذف</button>`
      : `<button class="primary-btn compact"${draftAttr} data-action="resume-draft">متابعة</button><button class="ghost-btn compact"${draftAttr} data-action="delete-draft">حذف</button>`
    : `<button class="primary-btn compact"${draftAttr} data-action="preview-library-exam">معاينة الاختبار</button>${exportActions}`;
  return `<article class="exam-card" data-search-text="${escapeHtml(`${exam.title} ${exam.subject} ${exam.grade}`)}"><div class="exam-card-head"><span class="status-badge ${exam.status === "معتمد" ? "approved" : "draft"}">${exam.status}</span></div><h2>${escapeHtml(exam.title)}</h2><p>${escapeHtml(exam.subject)} · ${exam.grade ? `Stage ${exam.grade}` : "Cambridge"}</p><div class="exam-meta"><span>${formatArabicDate(exam.date)}</span>${exam.progress ? `<span>${exam.progress}% مكتمل</span>` : ""}</div>${exam.progress ? `<div class="progress-track"><span style="width:${exam.progress}%"></span></div>` : ""}<div class="exam-actions library-exam-actions">${actions}</div></article>`;
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

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 بايت";
  const units = ["بايت", "ك.ب", "م.ب", "ج.ب"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
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
    <section class="page-heading"><div><span class="eyebrow">مكتبة واثق العلمية</span><h1>إدارة المصادر</h1><p>أضف ملفات PDF مباشرة. يستخرج واثق النص ويفهرسه حسب الصفحات والمقاطع، ويستخدم OCR فقط إذا كان الملف مصورًا أو مشوهًا.</p></div><span class="demo-badge">فهرسة مباشرة</span></section>

    ${renderSourceStoragePanel()}
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
      <div><h2>نسخة احتياطية لسجل المصادر</h2><p>التصدير يحفظ سجل المصادر وبيانات الفهرسة الوصفية. ملفات PDF الأصلية لا تُحفظ داخل واثق ولا تُضمَّن في JSON.</p></div>
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
  const sourceProgramme = draft.grade === 10 ? "igcse" : draft.grade && draft.grade >= 7 ? "lower_secondary" : "primary";
  const availableSourceSubjects = SUBJECTS.filter((subject) => subject.programmes.includes(sourceProgramme));
  const issueFor = (field: string) => validation.issues.find((issue) => issue.field === field)?.message ?? "";
  return `
    <section class="source-form-card" aria-label="إضافة مصدر جديد">
      <header><div><span class="eyebrow">${draft.mode === "file" ? "مصدر PDF" : "رابط عالمي"}</span><h2>${draft.mode === "file" ? "إضافة ملف إلى مكتبة المصادر" : "إضافة رابط إلى مكتبة المصادر"}</h2></div><button class="ghost-btn compact" data-action="close-source-form">إغلاق</button></header>
      <div class="form-grid two-columns">
        <label class="field full"><span>اسم المصدر</span><input id="source-title" value="${escapeHtml(draft.title)}" placeholder="مثال: كتاب الطالب للفيزياء"/>${issueFor("title") ? `<small class="field-error">${issueFor("title")}</small>` : ""}</label>
        <label class="field"><span>نوع المصدر</span><select id="source-kind">${SOURCE_KINDS.map((kind) => `<option value="${kind}" ${draft.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}</select></label>
        <label class="field"><span>مرحلة Cambridge</span><select id="source-grade"><option value="">اختر المرحلة</option>${Array.from({ length: 9 }, (_, index) => index + 1).map((stage) => `<option value="${stage}" ${draft.grade === stage ? "selected" : ""}>Stage ${stage}</option>`).join("")}<option value="10" ${draft.grade === 10 ? "selected" : ""}>Cambridge IGCSE</option></select>${issueFor("grade") ? `<small class="field-error">${issueFor("grade")}</small>` : ""}</label>
        <label class="field"><span>المادة</span><select id="source-subject" ${draft.grade ? "" : "disabled"}><option value="">اختر المادة</option>${availableSourceSubjects.map((subject) => `<option value="${subject.id}" ${draft.subjectId === subject.id ? "selected" : ""}>${subject.label}</option>`).join("")}</select>${issueFor("subjectId") ? `<small class="field-error">${issueFor("subjectId")}</small>` : ""}</label>
        ${draft.mode === "file" ? `
          <label class="field full"><span>ملف PDF</span><input id="source-file" type="file" accept="application/pdf,.pdf" ${state.sourceUploadBusy ? "disabled" : ""}/><small>${state.sourceFile ? `الملف المختار: ${escapeHtml(state.sourceFile.name)} · ${formatFileSize(state.sourceFile.size)}` : draft.fileName ? `الملف المسجل: ${escapeHtml(draft.fileName)}` : "اختر ملف PDF وسيقوم واثق بقراءته وفهرسته مباشرة."}</small>${issueFor("fileName") ? `<small class="field-error">${issueFor("fileName")}</small>` : ""}</label>
        ` : `
          <label class="field full"><span>رابط المصدر</span><input id="source-url" type="url" value="${escapeHtml(draft.url)}" placeholder="https://example.org/source"/>${issueFor("url") ? `<small class="field-error">${issueFor("url")}</small>` : ""}</label>
          <label class="rights-check full"><input id="source-rights" type="checkbox" ${draft.rightsConfirmed ? "checked" : ""}/><span>راجعت حقوق الاستخدام وسياسة الموقع، وأسمح بتسجيل الرابط كمصدر مركزي.</span></label>
          ${issueFor("rightsConfirmed") ? `<p class="field-error full">${issueFor("rightsConfirmed")}</p>` : ""}
        `}
      </div>
      <div class="source-intake-note"><strong>فهرسة مباشرة</strong><small>${draft.mode === "file" ? "يقرأ واثق ملف PDF من جهازك مباشرة؛ لا يحتاج حساب Google أو اتصال Drive، وتسجيل مالك واثق يكفي." : "الرابط يُحفظ كمرجع بعد تأكيد حقوق الاستخدام."}</small></div>
      ${state.sourceUploadBusy || state.sourceUploadMessage ? `<div class="source-upload-progress" aria-live="polite"><div><strong>${escapeHtml(state.sourceUploadMessage || "جارٍ تجهيز الرفع…")}</strong><span>${state.sourceUploadProgress}%</span></div><div class="upload-progress-track"><span style="width:${state.sourceUploadProgress}%"></span></div></div>` : ""}
      <footer><button class="secondary-btn" data-action="close-source-form" ${state.sourceUploadBusy ? "disabled" : ""}>إلغاء</button><button class="primary-btn" data-action="save-source" ${state.sourceUploadBusy ? "disabled" : ""}>${state.sourceUploadBusy ? "جارٍ الفهرسة…" : draft.mode === "file" ? "إضافة وفهرسة المصدر" : (state.sourceStorageStatus === "متصل" ? "حفظ في السجل المركزي" : "حفظ المصدر")}</button></footer>
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
        <div><span>المادة والمرحلة</span><strong>${escapeHtml(subject)} · ${source.grade === 10 ? "Cambridge IGCSE" : `Stage ${source.grade}`}</strong></div>
        <div><span>الحالة</span><strong>${escapeHtml(source.status)}</strong></div>
        <div><span>حالة المصدر</span><strong>${source.mode === "url" ? "رابط مسجل" : source.extractionStatus === "مكتمل" ? "مفهرس داخل واثق" : "بانتظار الفهرسة"}</strong></div>
        <div><span>حالة الاستخراج</span><strong>${escapeHtml(extractionStatus)}</strong></div>
        <div><span>حجم الملف</span><strong>${source.fileSizeBytes ? formatFileSize(source.fileSizeBytes) : "—"}</strong></div>
        <div><span>الصفحات المستخرجة</span><strong>${source.extractedPageCount ?? "—"}</strong></div>
        <div><span>عدد الحروف</span><strong>${source.extractedCharacterCount?.toLocaleString("ar-OM") ?? "—"}</strong></div>
        <div><span>لغة النص</span><strong>${escapeHtml(source.extractedLanguage ?? "—")}</strong></div>
        <div><span>أضيف في</span><strong>${formatArabicDate(source.createdAt.slice(0, 10))}</strong></div>
        <div><span>آخر تحديث</span><strong>${formatArabicDate(source.updatedAt.slice(0, 10))}</strong></div>
      </div>
      <div class="source-reference"><span>${source.mode === "file" ? "اسم الملف" : "الرابط"}</span><code>${escapeHtml(reference)}</code></div>
      ${source.extractionMessage ? `<div class="extraction-note status-${extractionStatus === "مكتمل" ? "ok" : extractionStatus === "يحتاج OCR" || extractionStatus === "فشل" ? "warn" : "idle"}"><strong>${escapeHtml(extractionStatus)}</strong><p>${escapeHtml(source.extractionMessage)}</p></div>` : ""}
      ${source.extractionPreview ? `<div class="extraction-preview"><span>معاينة النص المستخرج</span><p>${escapeHtml(source.extractionPreview)}</p></div>` : ""}
      ${headings.length ? `<div class="detected-headings"><span>عناوين مستخرجة للمساعدة في البحث، وليست فهرسًا للكتاب</span><div>${headings.slice(0, 12).map((heading) => `<small>${escapeHtml(heading)}</small>`).join("")}</div></div>` : ""}
      ${renderSourceReadinessPanel(source)}
      <div class="source-detail-actions"></div>
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
    ? `تم حفظ نص ${pageCount} صفحة مع أرقام الصفحات، وأصبح المصدر جاهزًا للبحث والاسترجاع.`
    : needsOcr
      ? "شغّل OCR العربي لاستخراج نص الصفحات المصورة، ثم يصبح المصدر جاهزًا للاستخدام."
      : failed
        ? "أعد محاولة الاستخراج أو OCR حتى يصبح نص المصدر مقروءًا وقابلًا للفهرسة."
        : "استخرج نص PDF وفهرسه حسب الصفحات. هذا هو المسار المعتمد والوحيد المطلوب حاليًا.";
  return `<section class="source-readiness-card ${complete ? "ready" : needsOcr || failed ? "warning" : "pending"}">
    <header><div><span class="eyebrow">الفهرسة المعتمدة</span><h3>${statusLabel}</h3><p>${escapeHtml(message)}</p></div><span class="source-readiness-badge">${complete ? "صفحات ومقاطع" : "لا يحتاج فهرسًا بصريًا"}</span></header>
    <div class="source-readiness-metrics">
      <div><span>الصفحات</span><strong>${pageCount || "—"}</strong></div>
      <div><span>الحروف المستخرجة</span><strong>${characterCount ? characterCount.toLocaleString("ar-OM") : "—"}</strong></div>
      <div><span>طريقة العمل</span><strong>استرجاع حسب الصفحة والمقطع</strong></div>
    </div>
    <p class="source-readiness-note">يكفي النص المفهرس مع أرقام الصفحات. يكتب المعلم اسم الدرس عند إنشاء الاختبار، ويسترجع واثق سياقه من المصدر.</p>
  </section>`;
}







function renderSourceRow(source: ManagedSource): string {
  const subject = SUBJECTS.find((item) => item.id === source.subjectId)?.label ?? "غير محددة";
  const sourceRef = source.mode === "file" ? source.fileName ?? "ملف PDF" : source.url ?? "رابط";
  const indexing = state.sourceIndexingId === source.id;
  const actions = source.status === "مؤرشف"
    ? `<button class="text-btn" data-action="view-source" data-source-id="${source.id}">تفاصيل</button><button class="text-btn" data-action="restore-source" data-source-id="${source.id}">استعادة</button>`
    : `<button class="text-btn" data-action="view-source" data-source-id="${source.id}">تفاصيل</button><button class="text-btn danger-text" data-action="archive-source" data-source-id="${source.id}" ${indexing ? "disabled" : ""}>أرشفة</button>`;
  return `<article class="source-row-card" data-source-search="${escapeHtml(`${source.title} ${source.catalogCode} ${source.authority} ${source.kind} ${subject} ${source.grade} ${sourceRef}`)}">
    <div class="source-main"><span class="source-mode-icon">${source.mode === "file" ? icon("files") : icon("spark")}</span><div><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.catalogCode)}</small></div></div>
    <div class="source-meta"><span>${escapeHtml(subject)} · ${source.grade === 10 ? "Cambridge IGCSE" : `Stage ${source.grade}`}</span><small>${escapeHtml(source.authority)}${source.fileSizeBytes ? ` · ${formatFileSize(source.fileSizeBytes)}` : ""}</small></div>
    <div class="source-state-stack"><span class="source-status status-${sourceStatusSlug(source.status)}">${source.status}</span>${source.mode === "file" ? `<small class="extraction-state extraction-${extractionStatusSlug(source.extractionStatus)}">${escapeHtml(source.extractionStatus ?? "لم يبدأ")}</small>` : ""}</div>
    <div class="source-actions">${actions}</div>
  </article>`;
}

function sourceExtractionActionLabel(source: ManagedSource, busy: boolean): string {
  if (busy) return source.extractionVersion?.includes("ocr") ? "جارٍ OCR…" : "جارٍ الاستخراج…";
  if (source.extractionStatus === "يحتاج OCR") return "تشغيل OCR العربي";
  if (source.extractionVersion?.startsWith("gemini-ocr-pending")) return "استكمال OCR";
  if (source.extractionVersion?.startsWith("gemini-ocr")) return "إعادة OCR";
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
    stopVisualJobPolling();
    lastAutoVisualEnqueueSignature = "";
    if (visualJobAutoEnqueueTimer) window.clearTimeout(visualJobAutoEnqueueTimer);
    visualJobAutoEnqueueTimer = undefined;
    if (profile) {
      state.draft.school = profile.school;
    }
    saveDraft(state.draft);
    navigate("wizard");
    scheduleSave();
    return;
  }
  if (action === "resume-draft") {
    const loaded = loadDraft(requestedDraftId || undefined);
    if (!loaded) {
      showToast("تعذر العثور على المسودة المطلوبة؛ لم يتم فتح اختبار جديد بدلًا منها.");
      return;
    }
    state.draft = loaded;
    setActiveDraftId(loaded.id);
    restoreDraftRuntimeContext(loaded);
    // ثبّت الترقية غير المتلفة فورًا حتى لا تعود المسودة إلى خطوة المحتوى في الزيارة التالية.
    persistDraftCheckpoint(false);
    navigate("wizard");
    if (loaded.currentStep >= 3 && state.sourceStorageStatus === "متصل") {
      window.setTimeout(() => {
        if (!isPlanComplete(state.draft) && state.draft.plan.length) {
          void generateQuestionsForPlan(state.draft.plan);
          scheduleRequiredVisualJobSync();
        } else {
          scheduleRequiredVisualJobSync();
        }
      }, 0);
    }
    return;
  }
  if (action === "preview-library-exam") {
    const loaded = loadDraft(requestedDraftId || undefined);
    if (!loaded) return showToast("تعذر العثور على الاختبار المحفوظ.");
    state.draft = loaded;
    setActiveDraftId(loaded.id);
    restoreDraftRuntimeContext(loaded);
    state.draft.currentStep = 4;
    navigate("wizard");
    window.setTimeout(() => { void syncVisualJobs(false); }, 0);
    return;
  }
  if (["library-export-student-word", "library-export-student-pdf", "library-export-answer-word", "library-export-answer-pdf"].includes(action)) {
    const loaded = loadDraft(requestedDraftId || undefined);
    if (!loaded || loaded.currentStep < 4 || !isPlanComplete(loaded)) return showToast("لا يوجد اختبار مكتمل قابل للتصدير.");
    state.draft = loaded;
    if (!reviewReadiness(selectedPaperItems()).ready) return showToast("لا يمكن التصدير قبل اكتمال الأصول البصرية وجميع فحوص المراجعة.");
    void executeExamExport(action, loaded.status === "معتمد");
    return;
  }
  if (["sync-visual-job", "retry-visual-job", "regenerate-visual-job"].includes(action)) {
    const planItemId = element.dataset.planId ?? "";
    if (planItemId) void retryVisualJob(planItemId);
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
    if (!reviewReadiness(selectedPaperItems()).ready) {
      showToast("لا يمكن التصدير قبل اكتمال الأصول البصرية وجميع فحوص المراجعة.");
      return;
    }
    void executeExamExport(action, state.draft.status === "معتمد");
    return;
  }
  if (action === "previous-step") return setStep(Math.max(1, state.draft.currentStep - 1) as WizardStep);
  if (action === "next-step") { void nextStep(); return; }
  if (action === "apply-suggestion") return applySuggestedCounts();
  if (action === "match-optional-sources") { void prepareSourceContext(); return; }
  if (action === "delete-draft") {
    const targetDraftId = requestedDraftId || state.draft.id;
    if (targetDraftId === state.draft.id) {
      const activeRunId = state.draft.generationRunId;
      assessmentGenerationOrchestrator?.stop();
      if (activeRunId && assessmentGenerationJobService) {
        void assessmentGenerationJobService.cancelRun(activeRunId).catch(() => undefined);
      }
      state.assessmentGenerationRun = null;
    }
    clearDraft(targetDraftId);
    const remaining = loadDraft();
    state.draft = remaining ?? createEmptyDraft();
    if (remaining) restoreDraftRuntimeContext(remaining);
    else {
          }
    state.questionGenerationBusy = false;
    state.questionGenerationMessage = "";
    state.sourceRetrievalMessage = "";
    stopVisualJobPolling();
    showToast("تم حذف المسودة المحلية.");
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
}

function visualJobSubject(): string {
  return SUBJECTS.find((entry) => entry.id === state.draft.subjectId)?.label ?? state.draft.subjectId;
}

function invalidateVisualJobForPlanItem(planItemId: string): void {
  delete state.draft.visualJobs[planItemId];
  const item = state.draft.plan.find((entry) => entry.id === planItemId);
  if (item?.visual?.illustration) item.visual = stripQuestionVisualIllustration(item.visual);
}

function applyVisualJobSnapshots(jobs: QuestionVisualJobSnapshot[]): boolean {
  let changed = false;
  for (const job of jobs) {
    const previous = state.draft.visualJobs[job.planItemId];
    if (!previous || JSON.stringify(previous) !== JSON.stringify(job)) {
      state.draft.visualJobs[job.planItemId] = job;
      changed = true;
    }
    const item = state.draft.plan.find((entry) => entry.id === job.planItemId);
    if (!item?.visual) continue;
    if (job.status === "ready" && job.asset) {
      if (item.visual.illustration?.assetPath !== job.asset.assetPath) {
        item.visual = { ...stripQuestionVisualIllustration(item.visual), illustration: job.asset };
        changed = true;
      }
    } else if (item.visual.illustration) {
      item.visual = stripQuestionVisualIllustration(item.visual);
      changed = true;
    }
  }
  if (changed) persistDraftCheckpoint(false);
  return changed;
}

function currentAutoVisualEnqueueSignature(): string {
  if (state.sourceStorageStatus !== "متصل" || state.draft.grade === null) return "";
  // هوية الحاجة البصرية لا تتغير عند وصول الأصل؛ هذا يمنع إعادة enqueue بعد الجاهزية.
  return requiredVisualJobItems(state.draft, visualJobSubject())
    .map((item) => `${item.planItemId}:${item.requiredMode}`)
    .sort()
    .join("|");
}

function scheduleRequiredVisualJobSync(): void {
  if (!visualJobService || state.sourceStorageStatus !== "متصل" || state.draft.grade === null) return;
  const signature = currentAutoVisualEnqueueSignature();
  if (!signature || signature === lastAutoVisualEnqueueSignature) return;
  if (visualJobAutoEnqueueTimer) window.clearTimeout(visualJobAutoEnqueueTimer);
  const draftId = state.draft.id;
  visualJobAutoEnqueueTimer = window.setTimeout(() => {
    visualJobAutoEnqueueTimer = undefined;
    if (state.draft.id !== draftId) return;
    const latest = currentAutoVisualEnqueueSignature();
    if (!latest || latest === lastAutoVisualEnqueueSignature) return;
    if (state.visualJobSyncBusy) {
      scheduleRequiredVisualJobSync();
      return;
    }
    void autoEnqueueVisualJobs(latest);
  }, VISUAL_JOB_AUTO_ENQUEUE_DELAY_MS);
}

async function autoEnqueueVisualJobs(signature: string): Promise<void> {
  const synced = await syncVisualJobs(true);
  if (synced) {
    lastAutoVisualEnqueueSignature = signature;
    return;
  }
  // A temporary network/session/race failure must not silently lose the required 2D task.
  window.setTimeout(() => scheduleRequiredVisualJobSync(), VISUAL_JOB_AUTO_ENQUEUE_DELAY_MS * 4);
}

function hasPendingVisualJobs(): boolean {
  return Object.values(state.draft.visualJobs).some((job) => isVisualJobPending(job.status));
}

function stopVisualJobPolling(): void {
  if (visualJobPollTimer) window.clearTimeout(visualJobPollTimer);
  visualJobPollTimer = undefined;
}

function scheduleVisualJobPolling(): void {
  stopVisualJobPolling();
  if (!hasPendingVisualJobs() || !visualJobService || state.sourceStorageStatus !== "متصل") return;
  const draftId = state.draft.id;
  visualJobPollTimer = window.setTimeout(() => {
    visualJobPollTimer = undefined;
    if (state.draft.id !== draftId) return;
    void syncVisualJobs(false);
  }, VISUAL_JOB_POLL_INTERVAL_MS);
}

async function syncVisualJobs(enqueueRequired: boolean): Promise<boolean> {
  if (!visualJobService || !centralSourceStore?.currentSession || state.sourceStorageStatus !== "متصل" || state.draft.grade === null) return false;
  if (state.visualJobSyncBusy) return false;
  state.visualJobSyncBusy = true;
  let synced = false;
  try {
    const jobs = enqueueRequired
      ? await visualJobService.enqueue(state.draft.id, requiredVisualJobItems(state.draft, visualJobSubject()))
      : await visualJobService.list(state.draft.id);
    applyVisualJobSnapshots(jobs);
    state.questionGenerationMessage = jobs.some((job) => isVisualJobPending(job.status))
      ? "تم حفظ مهام المرئيات في Supabase، ويستمر تنفيذها حتى لو غادرت الصفحة."
      : jobs.some((job) => job.status === "failed")
        ? "اكتملت بعض المرئيات وتعذر بعضها؛ افتح المفردة لإعادة المحاولة قبل الاعتماد."
        : jobs.length ? "اكتملت الأصول البصرية المطلوبة واعتمدت علميًا." : state.questionGenerationMessage;
    synced = true;
  } catch (error) {
    state.questionGenerationMessage = error instanceof Error ? error.message : "تعذر مزامنة مهام المرئيات.";
  } finally {
    state.visualJobSyncBusy = false;
    render();
    scheduleVisualJobPolling();
  }
  return synced;
}

async function retryVisualJob(planItemId: string): Promise<void> {
  if (!visualJobService || state.draft.status === "معتمد") return;
  const job = state.draft.visualJobs[planItemId];
  if (!job) {
    await syncVisualJobs(true);
    return;
  }
  state.visualJobSyncBusy = true;
  render();
  try {
    const jobs = await visualJobService.retry(job.id);
    applyVisualJobSnapshots(jobs);
    showToast("أعيدت مهمة الصورة إلى طابور التنفيذ الدائم.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "تعذر إعادة مهمة الصورة.");
  } finally {
    state.visualJobSyncBusy = false;
    render();
    scheduleVisualJobPolling();
  }
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
      return showToast(`اختر الصف والمادة وحدد من ${MIN_LESSON_TOPICS} إلى ${MAX_LESSON_TOPICS} دروس.`);
    }
    syncDraftTopicFromLessons(state.draft);
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
    state.draft.visualJobs = Object.fromEntries(
      Object.entries(state.draft.visualJobs).filter(([planItemId]) => validPlanIds.has(planItemId)),
    );
    state.draft.generationMode = "progressive_items_v1";
    if (!persistDraftCheckpoint()) return;
    setStep(3);
    window.setTimeout(() => { void generateQuestionsForPlan(state.draft.plan); }, 0);
    return;
  }
  if (step === 3) {
    if (!isPlanComplete(state.draft)) return showToast("اختر سؤالًا واحدًا لكل مفردة.");
    if (state.draft.status !== "معتمد") state.draft.status = "جاهز للمراجعة";
    return setStep(4);
  }
}

function contractsByPlanItem(payload: ProgressiveGenerationPayload): Map<string, AssessmentItemContract> {
  return new Map(payload.contracts.map((contract) => [contract.planItemId, contract]));
}

function generationItemSnapshot(planItemId: string): AssessmentGenerationItemSnapshot | undefined {
  return state.assessmentGenerationRun?.items.find((item) => item.planItemId === planItemId);
}

function progressiveRunMessage(snapshot: AssessmentGenerationRunSnapshot): string {
  const active = snapshot.items.filter((item) => ["grounding", "generating", "normalizing", "validating"].includes(item.status)).length;
  const queued = snapshot.items.filter((item) => item.status === "queued" || item.status === "retry_pending").length;
  if (snapshot.items.every((item) => item.status === "ready")) {
    return `اكتملت ${snapshot.completedItems} من ${snapshot.totalItems} مفردات وحُفظت خادميًا. راجع الاختبار كوحدة واحدة قبل الاعتماد.`;
  }
  if (snapshot.status === "cancelled") return `أُلغي التوليد بعد حفظ ${snapshot.completedItems} مفردات مكتملة.`;
  if (snapshot.status === "superseded") return "أوقفت دورة قديمة لأن خطة أحدث أصبحت هي المعتمدة.";
  if (snapshot.failedItems > 0 && active === 0 && queued === 0) {
    return `اكتملت ${snapshot.completedItems} من ${snapshot.totalItems} وتعذرت ${snapshot.failedItems} مفردات. أعد المفردات الفاشلة وحدها.`;
  }
  return `اكتمل ${snapshot.completedItems} من ${snapshot.totalItems}؛ ${active ? `يجري تنفيذ ${active}` : "يجهز واثق الدفعة التالية"}${queued ? `، والمتبقي في الطابور ${queued}` : ""}.`;
}

function applyProgressiveGenerationSnapshot(
  snapshot: AssessmentGenerationRunSnapshot,
  payload: ProgressiveGenerationPayload,
): boolean {
  if (snapshot.draftId !== state.draft.id
    || snapshot.generationEpoch !== state.draft.generationEpoch
    || snapshot.planHash !== payload.blueprint.planHash
    || snapshot.sourceSnapshotHash !== payload.blueprint.sourceSnapshotHash) return false;

  const contracts = contractsByPlanItem(payload);
  const results = snapshot.items.flatMap((item) => item.status === "ready" && item.result ? [item.result] : []);
  const resultByPlanItem = new Map(results.map((result) => [result.planItemId, result]));
  state.assessmentGenerationRun = snapshot;
  state.draft.generationRunId = snapshot.id;
  state.draft.generationMode = "progressive_items_v1";

  state.draft.plan = state.draft.plan.map((item) => {
    const result = resultByPlanItem.get(item.id);
    const contract = contracts.get(item.id);
    if (!result || !contract || result.contractHash !== contract.contractHash) return item;
    const proposalId = `${item.id}-engine-v1-primary`;
    state.draft.selectedProposalByPlanItem[item.id] = proposalId;
    return {
      ...item,
      visual: result.visual,
      proposals: [{
        id: proposalId,
        ...(result.content.stimulus ? { stimulus: result.content.stimulus } : {}),
        text: result.content.text,
        options: [...result.content.options],
        answer: result.content.answer,
        rationale: result.content.rationale,
        markScheme: [...result.content.markScheme],
        sourceSupport: result.evidence.excerpt,
      }],
    };
  });

  let reviewMessage = "";
  if (results.length === snapshot.totalItems) {
    const conflicts = reviewCompletedAssessment(results);
    if (conflicts.length) {
      const affected = new Set(conflicts.flatMap((conflict) => conflict.planItemIds));
      state.draft.plan = state.draft.plan.map((item) => affected.has(item.id)
        ? { ...item, proposals: item.proposals.map((proposal) => ({ ...proposal, needsReview: true })) }
        : item);
      reviewMessage = `اكتملت المفردات، ورصدت المراجعة العامة ${conflicts.length} ملاحظة تنوع تحتاج تدقيقًا قبل الاعتماد.`;
    }
    state.draft.generationVersion = ASSESSMENT_PROGRESSIVE_GENERATION_VERSION;
    state.draft.generationModel = [...new Set(results.map((result) => result.model))].join(" + ");
    state.draft.generatedAt = results.map((result) => result.generatedAt).sort().at(-1) ?? new Date().toISOString();
  }
  state.questionGenerationMessage = reviewMessage || progressiveRunMessage(snapshot);
  persistDraftCheckpoint(false);
  return true;
}

function progressiveGenerationHooks(payload: ProgressiveGenerationPayload, draftId: string, generationEpoch: number) {
  return {
    onSnapshot: (snapshot: AssessmentGenerationRunSnapshot): void => {
      if (state.draft.id !== draftId || state.draft.generationEpoch !== generationEpoch) {
        assessmentGenerationOrchestrator?.stop();
        return;
      }
      state.questionGenerationMessage = progressiveRunMessage(snapshot);
      applyProgressiveGenerationSnapshot(snapshot, payload);
      scheduleRequiredVisualJobSync();
      render();
    },
    onWorkerError: (_itemId: string, error: unknown): void => {
      if (state.draft.id !== draftId || state.draft.generationEpoch !== generationEpoch) return;
      state.questionGenerationMessage = error instanceof Error ? error.message : "تعذر تشغيل إحدى مهام التوليد؛ سيحاول واثق استعادتها من الطابور.";
      render();
    },
  };
}

async function buildCurrentProgressivePayload(): Promise<ProgressiveGenerationPayload> {
  const subject = SUBJECTS.find((item) => item.id === state.draft.subjectId)?.label ?? state.draft.subjectId;
  return buildProgressiveGenerationPayload({ draft: state.draft, subject, sources: state.sources });
}

async function generateQuestionsForPlan(_plan: PlanItem[]): Promise<boolean> {
  if (state.questionGenerationBusy) return false;
  if (!assessmentGenerationJobService || !assessmentGenerationWorkerService || !assessmentGenerationOrchestrator
    || !centralSourceStore?.currentSession || state.sourceStorageStatus !== "متصل") {
    state.questionGenerationMessage = "يلزم تسجيل دخول مالك المنصة ونشر وظيفتي التوليد الدائم قبل المتابعة.";
    render();
    showToast(state.questionGenerationMessage);
    return false;
  }
  if (state.draft.status === "معتمد") return false;
  const draftId = state.draft.id;
  const generationEpoch = state.draft.generationEpoch;
  state.questionGenerationBusy = true;
  state.questionGenerationMessage = "جارٍ تجهيز العقود المستقلة للمفردات وإنشاء دورة التوليد الدائمة…";
  render();
  try {
    const workerHealth = await assessmentGenerationWorkerService.health();
    if (workerHealth.engineSchemaVersion !== 1 || workerHealth.contractVersion !== 3) {
      throw new Error("عامل توليد المفردات المنشور لا يطابق عقد Cambridge-first الحالي. أعد نشر assessment-generation-worker ثم أعد المحاولة.");
    }
    const payload = await buildCurrentProgressivePayload();
    let finalSnapshot: AssessmentGenerationRunSnapshot | null = null;
    if (state.draft.generationRunId) {
      const existing = await assessmentGenerationJobService.list(draftId, state.draft.generationRunId);
      if (existing.run
        && existing.run.generationEpoch === generationEpoch
        && existing.run.planHash === payload.blueprint.planHash
        && existing.run.sourceSnapshotHash === payload.blueprint.sourceSnapshotHash) {
        finalSnapshot = await assessmentGenerationOrchestrator.resume(
          draftId,
          existing.run.id,
          progressiveGenerationHooks(payload, draftId, generationEpoch),
        );
      } else {
        state.draft.generationRunId = "";
      }
    }
    if (!finalSnapshot && state.draft.id === draftId && state.draft.generationEpoch === generationEpoch) {
      finalSnapshot = await assessmentGenerationOrchestrator.start(
        payload.blueprint,
        payload.contracts,
        progressiveGenerationHooks(payload, draftId, generationEpoch),
      );
    }
    if (!finalSnapshot || state.draft.id !== draftId || state.draft.generationEpoch !== generationEpoch) return false;
    applyProgressiveGenerationSnapshot(finalSnapshot, payload);
    const completed = finalSnapshot.items.every((item) => item.status === "ready");
    state.questionGenerationBusy = false;
    persistDraftCheckpoint(false);
    render();
    if (completed) scheduleRequiredVisualJobSync();
    return completed;
  } catch (error) {
    if (state.draft.id !== draftId || state.draft.generationEpoch !== generationEpoch) return false;
    state.questionGenerationBusy = false;
    state.questionGenerationMessage = error instanceof Error ? error.message : "تعذر تشغيل منظومة التوليد التدريجي.";
    persistDraftCheckpoint(false);
    render();
    showToast(state.questionGenerationMessage);
    return false;
  }
}

async function retryGenerationItem(itemId: string): Promise<void> {
  if (!assessmentGenerationOrchestrator || state.questionGenerationBusy || state.draft.status === "معتمد") return;
  const snapshot = state.assessmentGenerationRun;
  if (!snapshot) return;
  const failedItem = snapshot.items.find((item) => item.id === itemId && item.status === "failed");
  if (!failedItem) return;
  const draftId = state.draft.id;
  const generationEpoch = state.draft.generationEpoch;
  state.questionGenerationBusy = true;
  state.questionGenerationMessage = `أعيدت المفردة ${failedItem.planItemId} وحدها إلى الطابور دون لمس الأسئلة المكتملة.`;
  render();
  try {
    const payload = await buildCurrentProgressivePayload();
    const finalSnapshot = await assessmentGenerationOrchestrator.retryItem(
      itemId,
      progressiveGenerationHooks(payload, draftId, generationEpoch),
    );
    applyProgressiveGenerationSnapshot(finalSnapshot, payload);
    state.questionGenerationBusy = false;
    render();
    if (finalSnapshot.items.every((item) => item.status === "ready")) scheduleRequiredVisualJobSync();
  } catch (error) {
    state.questionGenerationBusy = false;
    state.questionGenerationMessage = error instanceof Error ? error.message : "تعذر إعادة المفردة الفاشلة.";
    render();
    showToast(state.questionGenerationMessage);
  }
}

async function cancelProgressiveGeneration(): Promise<void> {
  const runId = state.draft.generationRunId;
  if (!runId || !assessmentGenerationJobService) return;
  assessmentGenerationOrchestrator?.stop();
  try {
    const response = await assessmentGenerationJobService.cancelRun(runId);
    if (response.run) state.assessmentGenerationRun = response.run;
    state.questionGenerationBusy = false;
    state.questionGenerationMessage = response.run ? progressiveRunMessage(response.run) : "أُلغيت دورة التوليد.";
    persistDraftCheckpoint(false);
    render();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "تعذر إلغاء دورة التوليد.");
  }
}

async function regeneratePlanItem(item: PlanItem): Promise<void> {
  const task = generationItemSnapshot(item.id);
  if (task?.status === "failed") {
    await retryGenerationItem(task.id);
    return;
  }
  showToast("المحرك الجديد يحافظ على المفردة المكتملة. إعادة صياغتها ستتم بدورة مراجعة مستقلة في مرحلة التحويل النهائي.");
}

async function prepareSourceContext(): Promise<boolean> {
  const lessons = normalizeLessonTopics(state.draft.lessonTopics);
  if (!centralSourceStore?.currentSession || state.sourceStorageStatus !== "متصل") {
    state.draft.sourceReferences = [];
    state.draft.sourceRetrievalVersion = "";
    state.sourceRetrievalMessage = "المصادر الاختيارية غير متصلة؛ سيستخدم واثق سياق Cambridge العالمي.";
    render();
    return true;
  }
  const eligible = eligibleSourcesForDraft();
  if (!eligible.length) {
    state.draft.sourceReferences = [];
    state.draft.sourceRetrievalVersion = "";
    state.sourceRetrievalMessage = "لا يوجد مصدر مطابق، وهذا لا يمنع التوليد من Cambridge العالمي.";
    render();
    return true;
  }
  state.sourceRetrievalBusy = true;
  state.sourceRetrievalMessage = "جارٍ إضافة سياق اختياري من ملفاتك…";
  render();
  try {
    const chunkGroups = await Promise.all(eligible.map(async (source) => ({ source, chunks: await centralSourceStore.listSourceChunks(source.id) })));
    const candidates: SourceChunkCandidate[] = chunkGroups.flatMap(({ source, chunks }) => chunks.map((chunk) => ({ source, chunk })));
    state.draft.sourceReferences = lessons.flatMap((lesson, lessonIndex) => rankSourceChunks(lesson, candidates, 2).references.map((reference) => ({ ...reference, id: `${reference.id}:topic-${lessonIndex + 1}`, lessonTopic: lesson })));
    state.draft.sourceRetrievalVersion = SOURCE_RETRIEVAL_VERSION;
    state.sourceRetrievalMessage = state.draft.sourceReferences.length
      ? `أضيف ${state.draft.sourceReferences.length} مقطعًا اختياريًا. يظل Cambridge العالمي هو أساس المسار.`
      : "لم أجد مطابقة مفيدة في الملفات، لذلك سيستخدم واثق Cambridge العالمي.";
    scheduleSave();
    return true;
  } catch (error) {
    state.draft.sourceReferences = [];
    state.draft.sourceRetrievalVersion = "";
    state.sourceRetrievalMessage = "تعذر استخدام المصدر الاختياري؛ سيواصل واثق بالمسار العالمي.";
    console.warn(error);
    return true;
  } finally {
    state.sourceRetrievalBusy = false;
    render();
  }
}

function bindContentStep(): void {
  document.querySelector<HTMLSelectElement>("#programme-select")?.addEventListener("change", (event) => {
    setCambridgeProgramme(state.draft, (event.target as HTMLSelectElement).value as ExamDraft["programmeId"]);
    invalidateSourceAndGeneratedQuestions(); scheduleSave(); render();
  });
  document.querySelector<HTMLSelectElement>("#stage-select")?.addEventListener("change", (event) => {
    state.draft.grade = Number((event.target as HTMLSelectElement).value);
    invalidateSourceAndGeneratedQuestions(); scheduleSave(); render();
  });
  document.querySelector<HTMLSelectElement>("#subject-select")?.addEventListener("change", (event) => {
    setCambridgeSubject(state.draft, (event.target as HTMLSelectElement).value);
    invalidateSourceAndGeneratedQuestions(); scheduleSave(); render();
  });
  const lessonInput = document.querySelector<HTMLTextAreaElement>("#lesson-topics-input");
  const commit = (): void => {
    if (!lessonInput) return;
    const next = parseLessonInput(lessonInput.value);
    if (next.join("\n") === normalizeLessonTopics(state.draft.lessonTopics).join("\n")) return;
    state.draft.lessonTopics = next; syncDraftTopicFromLessons(state.draft); invalidateSourceAndGeneratedQuestions(); scheduleSave(); render();
  };
  lessonInput?.addEventListener("change", commit); lessonInput?.addEventListener("blur", commit);
  document.querySelectorAll<HTMLButtonElement>("[data-lesson-suggestion]").forEach((button) => button.addEventListener("click", () => {
    const value = button.dataset.lessonSuggestion?.trim(); if (!value) return;
    state.draft.lessonTopics = [...normalizeLessonTopics(state.draft.lessonTopics), value].slice(0, MAX_LESSON_TOPICS);
    syncDraftTopicFromLessons(state.draft); invalidateSourceAndGeneratedQuestions(); scheduleSave(); render();
  }));
}

function syncSetupFieldsFromDom(): void {
  const value = (id: string): string => document.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "";
  const numberValue = (id: string, fallback: number): number => {
    const raw = Number(value(id));
    return Number.isFinite(raw) ? raw : fallback;
  };
  state.draft.examDate = value("date-input") || state.draft.examDate;
  state.draft.school = value("school-input");
  state.draft.academicYear = value("academic-year-input") || state.draft.academicYear;
  state.draft.durationMinutes = numberValue("duration-input", state.draft.durationMinutes);
  state.draft.totalMarks = numberValue("marks-input", state.draft.totalMarks);
}

function bindSetupStep(): void {
  document.querySelector<HTMLSelectElement>("#exam-title-select")?.addEventListener("change", (event) => {
    const title = (event.target as HTMLSelectElement).value as ExamTitleOption;
    setExamTitle(state.draft, title);
    state.questionGenerationMessage = "";
    scheduleSave();
    render();
  });

  const inputBindings: Array<[string, keyof Pick<ExamDraft, "examDate" | "school" | "academicYear">]> = [
    ["date-input", "examDate"],
    ["school-input", "school"],
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
  const suggestion = validateExamSetup(state.draft).suggestedCounts;
  if (!suggestion) return;
  state.draft.counts = suggestion;
  invalidateGeneratedQuestions(); scheduleSave(); render();
}

function bindPlanStep(): void {
  document.querySelectorAll<HTMLInputElement>("[data-plan-id]").forEach((input) => {
    input.addEventListener("change", () => {
      if (state.draft.status === "معتمد") return;
      const planId = input.dataset.planId;
      if (!planId) return;
      state.draft.selectedProposalByPlanItem[planId] = input.value;
      invalidateVisualJobForPlanItem(planId);
      scheduleSave();
      render();
      window.setTimeout(() => { void syncVisualJobs(true); }, 0);
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

  document.querySelectorAll<HTMLElement>("[data-generation-retry]").forEach((button) => {
    button.addEventListener("click", () => {
      const itemId = button.dataset.generationRetry;
      if (itemId) void retryGenerationItem(itemId);
    });
  });

  document.querySelector<HTMLElement>("[data-generation-resume]")?.addEventListener("click", () => {
    void generateQuestionsForPlan(state.draft.plan);
  });

  document.querySelector<HTMLElement>("[data-generation-cancel]")?.addEventListener("click", () => {
    void cancelProgressiveGeneration();
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
  bindSourceTextInput("source-url", "url");

  document.querySelector<HTMLSelectElement>("#source-kind")?.addEventListener("change", (event) => {
    state.sourceDraft.kind = (event.target as HTMLSelectElement).value as SourceDraft["kind"];
    render();
  });
  document.querySelector<HTMLSelectElement>("#source-grade")?.addEventListener("change", (event) => {
    const value = (event.target as HTMLSelectElement).value;
    state.sourceDraft.grade = value ? Number(value) : null;
    const programme = state.sourceDraft.grade === 10 ? "igcse" : state.sourceDraft.grade && state.sourceDraft.grade >= 7 ? "lower_secondary" : "primary";
    const subjectStillValid = SUBJECTS.some(
      (subject) => subject.id === state.sourceDraft.subjectId && subject.programmes.includes(programme),
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
    if (file && !state.sourceDraft.title.trim()) {
      state.sourceDraft.title = file.name.replace(/\.pdf$/iu, "").replace(/[_-]+/g, " ").trim();
    }
    state.sourceUploadMessage = file ? `جاهز للفهرسة: ${file.name}` : "";
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

function bindSourceTextInput(id: string, key: "title" | "url"): void {
  document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener("input", (event) => {
    state.sourceDraft[key] = (event.target as HTMLInputElement).value;
  });
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function saveSourceFromForm(): Promise<void> {
  const validation = validateSourceDraft(state.sourceDraft);
  if (!validation.valid) {
    render();
    showToast(validation.issues[0]?.message ?? "أكمل بيانات المصدر.");
    return;
  }

  const duplicate = findDuplicateSource(state.sources, state.sourceDraft);
  if (duplicate) {
    showToast(`هذا المصدر مسجل بالفعل برقم ${duplicate.catalogCode}.`);
    return;
  }

  if (state.sourceDraft.mode === "url") {
    const source = createManagedSource(state.sourceDraft);
    state.sources = [source, ...state.sources];
    saveSources(state.sources);
    state.sourceFormOpen = false;
    state.sourceDraft = createEmptySourceDraft();
    render();
    if (state.sourceStorageStatus === "متصل") await persistSourcesCentrally([source], "تم حفظ الرابط في السجل المركزي.");
    else showToast("تم حفظ الرابط محليًا، وسيُنقل إلى السجل المركزي بعد تسجيل الدخول.");
    return;
  }

  if (!centralSourceStore || state.sourceStorageStatus !== "متصل") {
    showToast("سجّل دخول مالك المنصة أولًا لإضافة المصدر إلى المكتبة المركزية.");
    return;
  }
  if (!state.sourceFile) {
    showToast("اختر ملف PDF قبل الإضافة.");
    return;
  }
  if (state.sourceIndexingId || state.sourceUploadBusy) {
    showToast("انتظر اكتمال فهرسة المصدر الحالي أولًا.");
    return;
  }

  const file = state.sourceFile;
  const now = new Date().toISOString();
  const source = {
    ...createManagedSource(state.sourceDraft),
    contentFingerprint: await sha256Hex(file),
    fileSizeBytes: file.size,
    mimeType: file.type || "application/pdf",
    extractionStatus: "جارٍ الاستخراج" as const,
    extractionMessage: "جارٍ قراءة PDF مباشرة من جهازك…",
    updatedAt: now,
  };
  const contentDuplicate = findDuplicateContentSource(state.sources, source.contentFingerprint);
  if (contentDuplicate) {
    showToast(`هذا الملف موجود بالفعل باسم «${contentDuplicate.title}».`);
    return;
  }

  state.sourceUploadBusy = true;
  state.sourceUploadProgress = 5;
  state.sourceUploadMessage = "جارٍ تسجيل المصدر وفهرسة PDF مباشرة…";
  state.sourceIndexingId = source.id;
  state.sourceIndexingProgress = 5;
  state.sourceIndexingMessage = "جارٍ قراءة PDF مباشرة من جهازك…";
  state.sources = [source, ...state.sources];
  saveSources(state.sources);
  render();

  try {
    await centralSourceStore.upsertSources([source]);
    let result = await extractPdfText(file, updateSourceIndexingProgress);
    if (result.requiresOcr) {
      state.sourceIndexingProgress = 35;
      state.sourceIndexingMessage = "الصفحات مصورة؛ جارٍ تشغيل OCR العربي تلقائيًا…";
      render();
      await centralSourceStore.clearOcrPages(source.id);
      await centralSourceStore.updateExtractionState(
        source.id,
        "جارٍ الاستخراج",
        "جارٍ تشغيل OCR العربي تلقائيًا داخل واثق.",
        "gemini-ocr-pending-1",
      );
      result = await extractPdfWithArabicOcr(
        source.id,
        file,
        [],
        ({ sourceId, pageNumber, totalPages, image }) => centralSourceStore.ocrSourcePage(sourceId, pageNumber, totalPages, image),
        updateSourceIndexingProgress,
      );
    }

    state.sourceIndexingProgress = 96;
    state.sourceIndexingMessage = result.requiresOcr
      ? "لم يجتز النص المستخرج بوابة الجودة؛ يحتاج ملفًا أوضح."
      : `جارٍ حفظ ${result.chunks.length} مقطعًا في مكتبة واثق…`;
    render();
    const saved = await centralSourceStore.saveSourceExtraction(source.id, result);
    const remoteSources = await centralSourceStore.listSources();
    state.sources = remoteSources;
    saveSources(remoteSources);
    state.sourceUploadProgress = 100;
    state.sourceUploadMessage = "اكتملت إضافة المصدر.";
    state.sourceIndexingProgress = 100;
    state.sourceIndexingMessage = saved.requiresOcr
      ? "تعذر الحصول على نص موثوق من هذا الملف."
      : `اكتملت الفهرسة: ${saved.pageCount} صفحة و${saved.chunkCount} مقطع.`;
    state.sourceFormOpen = false;
    state.sourceFile = null;
    state.sourceDraft = createEmptySourceDraft();
    render();
    showToast(state.sourceIndexingMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر فهرسة ملف PDF.";
    await centralSourceStore.updateExtractionState(source.id, "فشل", message).catch(() => undefined);
    const remoteSources = await centralSourceStore.listSources().catch(() => null);
    if (remoteSources) { state.sources = remoteSources; saveSources(remoteSources); }
    state.sourceUploadMessage = message;
    state.sourceIndexingMessage = message;
    render();
    showToast(message);
  } finally {
    state.sourceUploadBusy = false;
    window.setTimeout(() => {
      if (state.sourceIndexingId === source.id) {
        state.sourceIndexingId = "";
        state.sourceIndexingProgress = 0;
        state.sourceIndexingMessage = "";
        state.sourceUploadProgress = 0;
        state.sourceUploadMessage = "";
        render();
      }
    }, 900);
  }
}

function updateSourceIndexingProgress(progress: PdfExtractionProgress): void {
  state.sourceUploadProgress = progress.percent;
  state.sourceUploadMessage = progress.message;
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
  updateSourceStatus(sourceId, "مؤرشف", "تمت أرشفة المصدر داخل واثق دون حذف بياناته المفهرسة.");
}

async function restoreSource(sourceId: string): Promise<void> {
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source) return;
  const targetStatus: SourceStatus = source.extractionStatus === "مكتمل" ? "مفهرس" : "جاهز للفهرسة";
  updateSourceStatus(sourceId, targetStatus, "تمت استعادة المصدر إلى المكتبة.");
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
  assessmentGenerationOrchestrator?.stop();
  state.questionGenerationBusy = false;
  state.questionGenerationMessage = state.draft.generationRunId && !isPlanComplete(state.draft)
    ? "توقف التنسيق المحلي بعد تسجيل الخروج. ستبقى النتائج المحفوظة خادميًا ويمكن استكمال الدورة بعد تسجيل الدخول."
    : "";
  state.sourceStorageBusy = true;
  render();
  await centralSourceStore.signOut();
  state.sourceStorageStatus = "يتطلب تسجيل الدخول";
  state.sourceStorageMessage = "تم تسجيل الخروج. تبقى النسخة المحلية متاحة على هذا الجهاز.";
  state.sourceStorageBusy = false;
  state.ownerEmail = "";
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
    if (state.draft.currentStep >= 3) {
      if (!isPlanComplete(state.draft) && state.draft.plan.length) {
        window.setTimeout(() => { void generateQuestionsForPlan(state.draft.plan); }, 0);
      }
      scheduleRequiredVisualJobSync();
    }
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

function markCentralStorageError(error: unknown): void {
  state.sourceStorageStatus = "خطأ";
  state.sourceStorageMessage = error instanceof Error ? error.message : "تعذر الاتصال بالتخزين المركزي.";
  state.sourceStorageBusy = false;
  render();
  showToast("تعذر الحفظ المركزي؛ احتُفظ بالنسخة المحلية.");
}

async function bootstrapCentralStorage(): Promise<void> {
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
