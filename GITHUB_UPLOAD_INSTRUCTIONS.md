# تعليمات رفع Phase 2-B Fix 1

## الأساس المطلوب

يجب أن تكون `main` متضمنة **Phase 2-B (`0.0.51`)** قبل الرفع.

## الفرع

```text
phase-2b-fix1-atomic-draft-resume
```

## رسالة الحفظ

```text
fix: make draft resume atomic and non-destructive
```

## خطوات الرفع

1. فك حزمة `changed_files_only`.
2. ارفع محتوياتها إلى جذر المستودع مع الاستبدال.
3. لا ترفع ملف ZIP نفسه.
4. انتظر GitHub Actions.

النتيجة المطلوبة:

```text
392 passed
0 failed
```

## بعد الدمج

أعد نشر الملف التالي فقط من محرر Supabase:

```text
supabase/functions/generate-source-questions/index.ts
```

ثم نفذ `Ctrl + F5`.

لا يلزم SQL أو سر جديد أو إعادة فهرسة أو رفع دليل المعلم.
