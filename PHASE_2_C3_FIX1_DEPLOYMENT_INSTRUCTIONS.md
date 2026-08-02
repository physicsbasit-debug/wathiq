# Phase 2-C3 Fix 1 — تعليمات الدمج والنشر

## الأساس المطلوب
يجب أن تكون `main` متضمنة Phase 2-C3 بالإصدار `0.0.55` قبل رفع هذه الحزمة.

## GitHub
1. أنشئ فرعًا جديدًا من `main` باسم:
   `phase-2c3-fix1-structured-scenario-repair`
2. فك ضغط حزمة `changed_files_only`.
3. ارفع محتوياتها إلى جذر المستودع مع الاستبدال.
4. رسالة الحفظ:
   `fix: add structured scenario contracts and per-item repair`
5. انتظر GitHub Actions. النتيجة المطلوبة:
   `409 passed, 0 failed`
6. ادمج الفرع بعد ظهور الفحص الأخضر.

## Supabase
بعد الدمج أعد نشر الملف التالي فقط داخل وظيفة `generate-source-questions`:
`supabase/functions/generate-source-questions/index.ts`

لا يلزم:
- SQL جديد.
- Edge Function جديدة.
- سر جديد.
- إعادة فهرسة.
- إعادة رفع الكتاب أو دليل المعلم.

## اختبار القبول الحي
1. نفذ `Ctrl + F5`.
2. افتح المسودة نفسها أو أنشئ اختبارًا قصيرًا جديدًا بمحرك V2.
3. تحقق أن رفض سياق مفردة واحدة لا يعيد الاختبار كاملًا.
4. في سجلات Edge يجب أن يظهر عند الحاجة:
   `per_item_validation_failed`
   ثم محاولة للمفردة المرفوضة فقط.
5. بعد اكتمال الأسئلة تبدأ مهام الصور الدائمة المعتادة من Phase 2-C3.
