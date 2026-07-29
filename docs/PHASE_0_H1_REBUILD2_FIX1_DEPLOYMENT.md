# نشر Phase 0-H1 Rebuild 2 Fix 1

## GitHub

1. أنشئ فرعًا باسم:
   `fix/phase-0-h1-wallclock-timeout`
2. ارفع محتويات حزمة Changed Files Only مع المحافظة على المجلدات.
3. استخدم رسالة commit:
   `fix: منع تعليق OCR عند تجاوز مهلة التنفيذ`
4. افتح Pull Request وانتظر نجاح Actions.
5. ادمج الفرع بعد ظهور اللون الأخضر.

## Supabase

بعد الدمج:

1. افتح `Edge Functions`.
2. افتح الدالة `google-drive-oauth`.
3. استبدل محتواها بملف Edge Function المرفق.
4. اضغط `Deploy function`.
5. اترك `Verify JWT with legacy secret` مغلقًا كما هو.

## لا يلزم

- لا يوجد SQL جديد.
- لا تعديل على `pages.yml`.
- لا حذف لبيانات OCR القديمة.
