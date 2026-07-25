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
import type { ExamDraft, ManagedSource, PlanItem, QuestionCounts, SourceDraft, SourceStatus, ViewName, WizardStep } from "./types.js";
import { escapeHtml, formatArabicDate, icon } from "./ui.js";
import { buildSourceDrivePath, changeSourceStatus, createEmptySourceDraft, createManagedSource, findDuplicateSource, SOURCE_KINDS, validateSourceDraft } from "./source-domain.js";
import { createRegistryBackup, mergeSourceRegistry, parseRegistryBackup } from "./source-registry.js";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("تعذر العثور على جذر التطبيق.");
const app: HTMLDivElement = appRoot;

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
}

const savedDraft = loadDraft();
const savedProfile = loadProfile();
const initialDraft = savedDraft ?? createEmptyDraft();
if (savedProfile) {
  initialDraft.school = savedProfile.school;
  initialDraft.directorate = savedProfile.directorate;
}

const state: AppState = {
  view: "home",
  draft: initialDraft,
  saveState: savedDraft ? "محفوظ" : "غير محفوظ",
  libraryFilter: "الكل",
  toast: "",
  sources: loadSources() ?? MOCK_SOURCES,
  sourceFormOpen: false,
  sourceDraft: createEmptySourceDraft(),
  sourceFilter: "الكل",
  selectedSourceId: "",
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

function navigate(view: ViewName): void {
  state.view = view;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

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
        <span class="eyebrow">نسخة المرحلة 0-D</span>
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


function renderAdmin(): string {
  const activeSources = state.sources.filter((source) => source.status !== "مؤرشف").length;
  const indexedSources = state.sources.filter((source) => source.status === "مفهرس").length;
  const reviewSources = state.sources.filter((source) => source.status === "يحتاج مراجعة").length;
  const visibleSources = state.sources.filter((source) => state.sourceFilter === "الكل" || source.status === state.sourceFilter);
  const selectedSource = state.sources.find((source) => source.id === state.selectedSourceId);
  return `
    <section class="page-heading"><div><span class="eyebrow">لوحة مالك المنصة</span><h1>إدارة المصادر</h1><p>سجل منظم للمصادر قبل ربط التخزين السحابي. كل مصدر له رقم فهرسة، ومسار، وحالة واضحة، والنسخة الاحتياطية بيدك بدل أن تكون رهينة لمتصفح قرر النسيان.</p></div><span class="demo-badge">Phase 0-D · سجل محلي منظم</span></section>

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
      <div><h2>نسخة احتياطية لسجل المصادر</h2><p>التصدير يحفظ بيانات السجل فقط، لا ملفات PDF نفسها. الملفات الفعلية ستدخل Drive في مرحلة التكامل.</p></div>
      <div class="registry-buttons">
        <button class="secondary-btn compact" data-action="export-source-registry">تصدير JSON</button>
        <label class="ghost-btn compact file-button">استيراد JSON<input id="source-registry-file" type="file" accept="application/json,.json"/></label>
      </div>
    </section>

    ${state.sourceFormOpen ? renderSourceForm() : ""}
    ${selectedSource ? renderSourceDetails(selectedSource) : ""}

    <section class="source-table-wrap">
      <div class="source-list-heading">
        <div><h2>مكتبة المصادر</h2><p>يكشف واثق التكرار قبل الحفظ، ويمنح كل مصدر رقمًا ثابتًا يسهل تتبعه لاحقًا عند ربط Drive والفهرسة.</p></div>
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
        <label class="field"><span>الصف</span><select id="source-grade"><option value="">اختر الصف</option>${Array.from({ length: 12 }, (_, index) => index + 1).map((grade) => `<option value="${grade}" ${draft.grade === grade ? "selected" : ""}>الصف ${grade}</option>`).join("")}</select>${issueFor("grade") ? `<small class="field-error">${issueFor("grade")}</small>` : ""}</label>
        <label class="field"><span>المادة</span><select id="source-subject" ${draft.grade ? "" : "disabled"}><option value="">اختر المادة</option>${availableSourceSubjects.map((subject) => `<option value="${subject.id}" ${draft.subjectId === subject.id ? "selected" : ""}>${subject.label}</option>`).join("")}</select>${issueFor("subjectId") ? `<small class="field-error">${issueFor("subjectId")}</small>` : ""}</label>
        ${draft.mode === "file" ? `
          <label class="field full"><span>ملف PDF</span><input id="source-file" type="file" accept="application/pdf,.pdf"/><small>${draft.fileName ? `الملف المختار: ${escapeHtml(draft.fileName)}` : "في هذه المرحلة نحفظ اسم الملف فقط لاختبار الواجهة."}</small>${issueFor("fileName") ? `<small class="field-error">${issueFor("fileName")}</small>` : ""}</label>
        ` : `
          <label class="field full"><span>رابط المصدر</span><input id="source-url" type="url" value="${escapeHtml(draft.url)}" placeholder="https://example.org/source"/>${issueFor("url") ? `<small class="field-error">${issueFor("url")}</small>` : ""}</label>
          <label class="rights-check full"><input id="source-rights" type="checkbox" ${draft.rightsConfirmed ? "checked" : ""}/><span>راجعت حقوق الاستخدام وسياسة الموقع، وأسمح بتسجيل الرابط كمصدر مركزي.</span></label>
          ${issueFor("rightsConfirmed") ? `<p class="field-error full">${issueFor("rightsConfirmed")}</p>` : ""}
        `}
      </div>
      <div class="drive-path-preview"><span>المسار المقترح في Google Drive</span><code>${escapeHtml(path)}</code><small>معاينة فقط. النقل الحقيقي إلى Drive سيأتي في مرحلة تكامل مستقلة.</small></div>
      <footer><button class="secondary-btn" data-action="close-source-form">إلغاء</button><button class="primary-btn" data-action="save-source">حفظ المصدر محليًا</button></footer>
    </section>
  `;
}

function renderSourceDetails(source: ManagedSource): string {
  const subject = SUBJECTS.find((item) => item.id === source.subjectId)?.label ?? "غير محددة";
  const reference = source.mode === "file" ? source.fileName ?? "ملف PDF" : source.url ?? "رابط";
  return `
    <section class="source-details-card" aria-label="تفاصيل المصدر">
      <header><div><span class="eyebrow">تفاصيل المصدر</span><h2>${escapeHtml(source.title)}</h2></div><button class="ghost-btn compact" data-action="close-source-details">إغلاق</button></header>
      <div class="source-details-grid">
        <div><span>رقم الفهرسة</span><strong dir="ltr">${escapeHtml(source.catalogCode)}</strong></div>
        <div><span>الجهة</span><strong>${escapeHtml(source.authority)}</strong></div>
        <div><span>النوع</span><strong>${escapeHtml(source.kind)}</strong></div>
        <div><span>المادة والصف</span><strong>${escapeHtml(subject)} · الصف ${source.grade}</strong></div>
        <div><span>الإصدار</span><strong>${escapeHtml(source.version)}</strong></div>
        <div><span>الحالة</span><strong>${escapeHtml(source.status)}</strong></div>
        <div><span>أضيف في</span><strong>${formatArabicDate(source.createdAt.slice(0, 10))}</strong></div>
        <div><span>آخر تحديث</span><strong>${formatArabicDate(source.updatedAt.slice(0, 10))}</strong></div>
      </div>
      <div class="source-reference"><span>${source.mode === "file" ? "اسم الملف" : "الرابط"}</span><code>${escapeHtml(reference)}</code></div>
      <div class="source-reference"><span>مسار Google Drive المقترح</span><code>${escapeHtml(source.drivePath)}</code></div>
    </section>
  `;
}

function renderSourceRow(source: ManagedSource): string {
  const subject = SUBJECTS.find((item) => item.id === source.subjectId)?.label ?? "غير محددة";
  const sourceRef = source.mode === "file" ? source.fileName ?? "ملف PDF" : source.url ?? "رابط";
  const actions = source.status === "مؤرشف"
    ? `<button class="text-btn" data-action="view-source" data-source-id="${source.id}">تفاصيل</button><button class="text-btn" data-action="restore-source" data-source-id="${source.id}">استعادة</button>`
    : `<button class="text-btn" data-action="view-source" data-source-id="${source.id}">تفاصيل</button>${source.status !== "مفهرس" ? `<button class="text-btn" data-action="index-source" data-source-id="${source.id}">محاكاة الفهرسة</button>` : ""}<button class="text-btn danger-text" data-action="archive-source" data-source-id="${source.id}">أرشفة</button>`;
  return `<article class="source-row-card" data-source-search="${escapeHtml(`${source.title} ${source.catalogCode} ${source.authority} ${source.kind} ${subject} ${source.grade} ${source.version} ${sourceRef}`)}">
    <div class="source-main"><span class="source-mode-icon">${source.mode === "file" ? icon("files") : icon("spark")}</span><div><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.catalogCode)}</small></div></div>
    <div class="source-meta"><span>${escapeHtml(subject)} · الصف ${source.grade}</span><small>${escapeHtml(source.authority)} · ${escapeHtml(source.version)}</small></div>
    <span class="source-status status-${sourceStatusSlug(source.status)}">${source.status}</span>
    <div class="source-actions">${actions}</div>
    <code class="source-path">${escapeHtml(source.drivePath)}</code>
  </article>`;
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
  if (action === "open-source-form") {
    const mode = element.dataset.sourceKind === "url" ? "url" : "file";
    state.sourceDraft = createEmptySourceDraft(mode);
    state.sourceFormOpen = true;
    render();
    window.setTimeout(() => document.querySelector(".source-form-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    return;
  }
  if (action === "close-source-form") {
    state.sourceFormOpen = false;
    render();
    return;
  }
  if (action === "save-source") return saveSourceFromForm();
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
  if (action === "archive-source" && sourceId) return updateSourceStatus(sourceId, "مؤرشف", "تمت أرشفة المصدر دون حذفه.");
  if (action === "restore-source" && sourceId) return updateSourceStatus(sourceId, "جاهز للفهرسة", "تمت استعادة المصدر إلى المكتبة.");
  if (action === "index-source" && sourceId) return updateSourceStatus(sourceId, "مفهرس", "تمت محاكاة فهرسة المصدر بنجاح.");
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
    const file = (event.target as HTMLInputElement).files?.[0];
    state.sourceDraft.fileName = file?.name ?? "";
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

function saveSourceFromForm(): void {
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
  const source = createManagedSource(state.sourceDraft);
  state.sources = [source, ...state.sources];
  saveSources(state.sources);
  state.sourceFormOpen = false;
  state.sourceDraft = createEmptySourceDraft();
  render();
  showToast("تم حفظ المصدر محليًا وأصبح جاهزًا للفهرسة.");
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
  showToast(`تمت إضافة ${merged.addedCount} وتجاوز ${merged.skippedCount} مصدر مكرر.`);
}

function updateSourceStatus(sourceId: string, status: SourceStatus, message: string): void {
  state.sources = changeSourceStatus(state.sources, sourceId, status);
  saveSources(state.sources);
  render();
  showToast(message);
}

function renderTopSaveState(): void {
  const labels = [document.querySelector("#save-label"), document.querySelector("#save-label-secondary")];
  labels.forEach((label) => {
    if (label) label.textContent = state.saveState;
  });
}

render();
