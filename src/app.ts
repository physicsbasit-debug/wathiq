import { MOCK_LIBRARY, MOCK_SOURCES, SUBJECTS } from "./data.js";
import {
  buildPlan,
  createEmptyDraft,
  generateProposals,
  isPlanComplete,
  selectedProposal,
  validateExamSetup,
} from "./domain.js";
import { clearDraft, loadDraft, loadProfile, loadSources, saveDraft, saveProfile, saveSources } from "./storage.js";
import type { ExamDraft, ManagedSource, PlanItem, QuestionCounts, SourceDraft, SourceStatus, SourceExtractionResult, SourceStructureExtractionResult, SourceStructureNode, SourceStructureNodeType, ViewName, WizardStep } from "./types.js";
import { escapeHtml, formatArabicDate, icon } from "./ui.js";
import { buildSourceDrivePath, changeSourceStatus, createEmptySourceDraft, createManagedSource, findDuplicateContentSource, findDuplicateSource, sourceSubjectLabel, SOURCE_KINDS, SOURCE_SEMESTERS, validateSourceDraft } from "./source-domain.js";
import { createRegistryBackup, mergeSourceRegistry, parseRegistryBackup } from "./source-registry.js";
import { CentralSourceStore } from "./central-source-store.js";
import { getRuntimeConfig, isCentralStorageConfigured, isGoogleDriveConfigured } from "./runtime-config.js";
import { GoogleDriveService, type GoogleDriveStatus, type PendingSourceUpload, type SourceUploadProgress } from "./google-drive.js";
import { extractPdfText, shouldInvalidateLegacyExtraction, type PdfExtractionProgress } from "./pdf-indexer.js";
import { extractPdfWithArabicOcr } from "./ocr-indexer.js";
import { extractPositionalTocLayouts } from "./toc-layout-ocr.js";
import { detectTocPagesFromChunks, extractStructureFromPositionalToc } from "./positional-toc.js";
import { resolveInitialView, viewFromHash, viewHash } from "./navigation.js";
import { createManualStructureNode, extractSourceStructure, parsePageSelection, resequenceStructureNodes, shouldQuarantineLegacyStructureDraft, SOURCE_STRUCTURE_NODE_TYPES, validateSourceStructure } from "./source-structure.js";

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
  structureSourceId: string;
  structureNodes: SourceStructureNode[];
  structureLoaded: boolean;
  structureBusy: boolean;
  structureMessage: string;
  structureDirty: boolean;
  structureManualTocPages: string;
}


const runtimeConfig = getRuntimeConfig();
const centralSourceStore = isCentralStorageConfigured(runtimeConfig)
  ? new CentralSourceStore(runtimeConfig)
  : null;
const googleDriveService = centralSourceStore && isGoogleDriveConfigured(runtimeConfig)
  ? new GoogleDriveService(runtimeConfig, centralSourceStore)
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
  structureSourceId: "",
  structureNodes: [],
  structureLoaded: false,
  structureBusy: false,
  structureMessage: "",
  structureDirty: false,
  structureManualTocPages: "",
};

let saveTimer: number | undefined;

function scheduleSave(): void {
  state.saveState = "جارٍ الحفظ";
  renderTopSaveState();
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    state.draft.updatedAt = new Date().toISOString();
    saveDraft(state.draft);
    saveProfile({ school: state.draft.school, directorate: state.draft.directorate });
    state.saveState = "محفوظ";
    renderTopSaveState();
  }, 650);
}

