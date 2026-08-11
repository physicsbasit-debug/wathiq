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
import { clearDraft, loadDraft, loadDrafts, loadProfile, saveDraft, saveProfile, setActiveDraftId } from "./storage.js";
import type { ExamDraft, ExamTitleOption, PlanItem, QuestionVisualJobSnapshot, ViewName, WizardStep } from "./types.js";
import { escapeHtml, formatArabicDate, icon } from "./ui.js";
import { questionVisualAssetRequirement, questionVisualTypeLabel, renderQuestionVisualSvg, stripQuestionVisualIllustration, validateQuestionVisualSpec } from "./question-visual.js";
import { buildStandaloneExamDocument, downloadWordHtml, interleaveAssessmentItems, printHtmlDocument, safeExportFileName } from "./exam-export.js";
import { getRuntimeConfig, isCentralStorageConfigured } from "./runtime-config.js";
import { OwnerSessionService } from "./owner-session.js";
import { resolveInitialView, viewFromHash, viewHash } from "./navigation.js";
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
import { EXAM_TITLE_OPTIONS, assessmentSpecification } from "./cambridge-assessment.js";
import {
  CAMBRIDGE_LEVEL_OPTIONS,
  curriculumDisplayName,
  isStageValidForProgramme,
  levelOptionForValue,
  levelSelectionValue,
  stageLabel,
  subjectsForProgramme,
  topicsForSelection,
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
  authStatus: "غير مهيأ" | "يتطلب تسجيل الدخول" | "متصل" | "خطأ";
  authMessage: string;
  authBusy: boolean;
  userEmail: string;
  questionGenerationBusy: boolean;
  questionGenerationMessage: string;
  assessmentGenerationRun: AssessmentGenerationRunSnapshot | null;
  visualJobSyncBusy: boolean;
}

const runtimeConfig = getRuntimeConfig();
const ownerSessionService = isCentralStorageConfigured(runtimeConfig)
  ? new OwnerSessionService(runtimeConfig)
  : null;
const assessmentGenerationJobService = ownerSessionService
  ? new AssessmentGenerationJobService(runtimeConfig, () => ownerSessionService.getActiveSession())
  : null;
const assessmentGenerationWorkerService = ownerSessionService
  ? new AssessmentGenerationWorkerService(runtimeConfig, () => ownerSessionService.getActiveSession())
  : null;
let assessmentGenerationOrchestrator = assessmentGenerationJobService && assessmentGenerationWorkerService
  ? new ProgressiveAssessmentGenerationOrchestrator(assessmentGenerationJobService, assessmentGenerationWorkerService, { concurrency: 2 })
  : null;
const visualJobService = ownerSessionService
  ? new VisualJobService(runtimeConfig, () => ownerSessionService.getActiveSession())
  : null;

const savedDraft = loadDraft();
const savedProfile = loadProfile();
const initialDraft = savedDraft ?? createEmptyDraft();
if (savedProfile) initialDraft.school = savedProfile.school;

const initialView = resolveInitialView(window.location.hash, window.sessionStorage.getItem(ACTIVE_VIEW_STORAGE_KEY));

