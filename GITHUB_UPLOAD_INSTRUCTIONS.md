# تعليمات رفع Phase 1-B8

## اسم الفرع

```text
phase-1b8-cambridge-style-alignment
```

## رسالة الحفظ

```text
feat: align science questions with Cambridge-style assessment
```

## الرفع

1. أنشئ الفرع بالاسم أعلاه من `main`.
2. فك حزمة `changed_files_only`.
3. ارفع محتوياتها إلى جذر المستودع مع الاستبدال.
4. انتظر GitHub Actions حتى تصبح خضراء.
5. ادمج الفرع في `main`.

## نشر وظيفة Supabase

بعد الدمج:

1. افتح في GitHub على فرع `main`:
   `supabase/functions/generate-source-questions/index.ts`
2. اضغط **Raw** وانسخ الملف كاملًا.
3. افتح وظيفة `generate-source-questions` في محرر Supabase.
4. استبدل الكود كاملًا ثم اضغط **Deploy function**.
5. لا تغيّر الأسرار، ولا تضف SQL، ولا تعِد فهرسة الكتاب.
6. انتظر اكتمال GitHub Pages ثم نفّذ `Ctrl + F5`.

## الاختبار الفعلي

- أنشئ اختبارًا قصيرًا للصف العاشر من 2-5 دروس.
- تحقق من تنوع البدائل بين مفهومي وسياقي وحسابي وبيانات واستقصائي ومقارنة.
- تأكد أن ورقة الطالب لا تعرض اسم الكتاب أو رقم الصفحة.
- افتح نموذج الإجابة وتأكد من وجود نقاط التصحيح والمصدر والدليل.
