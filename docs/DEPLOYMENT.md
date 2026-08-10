# نشر واثق

## GitHub

يعمل المشروع على Node.js 22 في GitHub Actions.

بعد كل تعديل:

```bash
npm run repo:check
npm run check
```

يجب أن تبقى النتيجة الحالية أو أعلى منها مع **0 فشل**. GitHub Pages يبني `dist/` من المصدر؛ لا ترفع `dist/` إلى المستودع.

## متغيرات GitHub Pages

يستخدم البناء:

- `WATHIQ_SUPABASE_URL`
- `WATHIQ_SUPABASE_PUBLISHABLE_KEY`
- `WATHIQ_GOOGLE_OAUTH_CLIENT_ID`

## Supabase — Edge Functions الحالية

```text
google-drive-oauth
generate-source-questions
question-visual-jobs
assessment-generation-jobs
assessment-generation-worker
```

جميعها معرفة في `supabase/config.toml` مع `verify_jwt = false` لأن التحقق المطلوب يتم داخل الوظائف نفسها حسب عقد كل وظيفة.

### أسرار الخادم المستخدمة حسب الوظيفة

من بينها:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
WATHIQ_APP_URL
GEMINI_API_KEY
```

وقد يستخدم `GEMINI_MODEL` عند توفره.

يمكن نشر الوظائف من **محرر Supabase** عند الحاجة، مع إبقاء الأسرار في إعدادات المشروع وعدم تضمينها في الكود.

## قاعدة البيانات

ملفات SQL التاريخية داخل `supabase/` تبقى لأنها تمثل خطوات إنشاء/ترقية المخطط التشغيلي وليست تقارير مرحلة.

أهم مكونات الحالة الحالية:

- `phase_2_c3_visual_asset_jobs.sql`
- `phase_2_d2_assessment_generation_jobs.sql`
- `phase_2_d2_sql_contract_correction.sql`
- `phase_2_d2_post_deploy_acceptance.sql`

لا تعِد تنفيذ ملفات التهيئة أو الترقية على قاعدة منتجة لمجرد وجودها في المستودع. استخدمها فقط عند إعداد بيئة جديدة أو وفق تعليمات ترقية محددة.

## اختبار D2 بعد نشر بيئة جديدة

بعد إنشاء مخطط D2 وتصحيحه، يمكن تشغيل:

```text
supabase/phase_2_d2_post_deploy_acceptance.sql
```

وهو ينهي بيانات الاختبار بـ`ROLLBACK`.

## ملاحظة D4

D4 لا يحتاج SQL جديدًا أو Secret جديدًا. يجب أن تكون الوظيفتان التاليتان منشورتين:

```text
assessment-generation-jobs
assessment-generation-worker
```

ثم ينفذ اختبار القبول الحي الموضح في `OPERATIONS.md`.
