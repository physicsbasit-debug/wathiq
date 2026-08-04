# تعليمات رفع ونشر Phase 2-D2

## 1. رفع GitHub

أنشئ فرعًا باسم:

```text
feat/phase-2d2-durable-generation-pipeline
```

فك حزمة الملفات المعدلة فقط، ثم ارفع محتويات مجلد `wathiq-main` إلى جذر المستودع مع الاستبدال.

انتظر GitHub Actions. النتيجة المطلوبة:

```text
475 passed
0 failed
```

بعد نجاحها ادمج الفرع.

## 2. تنفيذ SQL

من Supabase Dashboard افتح SQL Editor، ثم نفذ الملف كاملًا:

```text
supabase/phase_2_d2_assessment_generation_jobs.sql
```

ينفذ مرة واحدة فقط بعد الدمج.

## 3. نشر Edge Function

أنشئ أو حدّث وظيفة باسم:

```text
assessment-generation-jobs
```

وانسخ إليها محتوى:

```text
supabase/functions/assessment-generation-jobs/index.ts
```

ثم انشرها.

لا تضف أسرارًا جديدة. تستخدم الوظيفة الإعدادات الموجودة:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
WATHIQ_APP_URL
```

## 4. اختبار القبول بعد النشر

ارجع إلى SQL Editor ونفذ:

```text
supabase/phase_2_d2_post_deploy_acceptance.sql
```

النتيجة المطلوبة:

```text
PASS: Phase 2-D2 durable generation schema, security, idempotency, leases, recovery, stale-write rejection, retry limits, and aggregation.
```

الاختبار ينفذ `ROLLBACK` ولا يترك بيانات اختبارية. يحتاج وجود مستخدم واحد على الأقل في `auth.users`.

## 5. ما لا تنفذه

- لا تعِد نشر `generate-source-questions`.
- لا تعِد نشر `question-visual-jobs`.
- لا تعِد فهرسة الكتب.
- لا ترفع المراجع من جديد.
- لا تغيّر أسرار Gemini.

هذه المرحلة لا تغيّر الواجهة ولا تعالج زمن التوليد للمستخدم بعد؛ إنها البنية الدائمة التي سيعمل فوقها عامل Phase 2-D3.

## تصحيح عقد SQL المكتشف باختبار القبول

إذا ظهر الخطأ `column reference "run_id" is ambiguous` بعد نشر المرحلة الأساسية، نفّذ مرة واحدة:

```text
supabase/phase_2_d2_sql_contract_correction.sql
```

ثم أعد تشغيل:

```text
supabase/phase_2_d2_post_deploy_acceptance.sql
```

لا يُعاد إنشاء الجداول ولا تُحذف البيانات؛ الملف يستبدل دالة الإدخال نفسها باستعلام مؤهل بأسماء الجداول.
