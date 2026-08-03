# Phase 2-C4 Fix 4 — Upload Instructions

## اسم المرحلة
`phase-2-c4-fix4-moment-evidence-context`

## الملفات المعدلة
- `supabase/functions/generate-source-questions/index.ts`
- `tests/gemini-generate-content-edge.test.mjs`
- `tests/phase-2-c4-fix3-server-owned-question-pattern.test.mjs`
- `PHASE_2_C4_FIX4_MOMENT_EVIDENCE_CONTEXT_REPORT.md`
- `PHASE_2_C4_FIX4_UPLOAD_INSTRUCTIONS.md`
- `CHANGED_FILES_MANIFEST_PHASE_2_C4_FIX4.txt`

## رسالة الحفظ المقترحة
```text
fix: validate moment questions from server-owned visual evidence
```

## خطوات التطبيق
1. ارفع محتويات حزمة `changed_files_only` إلى GitHub مع الاستبدال.
2. اسحب التحديث في Codespaces أو البيئة المحلية.
3. شغّل:

```bash
npm run check
```

4. تأكد أن النتيجة النهائية:

```text
432 passed, 0 failed
```

5. بعد الدمج، أعد نشر Edge Function التالية فقط:

```text
supabase/functions/generate-source-questions/index.ts
```

## ملاحظات
- لا يلزم SQL جديد.
- لا يلزم سر جديد.
- لا حاجة لإعادة فهرسة.
- لا حاجة لإعادة نشر `question-visual-jobs`.
