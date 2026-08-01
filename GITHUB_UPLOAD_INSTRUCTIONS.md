# تعليمات رفع Phase 2-A Fix 1

تُرفع الحزمة فوق نسخة واثق **Phase 2-A** بالإصدار `0.0.50`.

## اسم الفرع

```text
phase-2a-fix1-per-item-evidence-scope
```

## رسالة الحفظ

```text
fix: scope whole exam evidence to each plan item
```

## الخطوات

1. أنشئ الفرع من `main` الحالية بالإصدار `0.0.50`.
2. فك حزمة `changed_files_only`.
3. ارفع محتوياتها إلى جذر المستودع مع الاستبدال.
4. انتظر GitHub Actions، والنتيجة المطلوبة:

```text
347 passed
0 failed
```

5. ادمج الفرع بعد اللون الأخضر.
6. أعد نشر:

```text
supabase/functions/generate-source-questions/index.ts
```

7. نفذ `Ctrl + F5`.

## اختبار القبول

أنشئ اختبارًا قصيرًا جديدًا من أكثر من درس، واترك وضع **تصميم الاختبار كاملًا**. يجب ألا تظهر رسالة اختيار دليل من مرجع مفردة أخرى.

لا SQL، ولا سر جديد، ولا إعادة فهرسة، ولا رفع دليل المعلم.
