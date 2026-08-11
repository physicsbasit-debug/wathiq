# نشر واثق 0.2.0

## GitHub Pages variables

```text
WATHIQ_SUPABASE_URL
WATHIQ_SUPABASE_PUBLISHABLE_KEY
```

## Supabase Secrets

```text
WATHIQ_APP_URL
GEMINI_API_KEY
```

اختياريًا:

```text
GEMINI_AUTHOR_MODEL
GEMINI_REVIEW_MODEL
GEMINI_OCR_MODEL
GEMINI_IMAGE_MODEL
```

## Edge Functions الحالية

```text
source-ocr
science-visual-generation
question-visual-jobs
assessment-generation-jobs
assessment-generation-worker
```

عند نشر 0.2.0 فوق بيئة واثق الحالية أعد نشر:

```text
assessment-generation-jobs
assessment-generation-worker
```

وبقية الوظائف لا تحتاج إعادة نشر إذا كانت نسخة 0.1.0 الحالية منشورة ولم تتغير.

## قاعدة البيانات

لا يوجد SQL جديد مطلوب للبيئة الحالية في هذا الإصدار. للبيئة الجديدة من الصفر يوجد ملف واحد فقط:

```text
supabase/schema-current.sql
```

## الفحص

```bash
npm run repo:check
npm run check
```

`dist/` ناتج بناء ولا يُحفظ في `main`.
