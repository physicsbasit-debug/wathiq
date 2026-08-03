# تعليمات رفع Phase 2-C4 Fix 3

## اسم الفرع

`phase-2c4-fix3-server-owned-question-pattern`

## رسالة الحفظ

`fix: make question pattern server-owned`

## الرفع

1. أنشئ الفرع من آخر `main` التي تحتوي Phase 2-C4 Fix 2.
2. فك حزمة الملفات المعدلة فقط.
3. ارفع محتوياتها إلى جذر المستودع مع الاستبدال.
4. انتظر GitHub Actions. النتيجة المطلوبة: `430 passed, 0 failed`.
5. ادمج الفرع في `main` بعد ظهور الأخضر.

## Supabase

بعد الدمج أعد نشر وظيفة واحدة فقط:

`generate-source-questions`

باستخدام:

`supabase/functions/generate-source-questions/index.ts`

لا تعد نشر `question-visual-jobs`.

## لا يلزم

- لا SQL جديد.
- لا سر جديد.
- لا إعادة فهرسة.
- لا إعادة رفع الكتاب.
- لا رفع دليل المعلم.

## اختبار القبول

1. نفذ `Ctrl + F5`.
2. افتح المسودة نفسها واضغط «التالي».
3. يجب ألا يظهر خطأ اختلاف `questionForm` عن `styleTarget`.
4. يظل الخادم يفحص أن مضمون السؤال حسابي أو مقارن أو استقصائي وفق الخطة، لكنه لا يعتمد على تصنيف نصي يعيده Gemini.
