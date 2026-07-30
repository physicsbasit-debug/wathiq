# Phase 1-B — النشر والتشغيل بعد اعتماد Gemini

هذه الوثيقة مصححة. لا يستخدم واثق OpenAI.

## الأسرار المطلوبة في Supabase

- `GEMINI_API_KEY`
- `WATHIQ_APP_URL`
- `GEMINI_MODEL` اختياري، والقيمة الافتراضية `gemini-2.5-flash`.

لا تضع المفتاح في GitHub أو `runtime-config.js`.

## نشر الوظيفة بالطريقة المعتمدة للمشروع

1. افتح ملف GitHub:
   `supabase/functions/generate-source-questions/index.ts`
2. اضغط **Raw** وانسخ الكود كاملًا.
3. افتح Supabase ثم الوظيفة `generate-source-questions`.
4. الصق الكود في المحرر واضغط **Deploy function**.

لا يلزم Codespaces ولا طرفية ولا SQL لهذه الخطوة.
