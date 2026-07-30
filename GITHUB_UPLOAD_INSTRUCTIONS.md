# تعليمات رفع Phase 1-B3

- اسم الفرع: `phase-1b3-multi-lessons-batched-generation`
- رسالة الحفظ: `feat: support multi-lesson short tests`
- ارفع محتويات حزمة **الملفات المعدلة فقط** إلى جذر المستودع مع الاستبدال.
- انتظر GitHub Actions حتى تصبح خضراء، ثم ادمج الفرع في `main`.
- لا يوجد SQL جديد، ولا تغيير في أسماء أسرار Supabase.
- بعد الدمج افتح في GitHub:
  `supabase/functions/generate-source-questions/index.ts`
- انسخ الملف كاملًا عبر **Raw**، ثم الصقه في الوظيفة الموجودة بالاسم نفسه داخل **محرر Supabase** واضغط **Deploy function**.
- بعد اكتمال GitHub Pages نفذ تحديثًا قويًا، ثم اختبر إدخال 2-5 دروس وتوليد الأسئلة.
