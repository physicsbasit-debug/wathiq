# تعليمات رفع ونشر Phase 2-D3

## 1. رفع GitHub

أنشئ فرعًا باسم:

```text
feat/phase-2d3-item-generation-worker
```

فك حزمة الملفات المعدلة فقط، ثم ارفع محتويات مجلد `wathiq-main` إلى جذر المستودع مع الاستبدال.

انتظر GitHub Actions. النتيجة المطلوبة:

```text
484 passed
0 failed
```

بعد نجاحها ادمج الفرع.

## 2. نشر Edge Function الجديدة

في Supabase افتح Edge Functions وأنشئ وظيفة باسم:

```text
assessment-generation-worker
```

انسخ إليها محتوى:

```text
supabase/functions/assessment-generation-worker/index.ts
```

ثم انشرها.

إعداد الوظيفة موجود في:

```text
supabase/config.toml
```

ويجب أن يكون:

```toml
[functions.assessment-generation-worker]
verify_jwt = false
```

الوظيفة تتحقق من المستخدم داخليًا.

## 3. الأسرار

لا تضف سرًا جديدًا. تستخدم الوظيفة الإعدادات الموجودة:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
WATHIQ_APP_URL
GEMINI_API_KEY
```

وتستخدم `GEMINI_MODEL` إن كان موجودًا، وإلا تستخدم النموذج الافتراضي المحدد داخل الوظيفة.

## 4. ما لا تنفذه

- لا تنفذ SQL جديدًا.
- لا تعِد تشغيل SQL الخاص بـD2.
- لا تعِد نشر `assessment-generation-jobs`.
- لا تعِد نشر `generate-source-questions`.
- لا تعِد نشر `question-visual-jobs`.
- لا تعِد فهرسة الكتب.
- لا ترفع المراجع من جديد.
- لا تختبر سرعة الواجهة بعد؛ D3 غير مربوطة بها عمدًا.

## 5. حالة المرحلة بعد النشر

بعد نشر الوظيفة يصبح العامل متاحًا، لكن التطبيق لن يستدعيه بعد. التحويل الإنتاجي والاستكمال والتقدم الحقيقي ستكون في Phase 2-D4.

لا تحذف المحرك السابق في هذه المرحلة؛ يخرج من مسار الإنتاج عند اكتمال الربط واختبار القبول الحي في مرحلة التحويل المحددة.
