# نشر Phase 2-C4 Fix 1

## GitHub

1. يجب أن تكون `main` متضمنة Phase 2-C4 بالإصدار `0.0.57`.
2. أنشئ فرعًا باسم:
   `phase-2c4-fix1-lean-gemini-schema`
3. ارفع محتويات حزمة `changed_files_only` إلى جذر المستودع مع الاستبدال.
4. رسالة الحفظ:
   `fix: separate Gemini transport schema from domain validation`
5. انتظر GitHub Actions. النتيجة المطلوبة:
   `422 passed, 0 failed`
6. ادمج Pull Request بعد ظهور اللون الأخضر.

## Supabase

أعد نشر هذه الوظيفة فقط:

- `supabase/functions/generate-source-questions/index.ts`

لا تعد نشر `question-visual-jobs`، ولا تشغّل SQL جديدًا.

## اختبار القبول

بعد النشر نفّذ تحديثًا قويًا، ثم افتح المسودة نفسها واضغط «التالي». يجب ألا يظهر خطأ رفض مخطط JSON المعقد. يبقى الخادم مسؤولًا عن التحقق من عدد المفردات والبدائل والأدلة ونقاط التصحيح والنموذج العلمي الموحد.
