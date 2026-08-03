# خطوات نشر Phase 2-C4 Fix 2

1. أنشئ فرعًا من `main` التي تحتوي Phase 2-C4 Fix 1.
2. ارفع محتويات حزمة `changed_files_only` إلى جذر المستودع مع الاستبدال.
3. استخدم رسالة الحفظ:
   `fix: make scientific item server-owned across generation and repair`
4. انتظر GitHub Actions؛ النتيجة المطلوبة: `427 passed, 0 failed`.
5. ادمج الفرع في `main`.
6. في Supabase أعد نشر وظيفة `generate-source-questions` من الملف:
   `supabase/functions/generate-source-questions/index.ts`
7. لا تنفذ SQL، ولا تعِد نشر `question-visual-jobs`.
8. نفذ تحديثًا قويًا للصفحة، ثم افتح المسودة نفسها واضغط «التالي».