const state: AppState = {
  view: initialView,
  draft: initialDraft,
  saveState: savedDraft ? "محفوظ" : "غير محفوظ",
  libraryFilter: "الكل",
  toast: "",
  authStatus: ownerSessionService ? "يتطلب تسجيل الدخول" : "غير مهيأ",
  authMessage: ownerSessionService
    ? "سجّل الدخول مرة واحدة لتفعيل التوليد والحفظ السحابي للمهام."
    : "إعداد Supabase غير مكتمل؛ التوليد السحابي غير متاح بعد.",
  authBusy: false,
  userEmail: "",
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

function userFacingError(error: unknown, fallback: string): string {
  if (error instanceof Error && /[\u0600-\u06FF]/u.test(error.message)) return error.message;
  return fallback;
}

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
      const detail = userFacingError(error, "تعذر الوصول إلى تخزين المتصفح.");
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

function invalidateCurriculumSelection(): void {
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
        <span><strong>واثق</strong><small>اختبارات علوم كامبريدج ببساطة</small></span>
      </button>
      <nav class="desktop-nav" aria-label="التنقل الرئيسي">
        ${navButton("home", "الرئيسية", "home")}
        ${navButton("wizard", "اختبار جديد", "plus")}
        ${navButton("library", "اختباراتي", "files")}
      </nav>
      <div class="header-actions">
        <span class="session-chip ${state.authStatus === "متصل" ? "connected" : ""}">${state.authStatus === "متصل" ? "متصل" : "غير متصل"}</span>
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
  return `<nav class="mobile-nav" aria-label="التنقل للجوال">
    ${navButton("home", "الرئيسية", "home")}
    ${navButton("wizard", "جديد", "plus")}
    ${navButton("library", "اختباراتي", "files")}
  </nav>`;
}

function renderView(): string {
  if (state.view === "wizard") return renderWizard();
  if (state.view === "library") return renderLibrary();
  return renderHome();
}

function renderSessionPanel(): string {
  if (!ownerSessionService) {
    return `<section class="account-panel warning"><div><strong>التوليد السحابي غير مهيأ</strong><p>${escapeHtml(state.authMessage)}</p></div></section>`;
  }
  if (state.authStatus === "متصل") {
    return `<section class="account-panel connected"><div><strong>واثق جاهز للتوليد</strong><p>تم تسجيل الدخول${state.userEmail ? ` بالحساب <b dir="ltr">${escapeHtml(state.userEmail)}</b>` : ""}.</p></div><button class="ghost-btn compact" data-action="sign-out">تسجيل الخروج</button></section>`;
  }
  return `<section class="account-panel"><div><strong>تسجيل دخول واثق</strong><p>${escapeHtml(state.authMessage)}</p></div><div class="account-login-grid"><label class="field"><span>البريد الإلكتروني</span><input id="account-email" type="email" autocomplete="username"/></label><label class="field"><span>كلمة المرور</span><input id="account-password" type="password" autocomplete="current-password"/></label><button class="primary-btn" data-action="sign-in" ${state.authBusy ? "disabled" : ""}>${state.authBusy ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}</button></div></section>`;
}

function renderHome(): string {
  const hasDraft = Boolean(loadDraft());
  return `
    <section class="hero-panel">
      <div class="hero-copy">
        <span class="eyebrow">علوم كامبريدج: المرحلة الابتدائية · المرحلة الإعدادية · الشهادة الدولية العامة للتعليم الثانوي</span>
        <h1>اسم الموضوع يكفي.</h1>
        <p>اختر الصف ثم مادة العلوم والموضوع. واثق يبني الاختبار وفق جدول المواصفات، ويؤلف كل مفردة بحرية ثم يراجعها علميًا وتقويميًا.</p>
        <div class="hero-actions">
          <button class="primary-btn" data-action="new-exam">${icon("plus")} إنشاء اختبار</button>
          ${hasDraft ? `<button class="secondary-btn" data-action="resume-draft">متابعة المسودة ${icon("arrow")}</button>` : ""}
        </div>
      </div>
      <div class="confidence-card"><div class="confidence-score">واثق</div><ul>
        <li>${icon("check")} علوم كامبريدج للمرحلة الابتدائية 0097 · المراحل 1–6</li>
        <li>${icon("check")} علوم كامبريدج للمرحلة الإعدادية 0893 · المراحل 7–9</li>
        <li>${icon("check")} علوم كامبريدج للشهادة الدولية: الفيزياء والكيمياء والأحياء والعلوم</li>
        <li>${icon("check")} مؤلف ذكي مستقل + مراجع علمي مستقل</li>
      </ul></div>
    </section>
    ${renderSessionPanel()}
    <section class="dashboard-grid two-actions">
      <article class="action-card featured"><span class="card-icon">${icon("plus")}</span><div><h2>اختبار جديد</h2><p>صف، مادة، موضوع. جدول المواصفات يضبط الاختبار تلقائيًا.</p></div><button class="card-link" data-action="new-exam">ابدأ الآن ${icon("arrow")}</button></article>
      <article class="action-card"><span class="card-icon">${icon("files")}</span><div><h2>اختباراتي</h2><p>المسودات والاختبارات المعتمدة في مكان واحد.</p></div><button class="card-link" data-nav="library">فتح المكتبة ${icon("arrow")}</button></article>
    </section>
  `;
}

function renderWizard(): string {
  const resumeLabel = state.draft.currentStep > 1 || state.draft.plan.length ? "متابعة المسودة المحفوظة" : "إنشاء اختبار جديد";
  return `
    <section class="page-heading">
      <div><span class="eyebrow">${resumeLabel}</span><h1>${wizardTitle(state.draft.currentStep)}</h1></div>
      <div class="save-indicator"><span class="dot"></span><span id="save-label-secondary">${state.saveState}</span></div>
    </section>
    ${renderStepper()}
    <section class="wizard-shell">${renderWizardStep()}</section>
  `;
}

function wizardTitle(step: WizardStep): string {
  return ({ 1: "حدد المحتوى", 2: "اضبط الاختبار", 3: "اختر الأسئلة", 4: "راجع واعتمد" } as const)[step];
}

function renderStepper(): string {
  const steps: Array<{ id: WizardStep; label: string }> = [
    { id: 1, label: "المحتوى" }, { id: 2, label: "الإعداد" }, { id: 3, label: "الخطة والأسئلة" }, { id: 4, label: "المراجعة" },
  ];
  return `<ol class="stepper" aria-label="مراحل إنشاء الاختبار">${steps.map((step) => {
    const status = state.draft.currentStep === step.id ? "active" : state.draft.currentStep > step.id ? "done" : "";
    return `<li class="${status}"><button data-step="${step.id}" ${(state.draft.currentStep < step.id || (state.draft.status === "معتمد" && step.id < 4)) ? "disabled" : ""}><span>${status === "done" ? icon("check") : step.id}</span><b>${step.label}</b></button></li>`;
  }).join("")}</ol>`;
}

function renderWizardStep(): string {
  switch (state.draft.currentStep) {
    case 1: return renderContentStep();
    case 2: return renderSetupStep();
    case 3: return renderPlanStep();
    case 4: return renderReviewStep();
  }
}

function restoreDraftRuntimeContext(draft: ExamDraft): void {
  assessmentGenerationOrchestrator?.stop();
  state.assessmentGenerationRun = null;
  state.questionGenerationBusy = false;
  state.questionGenerationMessage = draft.generationRunId && !isPlanComplete(draft)
    ? "سيستعيد واثق دورة التوليد السحابية بعد تسجيل الدخول."
    : "";
}

function renderTopicOptions(): string {
  const topics = topicsForSelection(state.draft.programmeId, state.draft.subjectId, state.draft.grade);
  const selected = new Set(normalizeLessonTopics(state.draft.lessonTopics));
  const byStrand = new Map<string, typeof topics>();
  for (const topic of topics) {
    const group = byStrand.get(topic.strand) ?? [];
    group.push(topic);
    byStrand.set(topic.strand, group);
  }
  const groups = [...byStrand.entries()].map(([strand, items]) => `
    <optgroup label="${escapeHtml(strand)}">
      ${items.map((topic) => `<option value="${escapeHtml(topic.label)}" ${selected.has(topic.label) ? "disabled" : ""}>${escapeHtml(topic.label)}</option>`).join("")}
    </optgroup>`).join("");
  return `<option value="">اختر الموضوع أو الدرس</option>${groups}`;
}

function renderSelectedTopics(): string {
  const selected = normalizeLessonTopics(state.draft.lessonTopics);
  if (!selected.length) return `<p class="topic-empty-state">لم تختر موضوعًا بعد.</p>`;
  return `<div class="selected-topic-chips" aria-label="الموضوعات المختارة">${selected.map((topic, index) => `
    <span class="selected-topic-chip"><b>${escapeHtml(topic)}</b><button type="button" data-remove-topic="${index}" aria-label="إزالة ${escapeHtml(topic)}">×</button></span>`).join("")}</div>`;
}

function renderContentStep(): string {
  const subjects = subjectsForProgramme(state.draft.programmeId);
  const topics = topicsForSelection(state.draft.programmeId, state.draft.subjectId, state.draft.grade);
  const selectedTopics = normalizeLessonTopics(state.draft.lessonTopics);
  const levelValue = levelSelectionValue(state.draft.programmeId, state.draft.grade);
  const contentReady = isStageValidForProgramme(state.draft.programmeId, state.draft.grade)
    && Boolean(state.draft.subjectId)
    && selectedTopics.length >= MIN_LESSON_TOPICS
    && selectedTopics.length <= MAX_LESSON_TOPICS;
  const currentPath = state.draft.subjectId
    ? curriculumDisplayName(state.draft.programmeId, state.draft.subjectId, state.draft.grade)
    : "اختر المادة لإكمال المسار";
  return `
    <div class="section-intro"><h2>اختر الصف والمادة والموضوع</h2><p>ثلاث خطوات واضحة فقط. يعرض واثق موضوعات علوم كامبريدج المناسبة لاختيارك تلقائيًا.</p></div>
    <div class="curriculum-picker" aria-label="اختيار منهج كامبريدج">
      <label class="field curriculum-picker-step"><span><b>1</b> الصف / المرحلة</span><select id="level-select">${CAMBRIDGE_LEVEL_OPTIONS.map((item) => `<option value="${item.id}" ${levelValue === item.id ? "selected" : ""}>${item.label}</option>`).join("")}</select><small>${escapeHtml(CAMBRIDGE_LEVEL_OPTIONS.find((item) => item.id === levelValue)?.note ?? "")}</small></label>
      <label class="field curriculum-picker-step"><span><b>2</b> المادة</span><select id="subject-select">${state.draft.programmeId === "igcse" ? `<option value="">اختر مادة العلوم</option>` : ""}${subjects.map((item) => `<option value="${item.id}" ${state.draft.subjectId === item.id ? "selected" : ""}>${item.label} · ${item.syllabusCode}</option>`).join("")}</select><small>${state.draft.programmeId === "igcse" ? "اختر مسار العلوم للشهادة الدولية العامة للتعليم الثانوي" : "العلوم هي المادة المعتمدة لهذه المرحلة"}</small></label>
      <label class="field curriculum-picker-step"><span><b>3</b> الموضوع / الدرس</span><select id="topic-select" ${!state.draft.subjectId || !topics.length || selectedTopics.length >= MAX_LESSON_TOPICS ? "disabled" : ""}>${renderTopicOptions()}</select><small>${topics.length ? `متاح ${topics.length} موضوعًا منظمًا حسب محاور المنهج` : "اختر المادة أولًا لعرض الموضوعات"}</small></label>
    </div>
    <section class="topic-selection-panel" aria-labelledby="selected-topics-title">
      <div class="topic-selection-head"><div><span id="selected-topics-title">الموضوعات المختارة</span><small>يمكنك اختيار موضوع واحد أو حتى ${MAX_LESSON_TOPICS} موضوعات للاختبار نفسه.</small></div><b>${selectedTopics.length}/${MAX_LESSON_TOPICS}</b></div>
      <div class="topic-add-row"><button class="secondary-btn topic-add-btn" id="add-topic-btn" type="button" ${!state.draft.subjectId || !topics.length || selectedTopics.length >= MAX_LESSON_TOPICS ? "disabled" : ""}>إضافة الموضوع</button></div>
      ${renderSelectedTopics()}
    </section>
    <section class="curriculum-path-card"><span>المسار الحالي</span><strong>${escapeHtml(currentPath)}</strong><small>القائمة تنظّم موضوعات المنهج حسب المرحلة؛ ترتيب التدريس الفعلي قد يختلف بين المدارس والكتب المعتمدة.</small></section>
    <section class="cambridge-context-card"><div><span class="context-label">السياق العلمي</span><h3>كامبريدج العالمي هو نقطة البداية</h3><p>يبني واثق سياق السؤال من الصف والمادة والموضوع، ثم يراجع الدقة العلمية وملاءمة المستوى قبل اعتماد المفردة.</p></div></section>
    ${renderWizardFooter(1, contentReady)}
  `;
}

function renderAssessmentSpecification(): string {
  const spec = assessmentSpecification(state.draft.grade, state.draft.title);
  const objective = spec.objectiveMarks;
  const difficulty = spec.difficultyMarks;
  const inquiry = spec.scientificInquiryRange;
  return `<section class="assessment-spec-card ${spec.official ? "official" : "internal"}" aria-labelledby="assessment-spec-title">
    <div class="assessment-spec-head"><div><span class="eyebrow">جدول المواصفات</span><h3 id="assessment-spec-title">${spec.official ? "المواصفة الرسمية المعتمدة" : "قالب المرحلة المبكرة"}</h3><p>${escapeHtml(spec.sourceLabel)}</p></div><span class="generation-mode-badge">${spec.totalMarks} درجة · ${spec.operationalItemCount} مفردة</span></div>
    <div class="assessment-spec-metrics">
      <div><span>${spec.durationOfficial ? "زمن الإجابة الرسمي" : "زمن واثق التشغيلي"}</span><strong>${spec.durationMinutes} دقيقة</strong></div>
      <div><span>الاختيار من متعدد</span><strong>${spec.counts.mcq}</strong></div>
      <div><span>الإجابة القصيرة</span><strong>${spec.counts.short}</strong></div>
      <div><span>الإجابة الطويلة</span><strong>${spec.counts.long}</strong></div>
    </div>
    <div class="assessment-spec-grid">
      <div class="assessment-spec-block"><strong>أهداف التقويم</strong><div class="spec-bars"><span>المعرفة <b>${objective.knowledge} (${Math.round(objective.knowledge / spec.totalMarks * 100)}%)</b></span><span>التطبيق <b>${objective.application} (${Math.round(objective.application / spec.totalMarks * 100)}%)</b></span><span>الاستدلال <b>${objective.reasoning} (${Math.round(objective.reasoning / spec.totalMarks * 100)}%)</b></span></div></div>
      ${difficulty ? `<div class="assessment-spec-block"><strong>مستويات الصعوبة</strong><div class="spec-bars"><span>منخفض <b>${difficulty.low} (${Math.round(difficulty.low / spec.totalMarks * 100)}%)</b></span><span>متوسط <b>${difficulty.medium} (${Math.round(difficulty.medium / spec.totalMarks * 100)}%)</b></span><span>مرتفع <b>${difficulty.high} (${Math.round(difficulty.high / spec.totalMarks * 100)}%)</b></span></div></div>` : ""}
    </div>
    ${inquiry ? `<p class="assessment-inquiry-note"><b>الاستقصاء العلمي:</b> النطاق الرسمي ${inquiry[0]}–${inquiry[1]} درجات، ويخصص واثق ${spec.operationalInquiryMarks} درجات داخل الخطة.</p>` : ""}
    <ul class="assessment-spec-notes">${spec.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  </section>`;
}

function renderSetupStep(): string {
  const validation = validateExamSetup(state.draft);
  return `
    <div class="section-intro"><h2>إعداد الاختبار</h2><p>اختر نوع الاختبار فقط؛ الدرجة وعدد المفردات وأهداف التقويم تضبط تلقائيًا من جدول المواصفات.</p></div>
    <div class="form-grid two-columns">
      ${examTitleSelect()}
      ${inputField("date-input", "تاريخ الاختبار", state.draft.examDate, "date")}
      ${inputField("school-input", "المدرسة (اختياري)", state.draft.school, "text")}
      ${inputField("academic-year-input", "العام الدراسي", state.draft.academicYear, "text")}
    </div>
    ${renderAssessmentSpecification()}
    <section class="generation-mode-panel progressive-engine-panel"><div class="generation-mode-heading"><div><span class="eyebrow">محرك الجودة</span><h3>تأليف حر داخل جدول المواصفات</h3></div><span class="generation-mode-badge">كامبريدج + المواصفة الرسمية</span></div><div class="progressive-engine-summary">
      <div><strong>المواصفة تحكم القياس</strong><small>الدرجة، أنواع المفردات، المعرفة والتطبيق والاستدلال، والصعوبة حيث تفرضها الوثيقة.</small></div>
      <div><strong>المؤلف حر في الصياغة</strong><small>لا قوالب قديمة تحدد السيناريو أو شكل السؤال.</small></div>
      <div><strong>المراجع يحكم على العلم</strong><small>يفحص الدقة وملاءمة المرحلة ونموذج التصحيح ويعيد الكتابة عند الحاجة.</small></div>
    </div></section>
    <div class="quality-policy-card visual-enhancement-card enabled durable-visual-policy"><span class="quality-policy-check">${icon("check")}</span><span><strong>مرئيات علمية ثنائية الأبعاد فقط عند الحاجة</strong><small>لا رسم خطي احتياطي. الجداول والرسوم البيانية الرقمية تبقى حتمية لضمان الدقة.</small></span></div>
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

function renderCompliance(validation: ReturnType<typeof validateExamSetup>): string {
  if (validation.valid) return `<div class="compliance success">${icon("check")}<div><strong>جاهز للتوليد</strong><p>${escapeHtml(curriculumDisplayName(state.draft.programmeId, state.draft.subjectId, state.draft.grade))} · جاهز للتأليف مباشرة.</p></div></div>`;
  return `<div class="compliance warning"><div class="warning-mark">!</div><div><strong>اضبط هذه البيانات</strong><ul>${validation.issues.map((issue) => `<li>${escapeHtml(issue.message)}</li>`).join("")}</ul></div></div>`;
}

function generationItemStatusLabel(status: AssessmentGenerationItemSnapshot["status"] | "pending"): string {
  const labels: Record<AssessmentGenerationItemSnapshot["status"] | "pending", string> = {
    pending: "بانتظار إنشاء الدورة",
    queued: "في طابور التوليد",
    grounding: "يبني سياق كامبريدج",
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
  const generationLabel = state.draft.generatedAt
    ? `اكتمل التوليد في ${formatArabicDate(state.draft.generatedAt.slice(0, 10))}.`
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
  if (job.status === "generating") return `يجري توليد الأصل البصري ثنائية الأبعاد، المحاولة ${job.attemptCount} من ${job.maxAttempts}.`;
  if (job.status === "validating") return "تم توليد الصورة ويجري الآن فحصها علميًا وبصريًا.";
  if (job.status === "retry_pending") return job.errorMessage || "سيعيد واثق محاولة الصورة تلقائيًا.";
  if (job.status === "ready") return "اكتمل الأصل البصري واعتمد علميًا، وهو المستخدم في المعاينة ومستند وورد وبي دي إف.";
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
      ? "صورة تعليمية ثنائية الأبعاد معتمدة"
      : pending
        ? "مهمة بصرية دائمة قيد التنفيذ"
        : failed
          ? "فشل الأصل البصري المطلوب"
          : "أصل بصري مطلوب قبل الاعتماد";
  const controls = !compact && requirement.required ? `<div class="visual-action-row">
    <button class="secondary-btn compact" data-action="${ready ? "regenerate-visual-job" : failed ? "retry-visual-job" : "sync-visual-job"}" data-plan-id="${escapeHtml(item.id)}" ${(pending || state.draft.status === "معتمد" || state.visualJobSyncBusy) ? "disabled" : ""}>${icon("spark")} ${pending ? "جارٍ التنفيذ…" : ready ? "إعادة توليد الأصل" : failed ? "إعادة المحاولة" : "إنشاء الأصل بصري ثنائي الأبعاد"}</button>
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
  const sourceLabel = curriculumDisplayName(state.draft.programmeId, state.draft.subjectId, state.draft.grade);
  const task = generationItemSnapshot(item.id);
  const status = task?.status ?? (item.proposals.length ? "ready" : "pending");
  const proposals = item.proposals.length
    ? `<div class="proposal-grid">${item.proposals.map((proposal, proposalIndex) => {
      const selected = chosen === proposal.id || item.proposals.length === 1;
      const hasMultipleProposals = item.proposals.length > 1;
      return `<${hasMultipleProposals ? "label" : "div"} class="proposal-card ${selected ? "selected" : ""} ${hasMultipleProposals ? "" : "progressive-single-proposal"}">${hasMultipleProposals ? `<input type="radio" name="proposal-${item.id}" data-plan-id="${item.id}" value="${proposal.id}" ${selected ? "checked" : ""} ${state.draft.status === "معتمد" ? "disabled" : ""}/>` : ""}<div class="proposal-top"><span>${hasMultipleProposals ? `البديل ${proposalIndex + 1}` : "المفردة المعتمدة من المحرك"}</span><div class="proposal-badges"><b class="generation-item-badge ${generationItemStatusClass(status)}">${escapeHtml(generationItemStatusLabel(status))}</b>${false ? `<b class="review-needed-badge">يحتاج تدقيقًا أدق</b>` : ""}</div></div>${proposal.stimulus ? `<div class="proposal-stimulus">${escapeHtml(proposal.stimulus)}</div>` : ""}<p>${escapeHtml(proposal.text)}</p>${renderProposalOptions(proposal.options)}<details class="proposal-evidence"><summary>الإجابة ونموذج التصحيح والمراجعة العلمية</summary><p class="proposal-answer"><strong>الإجابة:</strong> ${escapeHtml(proposal.answer)}</p>${renderMarkScheme(proposal.markScheme)}${proposal.rationale ? `<p><strong>سبب الإجابة:</strong> ${escapeHtml(proposal.rationale)}</p>` : ""}${proposal.reviewSupport ? `<blockquote>${escapeHtml(proposal.reviewSupport)}</blockquote>` : ""}</details>${hasMultipleProposals ? `<span class="choose-label">${selected ? `${icon("check")} تم الاختيار` : "اختر هذا السؤال"}</span>` : `<span class="choose-label">${icon("check")} حُفظت خادميًا واختيرت تلقائيًا</span>`}</${hasMultipleProposals ? "label" : "div"}>`;
    }).join("")}</div>`
    : renderGenerationPlaceholder(item);
  const footer = task?.status === "failed"
    ? `<footer><button class="text-btn" data-generation-retry="${escapeHtml(task.id)}" ${state.questionGenerationBusy ? "disabled" : ""}>${icon("spark")} إعادة هذه المفردة فقط</button></footer>`
    : item.proposals.length
      ? `<footer class="generation-item-footer"><span>${icon("check")} محفوظة داخل دورة التوليد الدائمة</span>${task?.stageTimings.totalMs ? `<small>${Math.max(1, Math.round(task.stageTimings.totalMs / 1000))} ثانية</small>` : ""}</footer>`
      : "";
  return `<article class="plan-card generation-plan-card ${generationItemStatusClass(status)}">
    <header><div class="question-number">${index + 1}</div><div><h3>${item.questionType}</h3><p>${escapeHtml(item.lessonLabel)} · ${escapeHtml(sourceLabel)}</p></div><div class="plan-tags"><span>${item.cognitiveLevel}</span>${item.difficultyLevel ? `<span>${item.difficultyLevel} الصعوبة</span>` : ""}${item.assessmentFocus ? `<span>${item.assessmentFocus}</span>` : ""}<span>${item.marks} ${item.marks === 1 ? "درجة" : "درجات"}</span></div></header>
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
    const label = labels.get(item.id) ?? "؟";
    const headClass = exportMode ? "teacher-key-head" : "answer-key-head";
    const curriculum = curriculumDisplayName(state.draft.programmeId, state.draft.subjectId, state.draft.grade);
    return `<article><div class="${headClass}"><strong>${escapeHtml(label)}) ${escapeHtml(proposal.answer)}</strong></div>${renderPlanVisual(item, true)}${renderMarkScheme(proposal.markScheme)}${proposal.rationale ? `<p>${escapeHtml(proposal.rationale)}</p>` : ""}<small>${escapeHtml(curriculum)} · ${escapeHtml(item.lessonLabel)}</small>${proposal.reviewSupport ? `<blockquote>${escapeHtml(proposal.reviewSupport)}</blockquote>` : ""}</article>`;
  }).join("");
}

function renderAnswerKey(selected: SelectedPaperItem[], labels: Map<string, string>): string {
  return `<details class="answer-key"><summary>نموذج الإجابة والمراجعة العلمية</summary>${renderAnswerKeyArticles(selected, labels)}</details>`;
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
    { label: "هوية كامبريدج", okay: Boolean(state.draft.programmeId && state.draft.syllabusCode && state.draft.subjectId) },
    { label: "مجموع الدرجات", okay: markTotal === state.draft.totalMarks },
    { label: "اختيار مفردات الخطة", okay: isPlanComplete(state.draft) },
    { label: "توليد كامبريدج الحالي", okay: groundedGeneration },
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
      showToast(approved ? "تم تجهيز مستند وورد للتنزيل بعد التحقق من جميع الأصول البصرية." : "تم تجهيز نسخة مسودة غير معتمدة للمراجعة.");
      return;
    }
    if (!printHtmlDocument(document.fileName, document.html)) {
      showToast("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
    }
  } catch (error) {
    showToast(userFacingError(error, "تعذر تجهيز التصدير."));
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
        <section class="export-panel"><h3>${approved ? "التصدير النهائي" : "تصدير نسخة مسودة للمراجعة"}</h3><div class="export-grid"><button class="secondary-btn" data-action="export-student-word">ورقة الطالب بصيغة وورد (.doc)</button><button class="secondary-btn" data-action="export-student-pdf">ورقة الطالب بي دي إف / طباعة</button><button class="secondary-btn" data-action="export-answer-word">نموذج الإجابة بصيغة وورد (.doc)</button><button class="secondary-btn" data-action="export-answer-pdf">نموذج الإجابة بي دي إف / طباعة</button></div></section>
        ${approved
          ? `<button class="secondary-btn full approval-toggle" data-action="reopen-draft">إلغاء الاعتماد للتعديل</button>`
          : `<button class="primary-btn full approval-toggle" data-action="approve-draft" ${readiness.ready ? "" : "disabled"}>${icon("check")} اعتماد الاختبار</button>`}
        <button class="secondary-btn full" data-action="save-now">${icon("save")} حفظ ${approved ? "الاختبار" : "المسودة"}</button>
        <p class="muted-note">${approved ? "تم قفل التعديل وتفعيل نسخ وورد وبي دي إف. ألغِ الاعتماد فقط عند الحاجة إلى تعديل فعلي." : "الأسئلة تحتاج مراجعة المعلم قبل الاستخدام. راجع الصياغة والرسومات ونموذج التصحيح، ثم اعتمد الاختبار لتفعيل التصدير النهائي."}</p>
      </aside>
    </div>
    ${renderWizardFooter(4, true)}
  `;
}

