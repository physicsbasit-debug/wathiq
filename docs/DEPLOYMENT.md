# نشر واثق 0.3.12

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

## ترتيب تحديث 0.3.12

إذا كانت البيئة الحالية على 0.3.11:

1. ارفع حزمة ملفات 0.3.12 إلى GitHub وانتظر نجاح Actions وPages.
2. في Supabase SQL Editor شغّل:

```text
supabase/migrations/20260812_assessment_generation_runtime_contract_repair.sql
```

3. يجب أن يعرض SQL في النهاية `runtime_contract` وفيه:

```text
version = 1
transportDefer = true
contentFail = true
staleRecovery = true
```

4. أعد نشر وظيفتين فقط:

```text
supabase/functions/assessment-generation-worker/index.ts
supabase/functions/assessment-generation-jobs/index.ts
```

5. لا يلزم إعادة نشر وظائف الصور.
6. اعمل تحديثًا قويًا للصفحة وافتح المسودة نفسها ثم استكمل المفردات المتبقية.

إذا كانت البيئة أقدم من 0.3.11، طبّق migrations بالترتيب الزمني أو استخدم `supabase/schema-current.sql` لبيئة جديدة من الصفر.

## ما يضيفه SQL الحالي

- RPC مستقلة لتأجيل أخطاء النقل، لا يمكنها إنتاج حالة `failed`.
- RPC مستقلة لفشل المحتوى والمراجعة.
- استرداد Canonical للمهام ذات lease المنتهي.
- Runtime contract قابل للفحص من Worker قبل بدء التوليد.
- إصلاح تلقائي للمفردات الحالية التي تحمل خطأ Gemini مؤقتًا لكنها سُجلت `failed` بالإصدارات السابقة.

## الفحص قبل النشر

```bash
npm run check
```

`dist/` ناتج بناء ولا يحفظ في `main`.

