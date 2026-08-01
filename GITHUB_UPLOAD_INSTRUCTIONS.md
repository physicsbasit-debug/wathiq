# تعليمات رفع Phase 2-B

## الأساس المطلوب

يجب أن تكون `main` متضمنة Phase 2-A Fix 5 قبل الرفع.

## الفرع

```text
phase-2b-reliable-resume-exam-integrity
```

## رسالة الحفظ

```text
feat: add reliable draft resume and exam integrity gates
```

## خطوات الرفع

1. فك حزمة `changed_files_only`.
2. ارفع محتوياتها إلى جذر المستودع مع الاستبدال.
3. لا ترفع ملف ZIP نفسه.
4. انتظر GitHub Actions.

النتيجة المطلوبة:

```text
386 passed
0 failed
```

## بعد الدمج

أعد نشر الملف التالي فقط من محرر Supabase:

```text
supabase/functions/generate-source-questions/index.ts
```

ثم نفذ `Ctrl + F5`.

لا يلزم SQL أو سر جديد أو إعادة فهرسة أو رفع دليل المعلم.