function checkRow(label: string, okay: boolean): string {
  return `<div class="check-row"><span>${okay ? icon("check") : "!"}</span><b>${label}</b><small>${okay ? "سليم" : "يحتاج مراجعة"}</small></div>`;
}

function renderWizardFooter(step: WizardStep, canContinue = true): string {
  const generating = (step === 2 || step === 3) && state.questionGenerationBusy;
  const nextLabel = generating ? "جارٍ إنشاء الأسئلة…" : `التالي ${icon("arrow")}`;
  return `<footer class="wizard-footer">${step > 1 ? `<button class="secondary-btn" data-action="previous-step" ${(generating || state.draft.status === "معتمد") ? "disabled" : ""}>السابق</button>` : `<button class="secondary-btn" data-nav="home">إلغاء</button>`}<div>${step < 4 ? `<button class="primary-btn" data-action="next-step" ${canContinue && !generating ? "" : "disabled"}>${nextLabel}</button>` : `<button class="secondary-btn" data-nav="library">الذهاب إلى اختباراتي</button>`}</div></footer>`;
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
  const exportActions = `<button class="secondary-btn compact"${draftAttr} data-action="library-export-student-word">الطالب بصيغة وورد</button>
         <button class="secondary-btn compact"${draftAttr} data-action="library-export-student-pdf">الطالب بي دي إف</button>
         <button class="secondary-btn compact"${draftAttr} data-action="library-export-answer-word">الإجابة بصيغة وورد</button>
         <button class="secondary-btn compact"${draftAttr} data-action="library-export-answer-pdf">الإجابة بي دي إف</button>`;
  const actions = exam.status === "مسودة"
    ? exam.isComplete
      ? `<button class="primary-btn compact"${draftAttr} data-action="preview-library-exam">معاينة المسودة</button><button class="secondary-btn compact"${draftAttr} data-action="resume-draft">متابعة التعديل</button>${exportActions}<button class="ghost-btn compact"${draftAttr} data-action="delete-draft">حذف</button>`
      : `<button class="primary-btn compact"${draftAttr} data-action="resume-draft">متابعة</button><button class="ghost-btn compact"${draftAttr} data-action="delete-draft">حذف</button>`
    : `<button class="primary-btn compact"${draftAttr} data-action="preview-library-exam">معاينة الاختبار</button>${exportActions}`;
  return `<article class="exam-card" data-search-text="${escapeHtml(`${exam.title} ${exam.subject} ${exam.grade}`)}"><div class="exam-card-head"><span class="status-badge ${exam.status === "معتمد" ? "approved" : "draft"}">${exam.status}</span></div><h2>${escapeHtml(exam.title)}</h2><p>${escapeHtml(exam.subject)} · ${exam.grade ? `المرحلة ${exam.grade}` : "كامبريدج"}</p><div class="exam-meta"><span>${formatArabicDate(exam.date)}</span>${exam.progress ? `<span>${exam.progress}% مكتمل</span>` : ""}</div>${exam.progress ? `<div class="progress-track"><span style="width:${exam.progress}%"></span></div>` : ""}<div class="exam-actions library-exam-actions">${actions}</div></article>`;
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
}

