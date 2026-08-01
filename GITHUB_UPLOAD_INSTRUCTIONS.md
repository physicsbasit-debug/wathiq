# تعليمات رفع Phase 2-A Fix 3 — تطبيع إحالة الرسوم

تُرفع الحزمة فوق نسخة واثق **Phase 2-A Fix 2** بالإصدار التشغيلي `0.0.50`.

## اسم الفرع

```text
phase-2a-fix3-visual-reference-normalization
```

## رسالة الحفظ

```text
fix: normalize visual question references
```

## الخطوات

1. أنشئ الفرع من `main` بعد التأكد أن الإصدار الحالي `0.0.50` وأن Fix 1 وFix 2 مدمجان.
2. فك حزمة `changed_files_only`.
3. ارفع محتوياتها إلى جذر المستودع مع الاستبدال.
4. لا ترفع ملف ZIP نفسه.
5. انتظر GitHub Actions، والنتيجة المطلوبة:

```text
361 passed
0 failed
```

6. بعد اللون الأخضر ادمج الفرع.
7. أعد نشر وظيفة Supabase:

```text
supabase/functions/generate-source-questions/index.ts
```


8. نفذ `Ctrl + F5` بعد اكتمال نشر GitHub Pages.
9. افتح المسودة نفسها واضغط **التالي**؛ لا حاجة إلى إنشاء اختبار جديد.

## لا يلزم

- لا SQL.
- لا سر جديد.
- لا إعادة فهرسة.
- لا رفع دليل المعلم.
- لا تغيير في نموذج Gemini أو الصور.
