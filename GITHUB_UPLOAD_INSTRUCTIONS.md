# تعليمات رفع Phase 1-C1 Fix 1

## اسم الفرع

```text
phase-1c1-fix1-mark-scheme-contract
```

## رسالة الحفظ

```text
fix: stabilize per-mark scoring criteria
```

## الخطوات

1. أنشئ الفرع بالاسم أعلاه من آخر `main`.
2. ارفع محتويات حزمة `changed_files_only` إلى جذر المستودع مع الاستبدال.
3. انتظر GitHub Actions حتى تصبح خضراء.
4. ادمج الفرع في `main`.
5. افتح الملف التالي من GitHub عبر **Raw**:

```text
supabase/functions/generate-source-questions/index.ts
```

6. استبدل كود وظيفة Supabase الحالية `generate-source-questions` كاملًا.
7. اضغط **Deploy function**.
8. لا حاجة إلى SQL أو أسرار جديدة أو إعادة فهرسة.
9. افتح المسودة نفسها واضغط **التالي** لاستكمال المفردات المتبقية.
