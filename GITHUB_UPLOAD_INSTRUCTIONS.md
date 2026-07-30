# تعليمات رفع Phase 1-B4

- اسم الفرع: `phase-1b4-exam-title-date-fix`
- رسالة الحفظ: `feat: add exam title options and fix exam date state`
- ارفع محتويات حزمة **الملفات المعدلة فقط** إلى جذر المستودع مع الاستبدال.
- انتظر GitHub Actions حتى تصبح خضراء، ثم ادمج الفرع في `main`.
- لا يوجد SQL جديد، ولا تغيير في أسماء أسرار Supabase.
- بعد الدمج افتح في GitHub:
  `supabase/functions/generate-source-questions/index.ts`
- انسخ الملف كاملًا عبر **Raw**، ثم الصقه في الوظيفة الموجودة بالاسم نفسه داخل **محرر Supabase** واضغط **Deploy function**.
- بعد اكتمال GitHub Pages نفذ `Ctrl + F5`.
- اختبر أن عنوان الاختبار قائمة منسدلة، وأن التاريخ ينتقل مباشرة إلى الخطوة التالية.
