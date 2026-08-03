# تعليمات رفع Phase 2-C4 Fix 7

## الحزمة المستخدمة

استخدم حزمة `changed_files_only` وارفع **محتويات مجلد `wathiq-main`** إلى جذر المستودع مع الاستبدال.

## فرع مقترح

```text
phase-2c4-fix7-essential-scientific-visual
```

## رسالة الحفظ المقترحة

```text
fix: protect scientifically essential moment visuals
```

## بعد الرفع

1. انتظر نجاح GitHub Actions. النتيجة المطلوبة: `449 passed, 0 failed`.
2. ادمج الفرع في `main`.
3. انشر GitHub Pages.
4. أعد نشر وظيفة Supabase التالية فقط:

```text
supabase/functions/generate-source-questions/index.ts
```

5. نفّذ `Ctrl + F5`.
6. افتح المسودة نفسها واضغط **التالي**.

## لا يلزم

- لا SQL.
- لا سر جديد.
- لا إعادة فهرسة.
- لا إعادة رفع المراجع.
- لا إعادة نشر `question-visual-jobs`.
