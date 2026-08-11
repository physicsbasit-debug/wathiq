# نشر واثق 0.3.0

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

## Edge Functions الحالية فقط

```text
science-visual-generation
question-visual-jobs
assessment-generation-jobs
assessment-generation-worker
```

بعد تحديث 0.3.0 أعد نشر الوظائف الأربع السابقة من ملفات المستودع الحالية.

لا توجد وظيفة OCR أو Google OAuth أو مولد أسئلة قديم في النواة الحالية. إذا بقيت وظائف تاريخية منشورة في مشروع Supabase، يمكن حذفها بعد نجاح اختبار القبول الحي لأنها غير مستخدمة من واثق 0.3.0.

## قاعدة البيانات

لا يوجد SQL جديد مطلوب للبيئة الحالية عند التحديث إلى 0.3.0.

للبيئة الجديدة من الصفر يوجد مخطط حالي واحد فقط:

```text
supabase/schema-current.sql
```

## الفحص قبل النشر

```bash
npm run check
```

`dist/` ناتج بناء ولا يحفظ في `main`.
