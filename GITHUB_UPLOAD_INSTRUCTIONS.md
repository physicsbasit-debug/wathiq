# رفع Phase 1-C2 Fix 5

## اسم الفرع
`phase-1c2-fix5-exact-mark-scheme`

## رسالة الحفظ
`fix: repair mark schemes without regenerating questions`

## خطوات الرفع
1. أنشئ الفرع بالاسم أعلاه من آخر `main`.
2. فك حزمة الملفات المعدلة وارفع محتوياتها إلى جذر المستودع مع الاستبدال.
3. انتظر GitHub Actions حتى تصبح خضراء.
4. ادمج الفرع في `main` وانتظر GitHub Pages.
5. افتح في GitHub الملف `supabase/functions/generate-source-questions/index.ts` عبر **Raw** وانسخه كاملًا.
6. استبدل كود وظيفة `generate-source-questions` في محرر Supabase واضغط **Deploy function**.
7. نفّذ `Ctrl + F5`، ثم افتح المسودة نفسها واضغط **التالي** لاستكمال المفردات الناقصة.

## لا يلزم
- لا إعادة فهرسة.
- لا SQL أو أسرار جديدة.
- لا تغيير لمفتاح Gemini.
- لا حذف للمفردات المكتملة في المسودة.
