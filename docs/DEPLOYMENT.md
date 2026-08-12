# نشر واثق 0.3.9

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

اختياريًا لتبديل النماذج تقنيًا:

```text
GEMINI_AUTHOR_MODEL
GEMINI_REVIEW_MODEL
GEMINI_IMAGE_MODEL
```

## Edge Functions الحالية

```text
science-visual-generation
question-visual-jobs
assessment-generation-jobs
assessment-generation-worker
```

في تحديث **0.3.9** يلزم إعادة نشر `assessment-generation-worker` فقط بعد تطبيق SQL الخاص بالضغط. لا يلزم إعادة نشر بقية الوظائف إذا كانت البيئة على 0.3.8 بالفعل.

## قاعدة البيانات — تحديث 0.3.9

طبّق أولًا في SQL Editor:

```text
supabase/migrations/20260812_assessment_generation_pressure_control.sql
```

هذا التحديث:

- يوسع محاولات أخطاء النقل المتدرجة إلى محاولتين تاليتين بدل محاولة واحدة.
- يغير فئة الضغط الداخلية إلى `transport_backoff`.
- يجعل إعادة المفردة يدويًا أو استكمال دورة فاشلة تبدأ ميزانية محاولات جديدة بدل بقاء المهمة عند 3/3 بلا إمكانية حقيقية للاستئناف.

بعد نجاح SQL أعد نشر:

```text
supabase/functions/assessment-generation-worker/index.ts
```

ثم انتظر نجاح GitHub Pages واعمل تحديثًا قويًا للصفحة.

للبيئة الجديدة من الصفر استخدم:

```text
supabase/schema-current.sql
```

## الفحص قبل النشر

```bash
npm run check
```

`dist/` ناتج بناء ولا يحفظ في `main`.
