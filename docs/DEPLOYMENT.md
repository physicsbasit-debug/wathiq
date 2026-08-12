# نشر واثق 0.3.13

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
GEMINI_VISUAL_PLANNER_MODEL
GEMINI_IMAGE_MODEL
```

## ترتيب تحديث 0.3.13

إذا كانت البيئة الحالية على 0.3.12:

1. ارفع حزمة ملفات 0.3.13 إلى GitHub وانتظر نجاح Actions وPages.
2. **لا تشغّل SQL جديدًا**؛ Runtime Contract من v0.3.12 يبقى صالحًا كما هو.
3. أعد نشر وظيفة واحدة فقط:

```text
supabase/functions/assessment-generation-worker/index.ts
```

4. لا يلزم إعادة نشر `assessment-generation-jobs` أو وظائف الصور.
5. اعمل تحديثًا قويًا للصفحة. health/preflight يجب أن يؤكدا `thinItemContractVersion=1` و`visualPlannerVersion=1` و`visualContractVersion=3`.
6. للمسودة التي فشلت سابقًا بـ `MODEL_REQUEST_INVALID`، أعد المفردة أو استكمل الدورة بعد نشر Worker الجديد؛ لا حاجة إلى ترحيل بيانات.

## Runtime Contract الحالي من v0.3.12 (لا Migration جديدة في v0.3.13)

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