function saveNow(): void {
  if (saveTimer) window.clearTimeout(saveTimer);
  state.draft.updatedAt = new Date().toISOString();
  saveDraft(state.draft);
  saveProfile({ school: state.draft.school, directorate: state.draft.directorate });
  state.saveState = "محفوظ";
  showToast("تم حفظ أحدث حالة للمسودة.");
}

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
  state.draft.currentStep = step;
  scheduleSave();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
      ${navButton("admin", "الإدارة", "admin")}
    </nav>
  `;
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
        <span class="eyebrow">نسخة المرحلة 0-H1</span>
        <h1>أنشئ اختبارك القصير بثقة.</h1>
        <p>أربع خطوات واضحة. المصادر والفحوص وجدول المواصفات تعمل في الخلفية، حيث تنتمي التفاصيل المزعجة.</p>
        <div class="hero-actions">
          <button class="primary-btn" data-action="new-exam">${icon("plus")} إنشاء اختبار جديد</button>
          ${hasDraft ? `<button class="secondary-btn" data-action="resume-draft">متابعة آخر مسودة ${icon("arrow")}</button>` : ""}
        </div>
      </div>
      <div class="confidence-card" aria-label="ملخص الخدمة">
        <div class="confidence-score">واثق</div>
        <ul>
          <li>${icon("check")} خطة منضبطة قبل التوليد</li>
          <li>${icon("check")} ثلاثة بدائل متكافئة لكل مفردة</li>
          <li>${icon("check")} Word وPDF ونموذج إجابة</li>
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
      return `<li class="${status}"><button data-step="${step.id}" ${state.draft.currentStep < step.id ? "disabled" : ""}><span>${status === "done" ? icon("check") : step.id}</span><b>${step.label}</b></button></li>`;
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

function renderContentStep(): string {
  const availableSubjects = SUBJECTS.filter((subject) => state.draft.grade !== null && subject.grades.includes(state.draft.grade));
  const subject = availableSubjects.find((item) => item.id === state.draft.subjectId);
  const unit = subject?.units.find((item) => item.id === state.draft.unitId);
  const selectedLessons = unit?.lessons.filter((lesson) => state.draft.lessonIds.includes(lesson.id)) ?? [];
  const outcomes = selectedLessons.flatMap((lesson) => lesson.outcomes);

  return `
    <div class="section-intro"><h2>ما المحتوى الذي تريد قياسه؟</h2><p>اختر فقط ما يحتاجه الاختبار. لا ملفات ولا مراجع أمام المعلم؛ تلك الأعمال الشاقة تتولاها المنصة في الخلفية.</p></div>
    <div class="form-grid two-columns">
      <label class="field"><span>الصف</span><select id="grade-select"><option value="">اختر الصف</option>${Array.from({ length: 12 }, (_, index) => index + 1).map((grade) => `<option value="${grade}" ${state.draft.grade === grade ? "selected" : ""}>الصف ${grade}</option>`).join("")}</select></label>
      <label class="field"><span>المادة</span><select id="subject-select" ${availableSubjects.length === 0 ? "disabled" : ""}><option value="">اختر المادة</option>${availableSubjects.map((item) => `<option value="${item.id}" ${state.draft.subjectId === item.id ? "selected" : ""}>${item.label}</option>`).join("")}</select></label>
      <label class="field full"><span>الوحدة</span><select id="unit-select" ${!subject ? "disabled" : ""}><option value="">اختر الوحدة</option>${subject?.units.map((item) => `<option value="${item.id}" ${state.draft.unitId === item.id ? "selected" : ""}>${item.label}</option>`).join("") ?? ""}</select><small>البيانات الحالية تجريبية وليست محتوى منهجيًا رسميًا.</small></label>
    </div>

    <div class="selection-block ${unit ? "" : "disabled-block"}">
      <div class="selection-header"><div><h3>الدروس</h3><p>اختر درسًا أو عدة دروس، أو حدد الوحدة كاملة.</p></div>${unit ? `<button class="text-btn" data-action="select-all-lessons">تحديد الوحدة كاملة</button>` : ""}</div>
      <div class="choice-grid">${unit?.lessons.map((lesson) => checkboxCard("lesson", lesson.id, lesson.label, state.draft.lessonIds.includes(lesson.id))).join("") ?? `<p class="empty-inline">اختر الوحدة أولًا.</p>`}</div>
    </div>

    <div class="selection-block ${outcomes.length ? "" : "disabled-block"}">
      <div class="selection-header"><div><h3>نواتج التعلم</h3><p>سيبني واثق خطة الاختبار وفق النتائج التي تحددها.</p></div>${outcomes.length ? `<button class="text-btn" data-action="select-all-outcomes">تحديد الكل</button>` : ""}</div>
      <div class="choice-list">${outcomes.map((outcome) => checkboxCard("outcome", outcome.id, outcome.label, state.draft.outcomeIds.includes(outcome.id))).join("") || `<p class="empty-inline">اختر درسًا واحدًا على الأقل.</p>`}</div>
    </div>

    ${renderWizardFooter(1)}
  `;
}

function checkboxCard(group: "lesson" | "outcome", id: string, label: string, checked: boolean): string {
  return `<label class="check-card ${checked ? "selected" : ""}"><input type="checkbox" data-group="${group}" value="${id}" ${checked ? "checked" : ""}/><span class="check-box">${checked ? icon("check") : ""}</span><b>${escapeHtml(label)}</b></label>`;
}

function renderSetupStep(): string {
  const validation = validateExamSetup(state.draft);
  return `
    <div class="section-intro"><h2>إعداد واضح بلا قوائم مرعبة</h2><p>حدد البيانات الأساسية وأنواع الأسئلة، وسيظهر التوافق فورًا.</p></div>
    <div class="form-grid two-columns">
      ${inputField("title-input", "عنوان الاختبار", state.draft.title, "text", "مثال: الاختبار القصير الأول")}
      ${inputField("date-input", "تاريخ الاختبار", state.draft.examDate, "date")}
      ${inputField("school-input", "المدرسة", state.draft.school, "text")}
      ${inputField("directorate-input", "المديرية", state.draft.directorate, "text")}
      ${inputField("academic-year-input", "العام الدراسي", state.draft.academicYear, "text")}
      <label class="field"><span>الفصل الدراسي</span><select id="semester-select"><option ${state.draft.semester === "الأول" ? "selected" : ""}>الأول</option><option ${state.draft.semester === "الثاني" ? "selected" : ""}>الثاني</option></select></label>
      ${inputField("duration-input", "الزمن بالدقائق", state.draft.durationMinutes, "number", "", "10")}
      ${inputField("marks-input", "الدرجة الكلية", state.draft.totalMarks, "number", "", "5")}
    </div>

    <div class="compact-section"><h3>مستوى الصعوبة</h3><div class="segmented">${["سهل", "متوسط", "متقدم"].map((level) => `<button data-difficulty="${level}" class="${state.draft.difficulty === level ? "active" : ""}">${level}</button>`).join("")}</div></div>

    <div class="compact-section">
      <div class="selection-header"><div><h3>أنواع الأسئلة</h3><p>الدرجات التجريبية: الاختيار من متعدد 1، القصيرة 2، الطويلة 4.</p></div><span class="marks-summary">المجموع المحسوب: <b>${validation.computedMarks}</b></span></div>
      <div class="count-grid">
        ${countField("mcq", "اختيار من متعدد", state.draft.counts.mcq, "سؤال محدد بإجابة صحيحة واحدة")}
        ${countField("short", "إجابة قصيرة", state.draft.counts.short, "كلمة أو تفسير مختصر أو إكمال")}
        ${countField("long", "إجابة طويلة", state.draft.counts.long, "تحليل أو تفسير أو خطوات حل")}
      </div>
    </div>

    ${renderCompliance(validation)}
    ${renderWizardFooter(2, validation.valid)}
  `;
}

function inputField(id: string, label: string, value: string | number, type: string, placeholder = "", min = ""): string {
  return `<label class="field"><span>${label}</span><input id="${id}" type="${type}" value="${escapeHtml(value)}" ${placeholder ? `placeholder="${placeholder}"` : ""} ${min ? `min="${min}"` : ""}/></label>`;
}

function countField(key: keyof QuestionCounts, label: string, value: number, description: string): string {
  return `<div class="count-card"><div><strong>${label}</strong><small>${description}</small></div><div class="counter"><button data-count-key="${key}" data-count-change="-1" aria-label="تقليل ${label}">−</button><input data-count-input="${key}" type="number" min="0" value="${value}" aria-label="عدد أسئلة ${label}"/><button data-count-key="${key}" data-count-change="1" aria-label="زيادة ${label}">+</button></div></div>`;
}

function renderCompliance(validation: ReturnType<typeof validateExamSetup>): string {
  if (validation.valid) {
    return `<div class="compliance success">${icon("check")}<div><strong>الخطة الأولية متوافقة</strong><p>يمكنك الانتقال لبناء خطة الاختبار واختيار المقترحات.</p></div></div>`;
  }
  return `<div class="compliance warning"><div class="warning-mark">!</div><div><strong>تحتاج بعض البيانات إلى ضبط</strong><ul>${validation.issues.map((issue) => `<li>${escapeHtml(issue.message)}</li>`).join("")}</ul>${validation.suggestedCounts ? `<button class="secondary-btn compact" data-action="apply-suggestion">تطبيق التوزيع المقترح: ${validation.suggestedCounts.mcq} متعدد، ${validation.suggestedCounts.short} قصيرة، ${validation.suggestedCounts.long} طويلة</button>` : ""}</div></div>`;
}

function renderPlanStep(): string {
  if (state.draft.plan.length === 0) {
    state.draft.plan = buildPlan(state.draft);
    scheduleSave();
  }
  const selectedCount = Object.keys(state.draft.selectedProposalByPlanItem).length;
  return `
    <div class="section-intro inline"><div><h2>اختر سؤالًا واحدًا لكل مفردة</h2><p>كل مجموعة متكافئة في الهدف والصعوبة والدرجة. الاختلاف في الصياغة أو السياق أو العنصر البصري.</p></div><span class="progress-pill">${selectedCount} من ${state.draft.plan.length}</span></div>
    <div class="plan-stack">${state.draft.plan.map((item, index) => renderPlanItem(item, index)).join("")}</div>
    ${renderWizardFooter(3, isPlanComplete(state.draft))}
  `;
}

function renderPlanItem(item: PlanItem, index: number): string {
  const chosen = state.draft.selectedProposalByPlanItem[item.id];
  return `<article class="plan-card">
    <header><div class="question-number">${index + 1}</div><div><h3>${item.questionType}</h3><p>${escapeHtml(item.lessonLabel)} · ${escapeHtml(item.outcomeLabel)}</p></div><div class="plan-tags"><span>${item.cognitiveLevel}</span><span>${item.marks} ${item.marks === 1 ? "درجة" : "درجات"}</span></div></header>
    <div class="proposal-grid">${item.proposals.map((proposal, proposalIndex) => `<label class="proposal-card ${chosen === proposal.id ? "selected" : ""}"><input type="radio" name="proposal-${item.id}" data-plan-id="${item.id}" value="${proposal.id}" ${chosen === proposal.id ? "checked" : ""}/><div class="proposal-top"><span>المقترح ${proposalIndex + 1}</span>${proposal.visualKind ? `<b>${proposal.visualKind}</b>` : ""}</div><p>${escapeHtml(proposal.text)}</p><span class="choose-label">${chosen === proposal.id ? `${icon("check")} تم الاختيار` : "اختر هذا السؤال"}</span></label>`).join("")}</div>
    <footer><button class="text-btn" data-regenerate="${item.id}">${icon("spark")} توليد ثلاثة بدائل جديدة لهذه المفردة</button></footer>
  </article>`;
}

function renderReviewStep(): string {
  const subject = SUBJECTS.find((item) => item.id === state.draft.subjectId)?.label ?? "المادة";
  const selected = state.draft.plan.map((item) => ({ item, proposal: selectedProposal(state.draft, item) })).filter((entry) => entry.proposal);
  return `
    <div class="review-layout">
      <section class="paper-preview">
        <header class="paper-header"><div class="ministry-mark">شعار<br/>الخنجر</div><div><strong>سلطنة عُمان</strong><span>وزارة التعليم</span><span>${escapeHtml(state.draft.directorate)}</span><span>${escapeHtml(state.draft.school)}</span></div></header>
        <div class="paper-title"><h2>${escapeHtml(state.draft.title)}</h2><p>${subject} · الصف ${state.draft.grade} · الفصل الدراسي ${escapeHtml(state.draft.semester)} · ${escapeHtml(state.draft.academicYear)}</p></div>
        <div class="student-row"><span>اسم الطالب: ____________________</span><span>التاريخ: ${formatArabicDate(state.draft.examDate)}</span><span>الزمن: ${state.draft.durationMinutes} دقيقة</span></div>
        <div class="paper-questions">${selected.map(({ item, proposal }, index) => `<article><div class="paper-question-title"><b>${index + 1})</b><span>${escapeHtml(proposal?.text ?? "")}</span><strong>[${item.marks}]</strong></div>${proposal?.visualKind ? `<div class="visual-placeholder"><span>${proposal.visualKind}</span><div class="mini-chart"><i></i><i></i><i></i><i></i></div></div>` : ""}<div class="answer-lines">${Array.from({ length: item.questionType === "إجابة طويلة" ? 4 : 2 }, () => "<span></span>").join("")}</div></article>`).join("")}</div>
        <footer class="paper-footer">- 1 -</footer>
      </section>
      <aside class="review-panel">
        <div class="final-check"><h3>الفحص النهائي</h3>${checkRow("الصحة العلمية", true)}${checkRow("جدول المواصفات", true)}${checkRow("مجموع الدرجات", true)}${checkRow("التكرار المفاهيمي", true)}${checkRow("نموذج الإجابة", true)}</div>
        <div class="review-summary"><span>الدرجة</span><strong>${state.draft.totalMarks}</strong><span>الأسئلة</span><strong>${state.draft.plan.length}</strong><span>الصعوبة</span><strong>${state.draft.difficulty}</strong></div>
        <button class="primary-btn full" data-action="approve-model-a">${icon("check")} اعتماد النموذج أ</button>
        <p class="muted-note">التصدير الحقيقي وإنشاء النموذج ب غير مفعّلين في Phase 0-B. هذه معاينة لمسار الاستخدام فقط.</p>
      </aside>
    </div>
    ${renderWizardFooter(4, true)}
  `;
}

function checkRow(label: string, okay: boolean): string {
  return `<div class="check-row"><span>${okay ? icon("check") : "!"}</span><b>${label}</b><small>${okay ? "سليم" : "يحتاج مراجعة"}</small></div>`;
}

function renderWizardFooter(step: WizardStep, canContinue = true): string {
  return `<footer class="wizard-footer">${step > 1 ? `<button class="secondary-btn" data-action="previous-step">السابق</button>` : `<button class="secondary-btn" data-nav="home">إلغاء</button>`}<div>${step < 4 ? `<button class="primary-btn" data-action="next-step" ${canContinue ? "" : "disabled"}>التالي ${icon("arrow")}</button>` : `<button class="secondary-btn" data-nav="library">الذهاب إلى اختباراتي</button>`}</div></footer>`;
}

function renderLibrary(): string {
  const localDraft = loadDraft();
  const exams = [
    ...(localDraft ? [{ id: localDraft.id, title: localDraft.title || "مسودة اختبار بلا عنوان", subject: SUBJECTS.find((item) => item.id === localDraft.subjectId)?.label ?? "غير محددة", grade: localDraft.grade ?? 0, status: "مسودة" as const, date: localDraft.updatedAt.slice(0, 10), progress: localDraft.currentStep * 25 }] : []),
    ...MOCK_LIBRARY,
  ].filter((exam) => state.libraryFilter === "الكل" || exam.status === state.libraryFilter);

  return `
    <section class="page-heading"><div><span class="eyebrow">مكتبتك الخاصة</span><h1>اختباراتي</h1><p>المسودات والاختبارات المعتمدة، لا شيء أكثر. البساطة ليست نقصًا، بل إنقاذ.</p></div><button class="primary-btn" data-action="new-exam">${icon("plus")} اختبار جديد</button></section>
    <div class="filter-bar"><div class="segmented small">${["الكل", "مسودة", "معتمد"].map((filter) => `<button data-library-filter="${filter}" class="${state.libraryFilter === filter ? "active" : ""}">${filter}</button>`).join("")}</div><label class="search-field"><span>بحث</span><input id="library-search" placeholder="ابحث بالعنوان أو المادة"/></label></div>
    <div class="library-grid" id="library-grid">${exams.map(renderExamCard).join("") || `<div class="empty-state"><h2>لا توجد نتائج</h2><p>جرّب مرشحًا آخر بدل معاقبة قاعدة البيانات بنظرات الاستغراب.</p></div>`}</div>
  `;
}

function renderExamCard(exam: (typeof MOCK_LIBRARY)[number]): string {
  return `<article class="exam-card" data-search-text="${escapeHtml(`${exam.title} ${exam.subject} ${exam.grade}`)}"><div class="exam-card-head"><span class="status-badge ${exam.status === "معتمد" ? "approved" : "draft"}">${exam.status}</span>${exam.hasModelB ? `<span class="model-badge">أ + ب</span>` : ""}</div><h2>${escapeHtml(exam.title)}</h2><p>${escapeHtml(exam.subject)} · الصف ${exam.grade || "غير محدد"}</p><div class="exam-meta"><span>${formatArabicDate(exam.date)}</span>${exam.progress ? `<span>${exam.progress}% مكتمل</span>` : ""}</div>${exam.progress ? `<div class="progress-track"><span style="width:${exam.progress}%"></span></div>` : ""}<div class="exam-actions">${exam.status === "مسودة" ? `<button class="primary-btn compact" data-action="resume-draft">متابعة</button><button class="ghost-btn compact" data-action="delete-draft">حذف</button>` : `<button class="secondary-btn compact" data-action="mock-download">تنزيل Word</button><button class="ghost-btn compact" data-action="mock-download">تنزيل PDF</button>`}</div></article>`;
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
    <section class="page-heading"><div><span class="eyebrow">لوحة مالك المنصة</span><h1>إدارة المصادر</h1><p>رفع المصادر واستخراج نصها، ثم بناء هيكل الوحدات والدروس من الفهرس ومراجعته قبل الاعتماد.</p></div><span class="demo-badge">Phase 0-H1 · هيكل الكتاب</span></section>

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
        <div><h2>مكتبة المصادر</h2><p>بعد رفع PDF يحاول واثق طبقة النص أولًا، ثم يتيح OCR عربيًا فعليًا للملفات المصورة أو المشوهة مع استكمال الصفحات بعد الانقطاع.</p></div>
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
      ${headings.length ? `<div class="detected-headings"><span>عناوين مرشحة وليست معتمدة بعد</span><div>${headings.slice(0, 12).map((heading) => `<small>${escapeHtml(heading)}</small>`).join("")}</div></div>` : ""}
      ${renderSourceStructurePanel(source)}
      <div class="source-detail-actions">
        ${source.mode === "file" && source.driveFileId && source.status !== "مؤرشف" ? `<button class="primary-btn compact" data-action="index-source" data-source-id="${source.id}" ${state.sourceIndexingId ? "disabled" : ""}>${sourceExtractionActionLabel(source, state.sourceIndexingId === source.id)}</button>` : ""}
        ${source.driveWebViewLink ? `<a class="secondary-btn compact source-drive-link" href="${escapeHtml(source.driveWebViewLink)}" target="_blank" rel="noreferrer">فتح الملف في Google Drive</a>` : ""}
      </div>
    </section>
  `;
}

