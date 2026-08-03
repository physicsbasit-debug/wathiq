# تعليمات رفع Phase 2-C4 Fix 6

## استخدم هذه الحزمة

```text
wathiq_phase_2_c4_fix6_context_aware_moment_changed_files_only.zip
```

لا تستخدم النسخة الكاملة للرفع إلا عند الاستعادة الطارئة.

## الفرع المقترح

```text
phase-2c4-fix6-context-aware-moment
```

## رسالة الحفظ

```text
fix: make moment context visuals scientifically complete
```

## خطوات GitHub

1. أنشئ فرعًا من أحدث `main`.
2. فك ضغط الحزمة.
3. افتح المجلد الداخلي:

```text
wathiq-main
```

4. ارفع **محتويات هذا المجلد** إلى جذر المستودع مع الاستبدال.
5. لا ترفع مجلد `wathiq-main` نفسه كمجلد إضافي داخل المستودع.
6. انتظر GitHub Actions. النتيجة المطلوبة:

```text
442 passed
0 failed
```

7. ادمج Pull Request.
8. انتظر اكتمال نشر GitHub Pages.
9. في Supabase، أعد نشر وظيفة `generate-source-questions` من الملف:

```text
supabase/functions/generate-source-questions/index.ts
```

## لا تنفذ

- لا SQL.
- لا سر جديد.
- لا إعادة فهرسة.
- لا تنشئ Edge Function جديدة.
- لا تعِد نشر `question-visual-jobs`.

## بعد النشر

نفذ `Ctrl + F5`، ثم افتح المسودة نفسها واضغط **التالي**.
