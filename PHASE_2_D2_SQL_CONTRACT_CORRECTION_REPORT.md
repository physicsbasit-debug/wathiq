# واثق | Phase 2-D2 | تصحيح عقد SQL

## السبب الجذري

الدالة `public.enqueue_assessment_generation_run` تُرجع جدولًا يحتوي عمودًا اسمه `run_id`.
داخل جسم PL/pgSQL استُخدم الشرط التالي دون تأهيل:

```sql
where run_id = v_run_id
```

لذلك اعتبر PostgreSQL الاسم `run_id` محتملًا أن يكون عمود الإرجاع أو عمود الجدول، وأوقف التنفيذ بالخطأ `42702`.

## المعالجة

تم تأهيل العمودين باسم alias صريح:

```sql
select count(distinct item.plan_item_id) into v_seen_count
from public.assessment_generation_items as item
where item.run_id = v_run_id;
```

أُضيف ملف مستقل آمن للتنفيذ على قاعدة البيانات المنشورة:

```text
supabase/phase_2_d2_sql_contract_correction.sql
```

الملف يستخدم `CREATE OR REPLACE FUNCTION` فقط، ولا يحذف جداول أو بيانات.

## التحقق

- `npm run check`: نجح.
- النتيجة: `477 passed, 0 failed`.
- أضيف اختبار يمنع عودة المرجع غير المؤهل داخل ملف المرحلة أو ملف التصحيح.
- روجعت جميع دوال `RETURNS TABLE` في ملف D2؛ هذه هي حالة التضارب الوحيدة الموجودة.
