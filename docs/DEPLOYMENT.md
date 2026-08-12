# نشر واثق 0.3.11

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

## ترتيب تحديث 0.3.11

إذا كانت البيئة الحالية على 0.3.10:

1. ارفع حزمة ملفات 0.3.11 إلى GitHub وانتظر نجاح Actions وPages.
2. في Supabase SQL Editor شغّل:

```text
supabase/migrations/20260812_assessment_generation_provider_protocol_repair.sql
```

3. يجب أن يعرض فحص SQL في النهاية `canonical_fail_rpc_count = 1`.
4. أعد نشر:

```text
supabase/functions/assessment-generation-worker/index.ts
```

5. لا يلزم إعادة نشر `assessment-generation-jobs` أو وظائف الصور في هذه المرحلة.
6. اعمل تحديثًا قويًا للصفحة وافتح المسودة نفسها. سيعمل preflight قبل استكمال الدورة، وإذا كان الخلل من Gemini سيظهر نوعه الحقيقي بدل رسالة محتوى عامة.

إذا كانت البيئة أقدم من 0.3.10، طبّق migrations بالترتيب الزمني أو استخدم `supabase/schema-current.sql` لبيئة جديدة من الصفر.

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

