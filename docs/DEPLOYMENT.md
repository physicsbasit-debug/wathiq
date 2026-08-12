# نشر واثق 0.3.10

## متغيرات GitHub Pages

```text
WATHIQ_SUPABASE_URL
WATHIQ_SUPABASE_PUBLISHABLE_KEY
```

## أسرار Supabase

```text
WATHIQ_APP_URL
GEMINI_API_KEY
```

اختياريًا:

```text
GEMINI_AUTHOR_MODEL
GEMINI_REVIEW_MODEL
GEMINI_IMAGE_MODEL
```

## ترتيب تحديث 0.3.10

إذا كانت البيئة الحالية على 0.3.9:

1. ارفع حزمة ملفات 0.3.10 إلى GitHub وانتظر نجاح Actions وPages.
2. في Supabase SQL Editor شغّل:

```text
supabase/migrations/20260812_assessment_generation_quota_aware_retry.sql
```

3. أعد نشر:

```text
supabase/functions/assessment-generation-worker/index.ts
supabase/functions/assessment-generation-jobs/index.ts
```

4. لا يلزم إعادة نشر `question-visual-jobs` أو `science-visual-generation` إذا كانتا على النسخ المعتمدة من سلسلة 0.3.8/0.3.9.
5. اعمل تحديثًا قويًا للصفحة ثم افتح المسودة نفسها؛ مهام النقل المؤجلة لا ينبغي أن تتحول إلى 3/3 بسبب 429/503/timeout.

إذا كانت البيئة أقدم من 0.3.9، طبّق أولًا migration الضغط السابق ثم migration 0.3.10 بالترتيب الزمني، أو استخدم `supabase/schema-current.sql` لبيئة جديدة من الصفر.

## ما يضيفه SQL الحالي

- `retry_after_at`: الموعد الذي يسمح بعده بإعادة حجز المفردة.
- `author_checkpoint`: نقطة استئناف تحفظ خرج المؤلف قبل المراجع.
- أخطاء النقل تعيد `attempt_count` إلى ما كان عليه قبل الحجز ولا تستهلك محاولة محتوى.
- `transport_retry_count` يصبح عداد تأجيلات تشغيلية لا بوابة تسقط المفردة بعد تأجيلين.

## الفحص قبل النشر

```bash
npm run check
```

`dist/` ناتج بناء ولا يحفظ في `main`.
