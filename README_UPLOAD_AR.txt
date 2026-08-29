حزمة إصلاح واثق — Durable Visual Review Workflow
الأساس: GitHub main عند commit 99ac203d778968c98975ec0416038a00e5c943a3

الهدف:
فصل توليد الصورة عن مراجعتها إلى مراحل دائمة مستقلة، بحيث فشل/مهلة المراجعة لا يعيد توليد الصورة نفسها، مع الحفاظ على المراجعة العلمية الصارمة وعدم اعتماد أي أصل قبل نجاحها.

ارفع/استبدل هذه الملفات فقط في GitHub:
1) supabase/functions/question-visual-jobs/index.ts
2) supabase/functions/science-visual-generation/index.ts
3) tests/visual-edge-contract.test.mjs
4) tests/visual-jobs.test.mjs
5) supabase/migrations/20260829_durable_visual_review_workflow.sql  (ملف جديد)

بعد الرفع:
1) في Supabase > SQL Editor شغّل مرة واحدة:
   supabase/migrations/20260829_durable_visual_review_workflow.sql
2) أعد نشر Edge Function:
   question-visual-jobs
3) أعد نشر Edge Function:
   science-visual-generation
4) لا Secret جديد.
5) لا إعادة فهرسة.
6) لا تعديل للواجهة أو src/visual-jobs.ts.

مهم:
- لا ترفع التعديلات المحلية غير المكتملة التي أنشأها Claude على فرع fix-visual-review-durable-workflow.
- هذه الحزمة مبنية مباشرة فوق main 99ac203 وتستبدل مسار Claude المحلي المتعثر.
- أول توليد حي لاختبار كامل بعد النشر هو اختبار القبول النهائي لاتصال Supabase/Gemini الحقيقي.

السلوك الجديد:
- generate_original -> review_original -> ready
- عند رفض علمي صحيح: generate_corrected -> review_corrected -> ready/failed
- لكل مرحلة محاولتان مستقلتان.
- timeout/429/5xx/JSON malformed/no output في review تعيد review لنفس الصورة، لا generate.
- provisional لا يدخل asset النهائي قبل approval.
- heartbeat + worker fencing + stale recovery محفوظة.
- cleanup يتم بعد تحديث DB محمي بالسياج.