function renderManualTocControls(source: ManagedSource): string {
  return `<div class="manual-toc-controls">
    <label><span>صفحات الفهرس يدويًا</span><input inputmode="numeric" data-structure-toc-pages value="${escapeHtml(state.structureManualTocPages)}" placeholder="مثال: 4-5 أو 4، 5" /></label>
    <button class="secondary-btn compact" data-action="extract-source-structure-manual" data-source-id="${source.id}" ${state.structureBusy ? "disabled" : ""}>استخراج من الصفحات المحددة</button>
  </div>`;
}

function renderSourceStructurePanel(source: ManagedSource): string {
  const eligible = source.mode === "file" && source.extractionStatus === "مكتمل" && source.status === "مفهرس";
  if (!eligible) {
    return `<section class="source-structure-card unavailable"><div><span class="eyebrow">هيكل الكتاب</span><h3>يظهر بعد اكتمال استخراج النص</h3><p>استخرج النص وفهرسه أولًا، ثم سيبحث واثق عن الفهرس والوحدات والدروس.</p></div></section>`;
  }
  if (state.structureSourceId !== source.id || !state.structureLoaded) {
    return `<section class="source-structure-card loading"><div><span class="eyebrow">هيكل الكتاب</span><h3>${state.structureBusy ? "جارٍ تحميل الهيكل…" : "جارٍ التحقق من الهيكل المحفوظ…"}</h3><p>${escapeHtml(state.structureMessage || "انتظر لحظة؛ لا توجد طقوس إضافية مطلوبة.")}</p></div></section>`;
  }
  if (!state.structureNodes.length) {
    return `<section class="source-structure-card empty"><div><span class="eyebrow">Phase 0-H1 Rebuild 2</span><h3>لم يُعثر على هيكل موثوق بعد</h3><p>${escapeHtml(state.structureMessage || "سيقبل واثق الهيكل فقط بعد اجتياز التحقق المرجعي: وحدات مكتملة، دروس مرتبطة، وأرقام صفحات منفصلة عن العناوين.")}</p></div><div class="structure-empty-actions"><button class="primary-btn compact" data-action="extract-source-structure" data-source-id="${source.id}" ${state.structureBusy ? "disabled" : ""}>${state.structureBusy ? "جارٍ الاستخراج…" : "تحليل الفهرس بصريًا"}</button>${renderManualTocControls(source)}<button class="ghost-btn compact" data-action="add-structure-unit" data-source-id="${source.id}" ${state.structureBusy ? "disabled" : ""}>إضافة وحدة يدويًا</button></div></section>`;
  }
  const validation = validateSourceStructure(state.structureNodes);
  const approved = state.structureNodes.every((node) => node.reviewStatus === "معتمد");
  const units = state.structureNodes.filter((node) => node.nodeType === "وحدة");
  return `<section class="source-structure-card review">
    <header><div><span class="eyebrow">هيكل الكتاب</span><h3>${approved ? "هيكل معتمد" : "مراجعة الوحدات والدروس"}</h3><p>${escapeHtml(state.structureMessage || `استخرج واثق ${units.length} وحدة و${state.structureNodes.length - units.length} عنصرًا تابعًا.`)}</p></div><span class="structure-review-badge ${approved ? "approved" : "draft"}">${approved ? "معتمد" : state.structureDirty ? "تعديلات غير محفوظة" : "مرشح للمراجعة"}</span></header>
    ${!validation.valid ? `<div class="structure-validation"><strong>يحتاج ضبطًا قبل الاعتماد</strong><ul>${validation.issues.slice(0, 5).map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul></div>` : ""}
    <div class="structure-tree">${state.structureNodes.map((node, index) => renderStructureNodeRow(node, index, units)).join("")}</div>
    <div class="structure-toolbar">
      <button class="ghost-btn compact" data-action="add-structure-unit" data-source-id="${source.id}" ${state.structureBusy ? "disabled" : ""}>إضافة وحدة</button>
      <button class="ghost-btn compact" data-action="add-structure-child" data-source-id="${source.id}" ${state.structureBusy || !units.length ? "disabled" : ""}>إضافة عنصر تابع</button>
      <button class="ghost-btn compact" data-action="reextract-source-structure" data-source-id="${source.id}" ${state.structureBusy ? "disabled" : ""}>إعادة الاستخراج التلقائي</button>
      ${renderManualTocControls(source)}
      <span class="structure-spacer"></span>
      <button class="secondary-btn compact" data-action="save-source-structure" data-source-id="${source.id}" ${state.structureBusy || !validation.valid ? "disabled" : ""}>حفظ التعديلات</button>
      <button class="primary-btn compact" data-action="approve-source-structure" data-source-id="${source.id}" ${state.structureBusy || !validation.valid ? "disabled" : ""}>اعتماد الهيكل</button>
    </div>
  </section>`;
}

function renderStructureNodeRow(node: SourceStructureNode, index: number, units: SourceStructureNode[]): string {
  const child = node.parentId !== null;
  const parentOptions = [`<option value="">بدون وحدة</option>`, ...units.filter((unit) => unit.id !== node.id).map((unit) => `<option value="${unit.id}" ${node.parentId === unit.id ? "selected" : ""}>${escapeHtml(unit.title)}</option>`)].join("");
  return `<article class="structure-node-row ${child ? "child" : "root"}" data-structure-row="${node.id}">
    <div class="structure-move"><button class="icon-btn" data-action="move-structure-up" data-structure-id="${node.id}" ${index === 0 ? "disabled" : ""} aria-label="تحريك لأعلى">↑</button><button class="icon-btn" data-action="move-structure-down" data-structure-id="${node.id}" ${index === state.structureNodes.length - 1 ? "disabled" : ""} aria-label="تحريك لأسفل">↓</button></div>
    <label><span>النوع</span><select data-structure-type="${node.id}">${SOURCE_STRUCTURE_NODE_TYPES.map((type) => `<option value="${type}" ${node.nodeType === type ? "selected" : ""}>${type}</option>`).join("")}</select></label>
    <label class="structure-title-field"><span>العنوان</span><input data-structure-title="${node.id}" value="${escapeHtml(node.title)}"/></label>
    <label><span>يتبع</span><select data-structure-parent="${node.id}" ${node.nodeType === "وحدة" ? "disabled" : ""}>${parentOptions}</select></label>
    <label><span>من صفحة</span><input type="number" min="1" data-structure-page-start="${node.id}" value="${node.pageStart}"/></label>
    <label><span>إلى صفحة</span><input type="number" min="1" data-structure-page-end="${node.id}" value="${node.pageEnd}"/></label>
    <div class="structure-confidence"><span>الثقة</span><strong>${Math.round(node.confidence * 100)}%</strong></div>
    <button class="danger-link compact" data-action="delete-structure-node" data-structure-id="${node.id}">حذف</button>
  </article>`;
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
  if (action === "new-exam") {
    const profile = loadProfile();
    state.draft = createEmptyDraft();
    if (profile) {
      state.draft.school = profile.school;
      state.draft.directorate = profile.directorate;
    }
    navigate("wizard");
    scheduleSave();
    return;
  }
  if (action === "resume-draft") {
    const loaded = loadDraft();
    if (loaded) state.draft = loaded;
    navigate("wizard");
    return;
  }
  if (action === "save-now") return saveNow();
  if (action === "previous-step") return setStep(Math.max(1, state.draft.currentStep - 1) as WizardStep);
  if (action === "next-step") return nextStep();
  if (action === "select-all-lessons") return selectAllLessons();
  if (action === "select-all-outcomes") return selectAllOutcomes();
  if (action === "apply-suggestion") return applySuggestedCounts();
  if (action === "approve-model-a") {
    state.draft.status = "معتمد";
    scheduleSave();
    showToast("تمت محاكاة اعتماد النموذج أ بنجاح.");
    return;
  }
  if (action === "delete-draft") {
    clearDraft();
    state.draft = createEmptyDraft();
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
    resetSourceStructureState();
    render();
    return;
  }
  const sourceId = element.dataset.sourceId;
  if (action === "view-source" && sourceId) {
    state.selectedSourceId = sourceId;
    resetSourceStructureState(sourceId);
    render();
    void loadSourceStructure(sourceId);
    window.setTimeout(() => document.querySelector(".source-details-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    return;
  }
  if (action === "extract-source-structure" && sourceId) { void extractAndSaveSourceStructure(sourceId); return; }
  if (action === "extract-source-structure-manual" && sourceId) { void extractAndSaveSourceStructure(sourceId, true, true); return; }
  if (action === "reextract-source-structure" && sourceId) { void extractAndSaveSourceStructure(sourceId, true); return; }
  if (action === "save-source-structure" && sourceId) { void saveCurrentSourceStructure(sourceId, false); return; }
  if (action === "approve-source-structure" && sourceId) { void saveCurrentSourceStructure(sourceId, true); return; }
  if (action === "add-structure-unit" && sourceId) { addStructureNode(sourceId, "وحدة"); return; }
  if (action === "add-structure-child" && sourceId) { addStructureNode(sourceId, "درس"); return; }
  const structureId = element.dataset.structureId;
  if (action === "delete-structure-node" && structureId) { deleteStructureNode(structureId); return; }
  if (action === "move-structure-up" && structureId) { moveStructureNode(structureId, -1); return; }
  if (action === "move-structure-down" && structureId) { moveStructureNode(structureId, 1); return; }
  if (action === "archive-source" && sourceId) { void archiveSource(sourceId); return; }
  if (action === "restore-source" && sourceId) { void restoreSource(sourceId); return; }
  if (action === "index-source" && sourceId) { void extractAndIndexSource(sourceId); return; }
}

function nextStep(): void {
  const step = state.draft.currentStep;
  if (step === 1) {
    const basicReady = state.draft.grade !== null && state.draft.subjectId && state.draft.unitId && state.draft.lessonIds.length && state.draft.outcomeIds.length;
    if (!basicReady) return showToast("أكمل الصف والمادة والوحدة والدروس ونواتج التعلم أولًا.");
    if (!state.draft.title) {
      const subject = SUBJECTS.find((item) => item.id === state.draft.subjectId)?.label ?? "العلوم";
      state.draft.title = `الاختبار القصير الأول في ${subject}`;
    }
    return setStep(2);
  }
  if (step === 2) {
    const validation = validateExamSetup(state.draft);
    if (!validation.valid) return showToast("اضبط البيانات المشار إليها قبل المتابعة.");
    state.draft.plan = buildPlan(state.draft);
    state.draft.selectedProposalByPlanItem = {};
    return setStep(3);
  }
  if (step === 3) {
    if (!isPlanComplete(state.draft)) return showToast("اختر سؤالًا واحدًا لكل مفردة.");
    return setStep(4);
  }
}

function bindContentStep(): void {
  const gradeSelect = document.querySelector<HTMLSelectElement>("#grade-select");
  gradeSelect?.addEventListener("change", () => {
    state.draft.grade = gradeSelect.value ? Number(gradeSelect.value) : null;
    state.draft.subjectId = "";
    state.draft.unitId = "";
    state.draft.lessonIds = [];
    state.draft.outcomeIds = [];
    scheduleSave();
    render();
  });

  const subjectSelect = document.querySelector<HTMLSelectElement>("#subject-select");
  subjectSelect?.addEventListener("change", () => {
    state.draft.subjectId = subjectSelect.value;
    state.draft.unitId = "";
    state.draft.lessonIds = [];
    state.draft.outcomeIds = [];
    scheduleSave();
    render();
  });

  const unitSelect = document.querySelector<HTMLSelectElement>("#unit-select");
  unitSelect?.addEventListener("change", () => {
    state.draft.unitId = unitSelect.value;
    state.draft.lessonIds = [];
    state.draft.outcomeIds = [];
    scheduleSave();
    render();
  });

  document.querySelectorAll<HTMLInputElement>('input[data-group="lesson"]').forEach((input) => {
    input.addEventListener("change", () => {
      toggleArrayValue(state.draft.lessonIds, input.value, input.checked);
      const validOutcomeIds = getSelectedLessons().flatMap((lesson) => lesson.outcomes.map((outcome) => outcome.id));
      state.draft.outcomeIds = state.draft.outcomeIds.filter((id) => validOutcomeIds.includes(id));
      scheduleSave();
      render();
    });
  });

  document.querySelectorAll<HTMLInputElement>('input[data-group="outcome"]').forEach((input) => {
    input.addEventListener("change", () => {
      toggleArrayValue(state.draft.outcomeIds, input.value, input.checked);
      scheduleSave();
      render();
    });
  });
}

function getSelectedUnit() {
  const subject = SUBJECTS.find((item) => item.id === state.draft.subjectId);
  return subject?.units.find((item) => item.id === state.draft.unitId);
}

function getSelectedLessons() {
  return getSelectedUnit()?.lessons.filter((lesson) => state.draft.lessonIds.includes(lesson.id)) ?? [];
}

function selectAllLessons(): void {
  const unit = getSelectedUnit();
  state.draft.lessonIds = unit?.lessons.map((lesson) => lesson.id) ?? [];
  state.draft.outcomeIds = [];
  scheduleSave();
  render();
}

function selectAllOutcomes(): void {
  state.draft.outcomeIds = getSelectedLessons().flatMap((lesson) => lesson.outcomes.map((outcome) => outcome.id));
  scheduleSave();
  render();
}

function toggleArrayValue(array: string[], value: string, enabled: boolean): void {
  const index = array.indexOf(value);
  if (enabled && index === -1) array.push(value);
  if (!enabled && index >= 0) array.splice(index, 1);
}

function bindSetupStep(): void {
  const inputBindings: Array<[string, keyof Pick<ExamDraft, "title" | "examDate" | "school" | "directorate" | "academicYear">]> = [
    ["title-input", "title"],
    ["date-input", "examDate"],
    ["school-input", "school"],
    ["directorate-input", "directorate"],
    ["academic-year-input", "academicYear"],
  ];
  inputBindings.forEach(([id, key]) => {
    document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener("input", (event) => {
      state.draft[key] = (event.target as HTMLInputElement).value;
      scheduleSave();
    });
  });

  document.querySelector<HTMLSelectElement>("#semester-select")?.addEventListener("change", (event) => {
    state.draft.semester = (event.target as HTMLSelectElement).value;
    scheduleSave();
  });

  document.querySelector<HTMLInputElement>("#duration-input")?.addEventListener("change", (event) => {
    state.draft.durationMinutes = Number((event.target as HTMLInputElement).value);
    scheduleSave();
    render();
  });

  document.querySelector<HTMLInputElement>("#marks-input")?.addEventListener("change", (event) => {
    state.draft.totalMarks = Number((event.target as HTMLInputElement).value);
    scheduleSave();
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => {
      state.draft.difficulty = button.dataset.difficulty as ExamDraft["difficulty"];
      scheduleSave();
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-count-change]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.countKey as keyof QuestionCounts;
      const change = Number(button.dataset.countChange);
      state.draft.counts[key] = Math.max(0, state.draft.counts[key] + change);
      scheduleSave();
      render();
    });
  });

  document.querySelectorAll<HTMLInputElement>("[data-count-input]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.countInput as keyof QuestionCounts;
      state.draft.counts[key] = Math.max(0, Number(input.value));
      scheduleSave();
      render();
    });
  });
}

