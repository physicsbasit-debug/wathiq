# تعليمات رفع Phase 1-B6

## اسم الفرع

`phase-1b6-gemini-generate-content-fix`

## رسالة الحفظ

`fix: use Gemini generateContent structured output`

## الخطوات

1. أنشئ الفرع بالاسم أعلاه.
2. ارفع محتويات حزمة الملفات المعدلة فقط إلى جذر المستودع مع الاستبدال.
3. انتظر نجاح GitHub Actions.
4. ادمج الفرع في `main`.
5. افتح `supabase/functions/generate-source-questions/index.ts` من `main` عبر **Raw**.
6. الصق الملف كاملًا في وظيفة Supabase الحالية `generate-source-questions` واضغط **Deploy function**.
7. حدّث واثق بـ `Ctrl + F5` واختبر الاختبار القصير نفسه.

لا يوجد SQL جديد، ولا حاجة لتغيير `GEMINI_API_KEY` أو إعادة فهرسة الكتاب.
