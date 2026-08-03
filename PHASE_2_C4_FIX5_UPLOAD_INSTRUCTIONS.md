# تعليمات رفع Phase 2-C4 Fix 5

## الحزمة المستخدمة

```text
wathiq_phase_2_c4_fix5_server_owned_assessment_contract_changed_files_only.zip
```

## الفرع المقترح

```text
phase-2c4-fix5-server-owned-assessment-contract
```

## رسالة الحفظ

```text
fix: make assessment metadata and moment model server-owned
```

## الخطوات

1. أنشئ الفرع من `main` الحالية.
2. فك ضغط حزمة الملفات المعدلة فقط.
3. ارفع **محتويات مجلد `wathiq-main`** إلى جذر المستودع مع الاستبدال.
4. انتظر GitHub Actions.
5. النتيجة المطلوبة:

```text
439 passed
0 failed
```

6. ادمج Pull Request.
7. أعد نشر Edge Function الحالية:

```text
generate-source-questions
```

من الملف:

```text
supabase/functions/generate-source-questions/index.ts
```

## لا تفعل

- لا تنفذ SQL.
- لا تنشئ Edge Function جديدة.
- لا تعِد نشر `question-visual-jobs`.
- لا تعِد فهرسة الكتاب.

## بعد النشر

نفذ `Ctrl + F5` وافتح المسودة نفسها واضغط **التالي**.
