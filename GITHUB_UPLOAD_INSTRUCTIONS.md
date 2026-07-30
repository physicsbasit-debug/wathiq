# رفع Phase 1-C1 Fix 2 إلى GitHub

## اسم الفرع

```text
phase-1c1-fix2-server-owned-visuals
```

## رسالة الحفظ

```text
fix: make visual generation server-owned and token-efficient
```

## الرفع والدمج

1. أنشئ الفرع بالاسم أعلاه من آخر `main`.
2. ارفع محتويات حزمة **الملفات المعدلة فقط** إلى جذر المستودع مع الاستبدال.
3. انتظر GitHub Actions حتى تصبح خضراء.
4. ادمج الفرع في `main`.
5. انتظر اكتمال GitHub Pages.

## إعادة نشر Supabase

هذه المرحلة تعدّل وظيفة التوليد، لذلك بعد الدمج:

1. افتح في GitHub:
   `supabase/functions/generate-source-questions/index.ts`
2. اضغط **Raw** وانسخ الملف كاملًا.
3. افتح Supabase ثم الوظيفة `generate-source-questions` عبر المحرر.
4. استبدل الكود القديم كاملًا واضغط **Deploy function**.

## الاختبار بعد النشر

1. نفّذ `Ctrl + F5`.
2. افتح **المسودة الحالية نفسها**.
3. اضغط **التالي** مرة واحدة.
4. المفردتان المكتملتان تبقيان محفوظتين، ويُستكمل الباقي فقط.

لا SQL جديد، ولا أسرار جديدة، ولا إعادة فهرسة، ولا تغيير لمفتاح Gemini.
