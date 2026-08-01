# تعليمات رفع Phase 2-A Fix 4 — الربط الدلالي للسؤال والمرئيات

تُرفع الحزمة فوق نسخة واثق **Phase 2-A Fix 3** بالإصدار التشغيلي `0.0.50`.

## اسم الفرع

```text
phase-2a-fix4-question-visual-semantic-binding
```

## رسالة الحفظ

```text
fix: bind generated questions to their visuals and data
```

## الخطوات

1. أنشئ الفرع من `main` بعد التأكد أن Phase 2-A Fix 3 مدمج.
2. فك حزمة `changed_files_only`.
3. ارفع محتوياتها إلى جذر المستودع مع الاستبدال.
4. لا ترفع ملف ZIP نفسه.
5. انتظر GitHub Actions. النتيجة المطلوبة:

```text
371 passed
0 failed
```

6. بعد اللون الأخضر ادمج الفرع.
7. أعد نشر:

```text
supabase/functions/generate-source-questions/index.ts
```

8. نفذ `Ctrl + F5` بعد نشر GitHub Pages.
9. أنشئ اختبارًا قصيرًا جديدًا بمحرك **تصميم الاختبار كاملًا** لاختبار الربط الجديد من البداية.

## لا يلزم

- لا SQL.
- لا سر جديد.
- لا إعادة فهرسة.
- لا رفع دليل المعلم.
- لا تعديل إعدادات Gemini.