function handleAction(action: string, element: HTMLElement): void {
  const requestedDraftId = element.dataset.draftId ?? "";
  if (action === "new-exam") {
    persistDraftCheckpoint(false);
    const profile = loadProfile();
    state.draft = createEmptyDraft();
    state.questionGenerationBusy = false;
    state.questionGenerationMessage = "";
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
    if (loaded.currentStep >= 3 && state.authStatus === "متصل") {
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
    stopVisualJobPolling();
    showToast("تم حذف المسودة المحلية.");
    return;
  }
  if (action === "sign-in") {
    void signInUser();
    return;
  }
  if (action === "sign-out") {
    void signOutUser();
    return;
  }
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
  if (state.authStatus !== "متصل" || state.draft.grade === null) return "";
  // هوية الحاجة البصرية لا تتغير عند وصول الأصل؛ هذا يمنع إعادة enqueue بعد الجاهزية.
  return requiredVisualJobItems(state.draft, visualJobSubject())
    .map((item) => `${item.planItemId}:${item.requiredMode}`)
    .sort()
    .join("|");
}

function scheduleRequiredVisualJobSync(): void {
  if (!visualJobService || state.authStatus !== "متصل" || state.draft.grade === null) return;
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
  // A temporary network/session/race failure must not silently lose the required ثنائية الأبعاد task.
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
  if (!hasPendingVisualJobs() || !visualJobService || state.authStatus !== "متصل") return;
  const draftId = state.draft.id;
  visualJobPollTimer = window.setTimeout(() => {
    visualJobPollTimer = undefined;
    if (state.draft.id !== draftId) return;
    void syncVisualJobs(false);
  }, VISUAL_JOB_POLL_INTERVAL_MS);
}

async function syncVisualJobs(enqueueRequired: boolean): Promise<boolean> {
  if (!visualJobService || !ownerSessionService?.currentSession || state.authStatus !== "متصل" || state.draft.grade === null) return false;
  if (state.visualJobSyncBusy) return false;
  state.visualJobSyncBusy = true;
  let synced = false;
  try {
    const jobs = enqueueRequired
      ? await visualJobService.enqueue(state.draft.id, requiredVisualJobItems(state.draft, visualJobSubject()))
      : await visualJobService.list(state.draft.id);
    applyVisualJobSnapshots(jobs);
    state.questionGenerationMessage = jobs.some((job) => isVisualJobPending(job.status))
      ? "تم حفظ مهام المرئيات في التخزين السحابي، ويستمر تنفيذها حتى لو غادرت الصفحة."
      : jobs.some((job) => job.status === "failed")
        ? "اكتملت بعض المرئيات وتعذر بعضها؛ افتح المفردة لإعادة المحاولة قبل الاعتماد."
        : jobs.length ? "اكتملت الأصول البصرية المطلوبة واعتمدت علميًا." : state.questionGenerationMessage;
    synced = true;
  } catch (error) {
    state.questionGenerationMessage = userFacingError(error, "تعذر مزامنة مهام المرئيات.");
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
    showToast(userFacingError(error, "تعذر إعادة مهمة الصورة."));
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
      && saved.marks === item.marks;
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
    if (!isStageValidForProgramme(state.draft.programmeId, state.draft.grade) || !state.draft.subjectId || lessons.length < MIN_LESSON_TOPICS || lessons.length > MAX_LESSON_TOPICS) {
      return showToast(`اختر الصف أو المسار، والمادة، ومن ${MIN_LESSON_TOPICS} إلى ${MAX_LESSON_TOPICS} موضوعات.`);
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
        reviewSupport: result.evidence.excerpt,
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
      state.questionGenerationMessage = userFacingError(error, "تعذر تشغيل إحدى مهام التوليد؛ سيحاول واثق استعادتها من الطابور.");
      render();
    },
  };
}

async function buildCurrentProgressivePayload(): Promise<ProgressiveGenerationPayload> {
  const subject = SUBJECTS.find((item) => item.id === state.draft.subjectId)?.label ?? state.draft.subjectId;
  return buildProgressiveGenerationPayload({ draft: state.draft, subject });
}

async function generateQuestionsForPlan(_plan: PlanItem[]): Promise<boolean> {
  if (state.questionGenerationBusy) return false;
  if (!assessmentGenerationJobService || !assessmentGenerationWorkerService || !assessmentGenerationOrchestrator
    || !ownerSessionService?.currentSession || state.authStatus !== "متصل") {
    state.questionGenerationMessage = "سجّل الدخول إلى واثق أولًا لتشغيل التوليد السحابي.";
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
    if (workerHealth.engineSchemaVersion !== 1 || workerHealth.contractVersion !== 4) {
      throw new Error("عامل توليد المفردات المنشور لا يطابق عقد كامبريدج الحالي. أعد نشر وظيفة عامل التوليد ثم أعد المحاولة.");
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
    state.questionGenerationMessage = userFacingError(error, "تعذر تشغيل منظومة التوليد التدريجي.");
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
    state.questionGenerationMessage = userFacingError(error, "تعذر إعادة المفردة الفاشلة.");
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
    showToast(userFacingError(error, "تعذر إلغاء دورة التوليد."));
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


function bindContentStep(): void {
  document.querySelector<HTMLSelectElement>("#level-select")?.addEventListener("change", (event) => {
    const level = levelOptionForValue((event.target as HTMLSelectElement).value);
    if (!level) return;
    const programmeChanged = state.draft.programmeId !== level.programmeId;
    if (programmeChanged) setCambridgeProgramme(state.draft, level.programmeId);
    state.draft.grade = level.stage;
    applyAssessmentPreset(state.draft);
    if (level.programmeId !== "igcse") setCambridgeSubject(state.draft, "science");
    else if (programmeChanged) setCambridgeSubject(state.draft, "");
    state.draft.lessonTopics = [];
    syncDraftTopicFromLessons(state.draft);
    invalidateCurriculumSelection(); scheduleSave(); render();
  });
  document.querySelector<HTMLSelectElement>("#subject-select")?.addEventListener("change", (event) => {
    setCambridgeSubject(state.draft, (event.target as HTMLSelectElement).value);
    state.draft.lessonTopics = [];
    syncDraftTopicFromLessons(state.draft);
    invalidateCurriculumSelection(); scheduleSave(); render();
  });
  document.querySelector<HTMLButtonElement>("#add-topic-btn")?.addEventListener("click", () => {
    const select = document.querySelector<HTMLSelectElement>("#topic-select");
    const value = select?.value.trim() ?? "";
    if (!value) return showToast("اختر موضوعًا من القائمة أولًا.");
    const current = normalizeLessonTopics(state.draft.lessonTopics);
    if (current.includes(value)) return showToast("هذا الموضوع مختار بالفعل.");
    if (current.length >= MAX_LESSON_TOPICS) return showToast(`يمكن اختيار حتى ${MAX_LESSON_TOPICS} موضوعات.`);
    state.draft.lessonTopics = [...current, value];
    syncDraftTopicFromLessons(state.draft); invalidateCurriculumSelection(); scheduleSave(); render();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-remove-topic]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.removeTopic);
    if (!Number.isInteger(index)) return;
    state.draft.lessonTopics = normalizeLessonTopics(state.draft.lessonTopics).filter((_, itemIndex) => itemIndex !== index);
    syncDraftTopicFromLessons(state.draft); invalidateCurriculumSelection(); scheduleSave(); render();
  }));
}

function syncSetupFieldsFromDom(): void {
  const value = (id: string): string => document.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "";
  state.draft.examDate = value("date-input") || state.draft.examDate;
  state.draft.school = value("school-input");
  state.draft.academicYear = value("academic-year-input") || state.draft.academicYear;
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












async function signInUser(): Promise<void> {
  if (!ownerSessionService) return;
  const email = document.querySelector<HTMLInputElement>("#account-email")?.value.trim() ?? "";
  const password = document.querySelector<HTMLInputElement>("#account-password")?.value ?? "";
  if (!email || !password) {
    showToast("أدخل البريد الإلكتروني وكلمة المرور.");
    return;
  }
  state.authBusy = true;
  render();
  try {
    const session = await ownerSessionService.signIn(email, password);
    state.userEmail = session.email;
    state.authStatus = "متصل";
    state.authMessage = "واثق متصل وجاهز للتوليد.";
    state.authBusy = false;
    render();
    showToast("تم تسجيل الدخول إلى واثق.");
  } catch (error) {
    state.authStatus = "يتطلب تسجيل الدخول";
    state.authMessage = userFacingError(error, "تعذر تسجيل الدخول.");
    state.authBusy = false;
    render();
    showToast(state.authMessage);
  }
}

async function signOutUser(): Promise<void> {
  if (!ownerSessionService) return;
  assessmentGenerationOrchestrator?.stop();
  state.questionGenerationBusy = false;
  state.questionGenerationMessage = state.draft.generationRunId && !isPlanComplete(state.draft)
    ? "توقف التنسيق المحلي بعد تسجيل الخروج. يمكن استكمال الدورة بعد تسجيل الدخول."
    : "";
  state.authBusy = true;
  render();
  await ownerSessionService.signOut();
  state.authStatus = "يتطلب تسجيل الدخول";
  state.authMessage = "تم تسجيل الخروج.";
  state.authBusy = false;
  state.userEmail = "";
  render();
}

async function bootstrapSession(): Promise<void> {
  if (!ownerSessionService) {
    render();
    return;
  }
  const session = ownerSessionService.restoreSession();
  if (!session) {
    state.authStatus = "يتطلب تسجيل الدخول";
    render();
    return;
  }
  try {
    const active = await ownerSessionService.getActiveSession();
    state.userEmail = active.email;
    state.authStatus = "متصل";
    state.authMessage = "واثق متصل وجاهز للتوليد.";
    render();
    if (state.draft.currentStep >= 3 && state.draft.generationRunId && !isPlanComplete(state.draft)) {
      window.setTimeout(() => { void generateQuestionsForPlan(state.draft.plan); }, 0);
    } else {
      scheduleRequiredVisualJobSync();
    }
  } catch (error) {
    state.authStatus = "يتطلب تسجيل الدخول";
    state.authMessage = userFacingError(error, "انتهت الجلسة. سجّل الدخول من جديد.");
    state.userEmail = "";
    render();
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
void bootstrapSession();
