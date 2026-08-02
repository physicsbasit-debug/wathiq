# تعليمات رفع Phase 2-C1

## الأساس المطلوب

يجب أن تكون `main` متضمنة **Phase 2-B Fix 1 (`0.0.52`)** قبل الرفع.

## الفرع

```text
phase-2c1-visual-first-2d
```

## رسالة الحفظ

```text
feat: add visual-first scientific 2d rendering
```

## خطوات الرفع

1. فك حزمة `changed_files_only`.
2. ارفع محتوياتها إلى جذر المستودع مع الاستبدال.
3. لا ترفع ملف ZIP نفسه.
4. انتظر GitHub Actions.

النتيجة المطلوبة:

```text
398 passed
0 failed
```

## بعد الدمج

أعد نشر الملف التالي فقط من محرر Supabase:

```text
supabase/functions/generate-source-questions/index.ts
```

ثم نفذ `Ctrl + F5` وأنشئ اختبارًا جديدًا يحتوي مشهدًا سياقيًا مؤهلًا للصور.

لا يلزم SQL أو سر جديد أو إعادة فهرسة أو رفع دليل المعلم.
