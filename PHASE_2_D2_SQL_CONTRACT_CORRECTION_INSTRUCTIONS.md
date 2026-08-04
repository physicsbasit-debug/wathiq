# خطوات تصحيح عقد SQL واستكمال اختبار القبول

1. في Supabase افتح **SQL Editor**.
2. افتح من المستودع الملف:

```text
supabase/phase_2_d2_sql_contract_correction.sql
```

3. الصق محتواه كاملًا وشغّله مرة واحدة.
4. بعد نجاحه، شغّل من جديد:

```text
supabase/phase_2_d2_post_deploy_acceptance.sql
```

5. عند ظهور تحذير الجدول المؤقت اختر **Run without RLS**.
6. النتيجة المطلوبة هي رسالة PASS الخاصة بـ Phase 2-D2.

لا تعِد تشغيل ملف إنشاء الجداول، ولا تنشر Edge Function مرة أخرى بسبب هذا التصحيح.
