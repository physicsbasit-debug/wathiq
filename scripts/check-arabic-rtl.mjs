import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [html, css, app, curriculum, domain, exporter] = await Promise.all([
  read("index.html"),
  read("src/styles.css"),
  read("src/app.ts"),
  read("src/cambridge-curriculum.ts"),
  read("src/domain.ts"),
  read("src/exam-export.ts"),
]);

const failures = [];
if (!/<html[^>]*lang="ar"[^>]*dir="rtl"/iu.test(html) && !/<html[^>]*dir="rtl"[^>]*lang="ar"/iu.test(html)) {
  failures.push("index.html لا يثبت العربية وRTL من الجذر.");
}
if (!/html, body, #app\s*\{[^}]*direction:\s*rtl/iu.test(css)) failures.push("CSS لا يثبت RTL على جذر التطبيق.");
if (!/input, select, textarea\s*\{[^}]*direction:\s*rtl/iu.test(css)) failures.push("حقول الإدخال لا تملك اتجاه RTL صريحًا.");
if (!/\.mobile-nav\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/iu.test(css)) failures.push("تنقل الهاتف لا يطابق الشاشات العربية الثلاث الحالية.");
if (!/function userFacingError\([^)]*\)[\s\S]*\\u0600-\\u06FF/u.test(app)) failures.push("لا توجد بوابة تمنع رسائل المزود الإنجليزية الخام من الظهور للمستخدم.");
if (!/<!doctype html><html lang="ar" dir="rtl"/u.test(exporter)) failures.push("تصدير وورد/HTML لا يثبت العربية وRTL من الجذر.");
if (!/html\s*\{\s*direction:\s*rtl/iu.test(exporter)) failures.push("CSS التصدير لا يثبت RTL.");

if (!app.includes('navButton("home", "الرئيسية"') || !app.includes('navButton("wizard", "اختبار جديد"') || !app.includes('navButton("library", "اختباراتي"')) {
  failures.push("التنقل الأساسي لا يحتوي الشاشات العربية الثلاث المعتمدة.");
}
if (/data-nav="(?:content|admin)"|"content"\s*\||"admin"\s*\|/u.test(app)) failures.push("عاد مسار واجهة قديم إلى التنقل.");

const visibleSources = [app, curriculum, domain];
const forbiddenVisible = [
  "Static electricity",
  "Cambridge Primary",
  "Cambridge Lower Secondary",
  "Cambridge IGCSE",
  "Stage ",
  "Google Drive",
  "Double Award",
  "Word (.doc)",
  "الطالب Word",
  "الإجابة Word",
  "This model is currently experiencing high demand",
  "Token has been expired or revoked",
  "Token has expired or been revoked",
  "إدارة المحتوى",
  "مصادر اختيارية",
];
for (const token of forbiddenVisible) {
  if (visibleSources.some((text) => text.includes(token))) failures.push(`نص واجهة غير عربي أو قديم: ${token}`);
}

if (!app.includes("الصف / المرحلة") || !app.includes("الموضوع / الدرس")) failures.push("واجهة اختيار المنهج لا تعرض حقول الصف والمادة والموضوع بالعربية.");
if (app.includes('id="lesson-topics-input"') || app.includes('id="programme-select"')) failures.push("عادت واجهة الإدخال الحر أو اختيار البرنامج القديمة بدل القوائم المبسطة.");
if (!app.includes("اسم الموضوع يكفي")) failures.push("واجهة البداية لا تعرض فلسفة واثق المبسطة بالعربية.");
if (!app.includes("جدول المواصفات") || !app.includes("المواصفة الرسمية المعتمدة")) failures.push("واجهة الإعداد لا تعرض جدول المواصفات العربي.");
if (app.includes("data-count-key") || app.includes("apply-suggestion") || app.includes("countField(")) failures.push("عادت أدوات تعديل عدد المفردات يدويًا رغم أن جدول المواصفات يحكم الخطة.");
if (!app.includes("الاختبار القصير الأول") && !app.includes("EXAM_TITLE_OPTIONS")) failures.push("واجهة الاختبار لا تعتمد عناوين الاختبارات الرسمية الحالية.");
if (!curriculum.includes("كامبريدج للعلوم في المرحلة الابتدائية") || !curriculum.includes("كامبريدج للعلوم في المرحلة الإعدادية")) {
  failures.push("تسميات مسارات كامبريدج ليست عربية بالكامل.");
}

if (failures.length) {
  console.error("FAIL: Arabic RTL gate");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("PASS: Arabic RTL gate | root + navigation + exports + provider-message safeguards");