function applySuggestedCounts(): void {
  const suggestion = validateExamSetup(state.draft).suggestedCounts;
  if (!suggestion) return;
  state.draft.counts = suggestion;
  scheduleSave();
  render();
}

function bindPlanStep(): void {
  document.querySelectorAll<HTMLInputElement>("[data-plan-id]").forEach((input) => {
    input.addEventListener("change", () => {
      const planId = input.dataset.planId;
      if (!planId) return;
      state.draft.selectedProposalByPlanItem[planId] = input.value;
      scheduleSave();
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-regenerate]").forEach((button) => {
    button.addEventListener("click", () => {
      const planId = button.dataset.regenerate;
      const item = state.draft.plan.find((entry) => entry.id === planId);
      if (!item) return;
      const seed = Date.now() % 1000;
      item.proposals = generateProposals(item.id, item.questionType, item.cognitiveLevel, item.outcomeLabel, seed);
      delete state.draft.selectedProposalByPlanItem[item.id];
      scheduleSave();
      render();
      showToast("تم تجديد المقترحات لهذه المفردة فقط.");
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

  document.querySelectorAll<HTMLInputElement>("[data-structure-toc-pages]").forEach((input) => {
    input.addEventListener("input", () => { state.structureManualTocPages = input.value; });
  });
  document.querySelectorAll<HTMLInputElement>("[data-structure-title]").forEach((input) => {
    input.addEventListener("input", () => updateStructureNode(input.dataset.structureTitle ?? "", { title: input.value }, false));
  });
  document.querySelectorAll<HTMLInputElement>("[data-structure-page-start]").forEach((input) => {
    input.addEventListener("change", () => updateStructureNode(input.dataset.structurePageStart ?? "", { pageStart: Math.max(1, Number(input.value) || 1) }, true));
  });
  document.querySelectorAll<HTMLInputElement>("[data-structure-page-end]").forEach((input) => {
    input.addEventListener("change", () => updateStructureNode(input.dataset.structurePageEnd ?? "", { pageEnd: Math.max(1, Number(input.value) || 1) }, true));
  });
  document.querySelectorAll<HTMLSelectElement>("[data-structure-type]").forEach((select) => {
    select.addEventListener("change", () => {
      const id = select.dataset.structureType ?? "";
      const nodeType = select.value as SourceStructureNodeType;
      const fallbackParent = state.structureNodes.find((node) => node.nodeType === "وحدة" && node.id !== id)?.id ?? null;
      updateStructureNode(id, { nodeType, parentId: nodeType === "وحدة" ? null : (state.structureNodes.find((node) => node.id === id)?.parentId ?? fallbackParent) }, true);
    });
  });
  document.querySelectorAll<HTMLSelectElement>("[data-structure-parent]").forEach((select) => {
    select.addEventListener("change", () => updateStructureNode(select.dataset.structureParent ?? "", { parentId: select.value || null }, true));
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

function resetSourceStructureState(sourceId = ""): void {
  state.structureSourceId = sourceId;
  state.structureNodes = [];
  state.structureLoaded = false;
  state.structureBusy = false;
  state.structureMessage = "";
  state.structureDirty = false;
  state.structureManualTocPages = "";
}

async function loadSourceStructure(sourceId: string): Promise<void> {
  if (!centralSourceStore || state.sourceStorageStatus !== "متصل") {
    state.structureSourceId = sourceId;
    state.structureLoaded = true;
    state.structureMessage = "يلزم الاتصال بالسجل المركزي لحفظ هيكل الكتاب ومراجعته.";
    render();
    return;
  }
  state.structureSourceId = sourceId;
  state.structureBusy = true;
  state.structureMessage = "جارٍ تحميل الهيكل المحفوظ…";
  render();
  try {
    const nodes = await centralSourceStore.listSourceStructure(sourceId);
    if (state.structureSourceId !== sourceId) return;
    const sequencedNodes = resequenceStructureNodes(nodes);
    if (shouldQuarantineLegacyStructureDraft(sequencedNodes)) {
      await centralSourceStore.replaceSourceStructure(sourceId, []);
      if (state.structureSourceId !== sourceId) return;
      state.structureNodes = [];
      state.structureLoaded = true;
      state.structureBusy = false;
      state.structureDirty = false;
      state.structureMessage = "حذف واثق مسودة قديمة مشوهة تلقائيًا. أعد الاستخراج الموثوق أو حدّد صفحات الفهرس يدويًا.";
      render();
      showToast("تم تنظيف مسودة الهيكل القديمة المشوهة.");
      return;
    }
    state.structureNodes = sequencedNodes;
    state.structureLoaded = true;
    state.structureBusy = false;
    state.structureDirty = false;
    state.structureMessage = nodes.length
      ? nodes.every((node) => node.reviewStatus === "معتمد") ? "الهيكل معتمد ومحفوظ مركزيًا." : "الهيكل محفوظ كمسودة مراجعة."
      : "لا يوجد هيكل محفوظ لهذا المصدر بعد.";
    render();
  } catch (error) {
    if (state.structureSourceId !== sourceId) return;
    state.structureLoaded = true;
    state.structureBusy = false;
    state.structureMessage = error instanceof Error ? error.message : "تعذر تحميل هيكل المصدر.";
    render();
  }
}

async function extractAndSaveSourceStructure(sourceId: string, replaceExisting = false, useManualTocPages = false): Promise<void> {
  if (!centralSourceStore || state.sourceStorageStatus !== "متصل") {
    showToast("سجّل دخول مالك المنصة أولًا.");
    return;
  }
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source || source.extractionStatus !== "مكتمل") {
    showToast("أكمل استخراج نص المصدر قبل بناء الهيكل.");
    return;
  }
  if (state.structureNodes.length && !replaceExisting) {
    showToast("يوجد هيكل محفوظ بالفعل؛ استخدم إعادة الاستخراج لاستبداله.");
    return;
  }
  state.structureSourceId = sourceId;
  state.structureLoaded = true;
  state.structureBusy = true;
  state.structureMessage = useManualTocPages ? "جارٍ تحليل صفحات الفهرس المحددة…" : "جارٍ تحديد فهرس موثوق متعدد الأعمدة ثم تحليل إحداثيات كلماته بصريًا…";
  render();
  try {
    const chunks = await centralSourceStore.listSourceChunks(sourceId);
    if (!chunks.length) throw new Error("لا توجد مقاطع نصية مفهرسة لهذا المصدر.");
    const totalPages = source.extractedPageCount ?? 1;
    const manualPages = useManualTocPages ? parsePageSelection(state.structureManualTocPages, totalPages) : [];
    if (useManualTocPages && !manualPages.length) {
      throw new Error("اكتب صفحات الفهرس مثل: 4-5 أو 4، 5.");
    }
    const detectedPages = useManualTocPages ? manualPages : detectTocPagesFromChunks(chunks, totalPages);
    let result: SourceStructureExtractionResult;
    if (detectedPages.length && googleDriveService) {
      state.structureMessage = `جارٍ قراءة مواضع الكلمات بصريًا في صفحات الفهرس ${detectedPages.join("، ")}…`;
      render();
      const access = await googleDriveService.getPdfSourceAccess(sourceId);
      const layouts = await extractPositionalTocLayouts(
        sourceId,
        access,
        detectedPages,
        ({ sourceId: requestSourceId, pageNumber, totalPages: requestTotalPages, image }) => googleDriveService.ocrSourceLayoutPage(
          requestSourceId,
          pageNumber,
          requestTotalPages,
          image,
        ),
        (progress) => {
          state.structureMessage = progress.message;
          render();
        },
      );
      result = extractStructureFromPositionalToc(sourceId, layouts, totalPages);
    } else {
      result = extractSourceStructure(
        sourceId,
        chunks,
        totalPages,
        useManualTocPages ? { tocPages: manualPages, allowUnitHeadingFallback: false } : {},
      );
    }
    if (!result.nodes.length) {
      if (replaceExisting || state.structureNodes.length) await centralSourceStore.replaceSourceStructure(sourceId, []);
      state.structureNodes = [];
      state.structureMessage = result.message;
      state.structureBusy = false;
      state.structureDirty = false;
      render();
      showToast(result.message);
      return;
    }
    await centralSourceStore.replaceSourceStructure(sourceId, result.nodes);
    state.structureNodes = result.nodes;
    state.structureMessage = result.message;
    state.structureBusy = false;
    state.structureDirty = false;
    render();
    showToast(result.message);
  } catch (error) {
    state.structureBusy = false;
    state.structureMessage = error instanceof Error ? error.message : "تعذر استخراج هيكل الكتاب.";
    render();
    showToast(state.structureMessage);
  }
}

function updateStructureNode(
  nodeId: string,
  changes: Partial<Pick<SourceStructureNode, "title" | "nodeType" | "parentId" | "pageStart" | "pageEnd">>,
  rerender: boolean,
): void {
  if (!nodeId) return;
  const now = new Date().toISOString();
  state.structureNodes = state.structureNodes.map((node) => {
    if (node.id !== nodeId) return node;
    const next = { ...node, ...changes, reviewStatus: "مرشح" as const, updatedAt: now };
    if (next.nodeType === "وحدة") next.parentId = null;
    if (next.pageEnd < next.pageStart) next.pageEnd = next.pageStart;
    return next;
  });
  state.structureNodes = resequenceStructureNodes(state.structureNodes);
  state.structureDirty = true;
  state.structureMessage = "عدّل الهيكل ثم احفظه أو اعتمده.";
  if (rerender) render();
}

function addStructureNode(sourceId: string, nodeType: SourceStructureNodeType): void {
  const units = state.structureNodes.filter((node) => node.nodeType === "وحدة");
  const parent = nodeType === "وحدة" ? null : units.at(-1) ?? null;
  const pageStart = parent?.pageStart ?? Math.max(1, state.structureNodes.at(-1)?.pageEnd ?? 1);
  const node = createManualStructureNode(sourceId, nodeType, parent?.id ?? null, pageStart, state.structureNodes.length);
  state.structureNodes = resequenceStructureNodes([...state.structureNodes, node]);
  state.structureDirty = true;
  state.structureMessage = "تمت إضافة عنصر يدوي؛ أكمل عنوانه وصفحاته قبل الحفظ.";
  render();
}

function deleteStructureNode(nodeId: string): void {
  const removedIds = new Set([nodeId, ...state.structureNodes.filter((node) => node.parentId === nodeId).map((node) => node.id)]);
  state.structureNodes = resequenceStructureNodes(state.structureNodes.filter((node) => !removedIds.has(node.id)));
  state.structureDirty = true;
  state.structureMessage = removedIds.size > 1 ? "حُذفت الوحدة وعناصرها التابعة من مسودة المراجعة." : "حُذف العنصر من مسودة المراجعة.";
  render();
}

function moveStructureNode(nodeId: string, direction: -1 | 1): void {
  const node = state.structureNodes.find((item) => item.id === nodeId);
  if (!node) return;
  const siblings = state.structureNodes.filter((item) => item.parentId === node.parentId).sort((left, right) => left.orderIndex - right.orderIndex);
  const index = siblings.findIndex((item) => item.id === nodeId);
  const target = siblings[index + direction];
  if (!target) return;
  const next = state.structureNodes.map((item) => {
    if (item.id === node.id) return { ...item, orderIndex: target.orderIndex, reviewStatus: "مرشح" as const, updatedAt: new Date().toISOString() };
    if (item.id === target.id) return { ...item, orderIndex: node.orderIndex, reviewStatus: "مرشح" as const, updatedAt: new Date().toISOString() };
    return item;
  });
  state.structureNodes = resequenceStructureNodes(next);
  state.structureDirty = true;
  state.structureMessage = "تغير ترتيب الهيكل؛ احفظ التعديلات.";
  render();
}

async function saveCurrentSourceStructure(sourceId: string, approve: boolean): Promise<void> {
  if (!centralSourceStore || state.sourceStorageStatus !== "متصل") {
    showToast("يلزم الاتصال بالسجل المركزي لحفظ الهيكل.");
    return;
  }
  const validation = validateSourceStructure(state.structureNodes);
  if (!validation.valid) {
    showToast(validation.issues[0] ?? "أكمل بيانات الهيكل قبل الحفظ.");
    return;
  }
  state.structureBusy = true;
  state.structureMessage = approve ? "جارٍ اعتماد الهيكل…" : "جارٍ حفظ التعديلات…";
  render();
  try {
    const now = new Date().toISOString();
    const nodes = resequenceStructureNodes(state.structureNodes).map((node) => ({
      ...node,
      reviewStatus: approve ? "معتمد" as const : node.reviewStatus,
      updatedAt: now,
    }));
    await centralSourceStore.replaceSourceStructure(sourceId, nodes);
    state.structureNodes = nodes;
    state.structureBusy = false;
    state.structureDirty = false;
    state.structureMessage = approve ? "تم اعتماد الهيكل وحفظه مركزيًا." : "تم حفظ مسودة الهيكل مركزيًا.";
    render();
    showToast(state.structureMessage);
  } catch (error) {
    state.structureBusy = false;
    state.structureMessage = error instanceof Error ? error.message : "تعذر حفظ هيكل المصدر.";
    render();
    showToast(state.structureMessage);
  }
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
