# تعليمات رفع Phase 1-C3

## اسم الفرع

```text
phase-1c3-advanced-visual-assessment
```

## رسالة الحفظ

```text
feat: add advanced deterministic assessment visuals
```

## الرفع والدمج

1. أنشئ الفرع بالاسم أعلاه.
2. فك حزمة `changed_files_only`.
3. ارفع محتوياتها إلى جذر مستودع واثق مع الاستبدال.
4. انتظر GitHub Actions حتى تصبح خضراء.
5. ادمج الفرع في `main`.
6. انتظر اكتمال GitHub Pages.

## نشر وظيفة Supabase

هذه المرحلة تعدل وظيفة توليد الأسئلة:

```text
supabase/functions/generate-source-questions/index.ts
```

بعد الدمج:

1. افتح الملف في GitHub واضغط **Raw**.
2. انسخ الملف كاملًا.
3. افتح وظيفة `generate-source-questions` في محرر Supabase.
4. استبدل الكود كاملًا.
5. اضغط **Deploy function**.

## الاختبار الفعلي

1. نفذ `Ctrl + F5`.
2. أنشئ اختبارًا جديدًا، لأن إصدار عقد التوليد ارتفع إلى `source-grounded-policy-ai-12-advanced-visuals`.
3. جرّب دروسًا مناسبة، مثل:
   - قراءة تدريج جهاز.
   - الانعكاس أو الانكسار.
   - القوى والعزوم.
   - بيانات تجربة في جدول.
   - علاقة بيانية فيها مقارنة.
4. تحقق من ظهور المرئي في المعاينة وورقة الطالب ونموذج الإجابة.
5. اختبر Word وPDF.

## لا يلزم

- لا SQL.
- لا أسرار جديدة.
- لا إعادة فهرسة.
- لا تغيير لمفتاح Gemini.
