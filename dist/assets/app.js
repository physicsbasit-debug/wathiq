import { MOCK_LIBRARY, MOCK_SOURCES, SUBJECTS } from "./data.js";
import { buildPlan, createEmptyDraft, generateProposals, isPlanComplete, selectedProposal, validateExamSetup, } from "./domain.js";
import { clearDraft, loadDraft, loadProfile, saveDraft, saveProfile } from "./storage.js";
import { escapeHtml, formatArabicDate, icon } from "./ui.js";
const appRoot = document.querySelector("#app");
if (!appRoot)
    throw new Error("تعذر العثور على جذر التطبيق.");
const app = appRoot;
const savedDraft = loadDraft();
const savedProfile = loadProfile();
const initialDraft = savedDraft ?? createEmptyDraft();
if (savedProfile) {
    initialDraft.school = savedProfile.school;
    initialDraft.directorate = savedProfile.directorate;
}
const state = {
    view: "home",
    draft: initialDraft,
    saveState: savedDraft ? "محفوظ" : "غير محفوظ",
    libraryFilter: "الكل",
    toast: "",
};
let saveTimer;
function scheduleSave() {
    state.saveState = "جارٍ الحفظ";
    renderTopSaveState();
    if (saveTimer)
        window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
        state.draft.updatedAt = new Date().toISOString();
        saveDraft(state.draft);
        saveProfile({ school: state.draft.school, directorate: state.draft.directorate });
        state.saveState = "محفوظ";
        renderTopSaveState();
    }, 650);
}
function saveNow() {
    if (saveTimer)
        window.clearTimeout(saveTimer);
    state.draft.updatedAt = new Date().toISOString();
    saveDraft(state.draft);
    saveProfile({ school: state.draft.school, directorate: state.draft.directorate });
    state.saveState = "محفوظ";
    showToast("تم حفظ أحدث حالة للمسودة.");
}
function showToast(message) {
    state.toast = message;
    render();
    window.setTimeout(() => {
        if (state.toast === message) {
            state.toast = "";
            render();
        }
    }, 2200);
}
function navigate(view) {
    state.view = view;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
}
function setStep(step) {
    state.draft.currentStep = step;
    scheduleSave();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
}
function render() {
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
function renderHeader() {
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
function navButton(view, label, iconName) {
    const active = state.view === view;
    return `<button class="nav-button ${active ? "active" : ""}" data-nav="${view}" ${active ? 'aria-current="page"' : ""}>${icon(iconName)}<span>${label}</span></button>`;
}
function renderMobileNav() {
    return `
    <nav class="mobile-nav" aria-label="التنقل للجوال">
      ${navButton("home", "الرئيسية", "home")}
      ${navButton("wizard", "جديد", "plus")}
      ${navButton("library", "اختباراتي", "files")}
      ${navButton("admin", "الإدارة", "admin")}
    </nav>
  `;
}
function renderView() {
    if (state.view === "home")
        return renderHome();
    if (state.view === "wizard")
        return renderWizard();
    if (state.view === "library")
        return renderLibrary();
    return renderAdmin();
}
function renderHome() {
    const hasDraft = Boolean(loadDraft());
    return `
    <section class="hero-panel">
      <div class="hero-copy">
        <span class="eyebrow">نسخة المرحلة 0-B</span>
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
function renderWizard() {
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
function wizardTitle(step) {
    return { 1: "حدد المحتوى", 2: "اضبط الاختبار", 3: "اختر الأسئلة", 4: "راجع واعتمد" }[step];
}
function renderStepper() {
    const steps = [
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
function renderWizardStep() {
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
function renderContentStep() {
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
function checkboxCard(group, id, label, checked) {
    return `<label class="check-card ${checked ? "selected" : ""}"><input type="checkbox" data-group="${group}" value="${id}" ${checked ? "checked" : ""}/><span class="check-box">${checked ? icon("check") : ""}</span><b>${escapeHtml(label)}</b></label>`;
}
function renderSetupStep() {
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
function inputField(id, label, value, type, placeholder = "", min = "") {
    return `<label class="field"><span>${label}</span><input id="${id}" type="${type}" value="${escapeHtml(value)}" ${placeholder ? `placeholder="${placeholder}"` : ""} ${min ? `min="${min}"` : ""}/></label>`;
}
function countField(key, label, value, description) {
    return `<div class="count-card"><div><strong>${label}</strong><small>${description}</small></div><div class="counter"><button data-count-key="${key}" data-count-change="-1" aria-label="تقليل ${label}">−</button><input data-count-input="${key}" type="number" min="0" value="${value}" aria-label="عدد أسئلة ${label}"/><button data-count-key="${key}" data-count-change="1" aria-label="زيادة ${label}">+</button></div></div>`;
}
function renderCompliance(validation) {
    if (validation.valid) {
        return `<div class="compliance success">${icon("check")}<div><strong>الخطة الأولية متوافقة</strong><p>يمكنك الانتقال لبناء خطة الاختبار واختيار المقترحات.</p></div></div>`;
    }
    return `<div class="compliance warning"><div class="warning-mark">!</div><div><strong>تحتاج بعض البيانات إلى ضبط</strong><ul>${validation.issues.map((issue) => `<li>${escapeHtml(issue.message)}</li>`).join("")}</ul>${validation.suggestedCounts ? `<button class="secondary-btn compact" data-action="apply-suggestion">تطبيق التوزيع المقترح: ${validation.suggestedCounts.mcq} متعدد، ${validation.suggestedCounts.short} قصيرة، ${validation.suggestedCounts.long} طويلة</button>` : ""}</div></div>`;
}
function renderPlanStep() {
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
function renderPlanItem(item, index) {
    const chosen = state.draft.selectedProposalByPlanItem[item.id];
    return `<article class="plan-card">
    <header><div class="question-number">${index + 1}</div><div><h3>${item.questionType}</h3><p>${escapeHtml(item.lessonLabel)} · ${escapeHtml(item.outcomeLabel)}</p></div><div class="plan-tags"><span>${item.cognitiveLevel}</span><span>${item.marks} ${item.marks === 1 ? "درجة" : "درجات"}</span></div></header>
    <div class="proposal-grid">${item.proposals.map((proposal, proposalIndex) => `<label class="proposal-card ${chosen === proposal.id ? "selected" : ""}"><input type="radio" name="proposal-${item.id}" data-plan-id="${item.id}" value="${proposal.id}" ${chosen === proposal.id ? "checked" : ""}/><div class="proposal-top"><span>المقترح ${proposalIndex + 1}</span>${proposal.visualKind ? `<b>${proposal.visualKind}</b>` : ""}</div><p>${escapeHtml(proposal.text)}</p><span class="choose-label">${chosen === proposal.id ? `${icon("check")} تم الاختيار` : "اختر هذا السؤال"}</span></label>`).join("")}</div>
    <footer><button class="text-btn" data-regenerate="${item.id}">${icon("spark")} توليد ثلاثة بدائل جديدة لهذه المفردة</button></footer>
  </article>`;
}
function renderReviewStep() {
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
function checkRow(label, okay) {
    return `<div class="check-row"><span>${okay ? icon("check") : "!"}</span><b>${label}</b><small>${okay ? "سليم" : "يحتاج مراجعة"}</small></div>`;
}
function renderWizardFooter(step, canContinue = true) {
    return `<footer class="wizard-footer">${step > 1 ? `<button class="secondary-btn" data-action="previous-step">السابق</button>` : `<button class="secondary-btn" data-nav="home">إلغاء</button>`}<div>${step < 4 ? `<button class="primary-btn" data-action="next-step" ${canContinue ? "" : "disabled"}>التالي ${icon("arrow")}</button>` : `<button class="secondary-btn" data-nav="library">الذهاب إلى اختباراتي</button>`}</div></footer>`;
}
function renderLibrary() {
    const localDraft = loadDraft();
    const exams = [
        ...(localDraft ? [{ id: localDraft.id, title: localDraft.title || "مسودة اختبار بلا عنوان", subject: SUBJECTS.find((item) => item.id === localDraft.subjectId)?.label ?? "غير محددة", grade: localDraft.grade ?? 0, status: "مسودة", date: localDraft.updatedAt.slice(0, 10), progress: localDraft.currentStep * 25 }] : []),
        ...MOCK_LIBRARY,
    ].filter((exam) => state.libraryFilter === "الكل" || exam.status === state.libraryFilter);
    return `
    <section class="page-heading"><div><span class="eyebrow">مكتبتك الخاصة</span><h1>اختباراتي</h1><p>المسودات والاختبارات المعتمدة، لا شيء أكثر. البساطة ليست نقصًا، بل إنقاذ.</p></div><button class="primary-btn" data-action="new-exam">${icon("plus")} اختبار جديد</button></section>
    <div class="filter-bar"><div class="segmented small">${["الكل", "مسودة", "معتمد"].map((filter) => `<button data-library-filter="${filter}" class="${state.libraryFilter === filter ? "active" : ""}">${filter}</button>`).join("")}</div><label class="search-field"><span>بحث</span><input id="library-search" placeholder="ابحث بالعنوان أو المادة"/></label></div>
    <div class="library-grid" id="library-grid">${exams.map(renderExamCard).join("") || `<div class="empty-state"><h2>لا توجد نتائج</h2><p>جرّب مرشحًا آخر بدل معاقبة قاعدة البيانات بنظرات الاستغراب.</p></div>`}</div>
  `;
}
function renderExamCard(exam) {
    return `<article class="exam-card" data-search-text="${escapeHtml(`${exam.title} ${exam.subject} ${exam.grade}`)}"><div class="exam-card-head"><span class="status-badge ${exam.status === "معتمد" ? "approved" : "draft"}">${exam.status}</span>${exam.hasModelB ? `<span class="model-badge">أ + ب</span>` : ""}</div><h2>${escapeHtml(exam.title)}</h2><p>${escapeHtml(exam.subject)} · الصف ${exam.grade || "غير محدد"}</p><div class="exam-meta"><span>${formatArabicDate(exam.date)}</span>${exam.progress ? `<span>${exam.progress}% مكتمل</span>` : ""}</div>${exam.progress ? `<div class="progress-track"><span style="width:${exam.progress}%"></span></div>` : ""}<div class="exam-actions">${exam.status === "مسودة" ? `<button class="primary-btn compact" data-action="resume-draft">متابعة</button><button class="ghost-btn compact" data-action="delete-draft">حذف</button>` : `<button class="secondary-btn compact" data-action="mock-download">تنزيل Word</button><button class="ghost-btn compact" data-action="mock-download">تنزيل PDF</button>`}</div></article>`;
}
function renderAdmin() {
    return `
    <section class="page-heading"><div><span class="eyebrow">لوحة مالك المنصة</span><h1>إدارة المحتوى</h1><p>هيكل أولي فقط. الربط الحقيقي مع Google Drive واستخراج PDF يأتي في مراحله المخصصة، لا في حفلة واحدة.</p></div><span class="demo-badge">محاكاة محلية</span></section>
    <section class="admin-grid">
      <article class="admin-action"><span>${icon("files")}</span><h2>إضافة ملف PDF</h2><p>حدد نوع المصدر والصف والمادة، ثم يوجّه واثق الملف لاحقًا إلى مكانه الصحيح في Drive.</p><button class="secondary-btn" data-action="open-source-modal" data-source-kind="file">تهيئة مصدر ملف</button></article>
      <article class="admin-action"><span>${icon("spark")}</span><h2>إضافة رابط عالمي</h2><p>تسجيل موقع موثوق كمصدر، مع حفظ الرابط وتاريخ الجلب وحالة حقوق الاستخدام.</p><button class="secondary-btn" data-action="open-source-modal" data-source-kind="url">تهيئة رابط مصدر</button></article>
    </section>
    <section class="source-layout-card"><div><h2>ترتيب Drive المعتمد</h2><p>المصادر والمخرجات في مسارين منفصلين. أخيرًا مجلد لا يحتاج عرّافًا لفهمه.</p></div><pre>واثق/
├── 01_مصادر_المنصة/
│   ├── المنهج_العماني/
│   ├── اختبارات_كامبريدج/
│   ├── مصادر_عالمية_إضافية/
│   └── أرشيف_الإصدارات/
└── 02_الاختبارات_المنتجة/
    ├── العلوم/
    ├── الفيزياء/
    ├── الكيمياء/
    └── الأحياء/</pre></section>
    <section class="source-table-wrap"><div class="selection-header"><div><h2>مصادر تجريبية</h2><p>لا توجد عمليات رفع حقيقية في هذه المرحلة.</p></div></div><div class="source-table">${MOCK_SOURCES.map((source) => `<div class="source-row"><div><strong>${source.name}</strong><small>${source.kind}</small></div><span>${source.subject} · الصف ${source.grade}</span><b class="source-status">${source.status}</b></div>`).join("")}</div></section>
  `;
}
function bindEvents() {
    document.querySelectorAll("[data-nav]").forEach((element) => {
        element.addEventListener("click", () => navigate(element.dataset.nav));
    });
    document.querySelectorAll("[data-step]").forEach((element) => {
        element.addEventListener("click", () => setStep(Number(element.dataset.step)));
    });
    document.querySelectorAll("[data-action]").forEach((element) => {
        element.addEventListener("click", () => handleAction(element.dataset.action ?? "", element));
    });
    bindContentStep();
    bindSetupStep();
    bindPlanStep();
    bindLibrary();
}
function handleAction(action, element) {
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
        if (loaded)
            state.draft = loaded;
        navigate("wizard");
        return;
    }
    if (action === "save-now")
        return saveNow();
    if (action === "previous-step")
        return setStep(Math.max(1, state.draft.currentStep - 1));
    if (action === "next-step")
        return nextStep();
    if (action === "select-all-lessons")
        return selectAllLessons();
    if (action === "select-all-outcomes")
        return selectAllOutcomes();
    if (action === "apply-suggestion")
        return applySuggestedCounts();
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
    if (action === "open-source-modal") {
        showToast(element.dataset.sourceKind === "url" ? "واجهة إضافة الروابط ستنفذ في مرحلة المصادر." : "واجهة رفع الملفات ستنفذ في مرحلة المصادر.");
    }
}
function nextStep() {
    const step = state.draft.currentStep;
    if (step === 1) {
        const basicReady = state.draft.grade !== null && state.draft.subjectId && state.draft.unitId && state.draft.lessonIds.length && state.draft.outcomeIds.length;
        if (!basicReady)
            return showToast("أكمل الصف والمادة والوحدة والدروس ونواتج التعلم أولًا.");
        if (!state.draft.title) {
            const subject = SUBJECTS.find((item) => item.id === state.draft.subjectId)?.label ?? "العلوم";
            state.draft.title = `الاختبار القصير الأول في ${subject}`;
        }
        return setStep(2);
    }
    if (step === 2) {
        const validation = validateExamSetup(state.draft);
        if (!validation.valid)
            return showToast("اضبط البيانات المشار إليها قبل المتابعة.");
        state.draft.plan = buildPlan(state.draft);
        state.draft.selectedProposalByPlanItem = {};
        return setStep(3);
    }
    if (step === 3) {
        if (!isPlanComplete(state.draft))
            return showToast("اختر سؤالًا واحدًا لكل مفردة.");
        return setStep(4);
    }
}
function bindContentStep() {
    const gradeSelect = document.querySelector("#grade-select");
    gradeSelect?.addEventListener("change", () => {
        state.draft.grade = gradeSelect.value ? Number(gradeSelect.value) : null;
        state.draft.subjectId = "";
        state.draft.unitId = "";
        state.draft.lessonIds = [];
        state.draft.outcomeIds = [];
        scheduleSave();
        render();
    });
    const subjectSelect = document.querySelector("#subject-select");
    subjectSelect?.addEventListener("change", () => {
        state.draft.subjectId = subjectSelect.value;
        state.draft.unitId = "";
        state.draft.lessonIds = [];
        state.draft.outcomeIds = [];
        scheduleSave();
        render();
    });
    const unitSelect = document.querySelector("#unit-select");
    unitSelect?.addEventListener("change", () => {
        state.draft.unitId = unitSelect.value;
        state.draft.lessonIds = [];
        state.draft.outcomeIds = [];
        scheduleSave();
        render();
    });
    document.querySelectorAll('input[data-group="lesson"]').forEach((input) => {
        input.addEventListener("change", () => {
            toggleArrayValue(state.draft.lessonIds, input.value, input.checked);
            const validOutcomeIds = getSelectedLessons().flatMap((lesson) => lesson.outcomes.map((outcome) => outcome.id));
            state.draft.outcomeIds = state.draft.outcomeIds.filter((id) => validOutcomeIds.includes(id));
            scheduleSave();
            render();
        });
    });
    document.querySelectorAll('input[data-group="outcome"]').forEach((input) => {
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
function selectAllLessons() {
    const unit = getSelectedUnit();
    state.draft.lessonIds = unit?.lessons.map((lesson) => lesson.id) ?? [];
    state.draft.outcomeIds = [];
    scheduleSave();
    render();
}
function selectAllOutcomes() {
    state.draft.outcomeIds = getSelectedLessons().flatMap((lesson) => lesson.outcomes.map((outcome) => outcome.id));
    scheduleSave();
    render();
}
function toggleArrayValue(array, value, enabled) {
    const index = array.indexOf(value);
    if (enabled && index === -1)
        array.push(value);
    if (!enabled && index >= 0)
        array.splice(index, 1);
}
function bindSetupStep() {
    const inputBindings = [
        ["title-input", "title"],
        ["date-input", "examDate"],
        ["school-input", "school"],
        ["directorate-input", "directorate"],
        ["academic-year-input", "academicYear"],
    ];
    inputBindings.forEach(([id, key]) => {
        document.querySelector(`#${id}`)?.addEventListener("input", (event) => {
            state.draft[key] = event.target.value;
            scheduleSave();
        });
    });
    document.querySelector("#semester-select")?.addEventListener("change", (event) => {
        state.draft.semester = event.target.value;
        scheduleSave();
    });
    document.querySelector("#duration-input")?.addEventListener("change", (event) => {
        state.draft.durationMinutes = Number(event.target.value);
        scheduleSave();
        render();
    });
    document.querySelector("#marks-input")?.addEventListener("change", (event) => {
        state.draft.totalMarks = Number(event.target.value);
        scheduleSave();
        render();
    });
    document.querySelectorAll("[data-difficulty]").forEach((button) => {
        button.addEventListener("click", () => {
            state.draft.difficulty = button.dataset.difficulty;
            scheduleSave();
            render();
        });
    });
    document.querySelectorAll("[data-count-change]").forEach((button) => {
        button.addEventListener("click", () => {
            const key = button.dataset.countKey;
            const change = Number(button.dataset.countChange);
            state.draft.counts[key] = Math.max(0, state.draft.counts[key] + change);
            scheduleSave();
            render();
        });
    });
    document.querySelectorAll("[data-count-input]").forEach((input) => {
        input.addEventListener("change", () => {
            const key = input.dataset.countInput;
            state.draft.counts[key] = Math.max(0, Number(input.value));
            scheduleSave();
            render();
        });
    });
}
function applySuggestedCounts() {
    const suggestion = validateExamSetup(state.draft).suggestedCounts;
    if (!suggestion)
        return;
    state.draft.counts = suggestion;
    scheduleSave();
    render();
}
function bindPlanStep() {
    document.querySelectorAll("[data-plan-id]").forEach((input) => {
        input.addEventListener("change", () => {
            const planId = input.dataset.planId;
            if (!planId)
                return;
            state.draft.selectedProposalByPlanItem[planId] = input.value;
            scheduleSave();
            render();
        });
    });
    document.querySelectorAll("[data-regenerate]").forEach((button) => {
        button.addEventListener("click", () => {
            const planId = button.dataset.regenerate;
            const item = state.draft.plan.find((entry) => entry.id === planId);
            if (!item)
                return;
            const seed = Date.now() % 1000;
            item.proposals = generateProposals(item.id, item.questionType, item.cognitiveLevel, item.outcomeLabel, seed);
            delete state.draft.selectedProposalByPlanItem[item.id];
            scheduleSave();
            render();
            showToast("تم تجديد المقترحات لهذه المفردة فقط.");
        });
    });
}
function bindLibrary() {
    document.querySelectorAll("[data-library-filter]").forEach((button) => {
        button.addEventListener("click", () => {
            state.libraryFilter = button.dataset.libraryFilter;
            render();
        });
    });
    document.querySelector("#library-search")?.addEventListener("input", (event) => {
        const query = event.target.value.trim().toLowerCase();
        document.querySelectorAll(".exam-card").forEach((card) => {
            card.hidden = !(card.dataset.searchText ?? "").toLowerCase().includes(query);
        });
    });
}
function renderTopSaveState() {
    const labels = [document.querySelector("#save-label"), document.querySelector("#save-label-secondary")];
    labels.forEach((label) => {
        if (label)
            label.textContent = state.saveState;
    });
}
render();
//# sourceMappingURL=app.js.map