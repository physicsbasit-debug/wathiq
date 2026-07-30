# تعليمات رفع Phase 1-B7

## اسم الفرع

`phase-1b7-evidence-anchor-fix`

## رسالة الحفظ

`fix: anchor generated questions to server evidence fragments`

## الخطوات

1. أنشئ الفرع بالاسم أعلاه.
2. ارفع محتويات حزمة الملفات المعدلة فقط إلى جذر المستودع مع الاستبدال.
3. انتظر نجاح GitHub Actions.
4. ادمج الفرع في `main`.
5. افتح `supabase/functions/generate-source-questions/index.ts` من `main` عبر **Raw**.
6. الصق الملف كاملًا في وظيفة Supabase الحالية `generate-source-questions` واضغط **Deploy function**.
7. حدّث واثق بـ `Ctrl + F5`.
8. افتح الاختبار السابق واضغط **التالي**؛ سيكمل المفردات الأربع المتبقية فقط.

لا يوجد SQL جديد، ولا حاجة لتغيير `GEMINI_API_KEY` أو إعادة فهرسة الكتاب.
