# Phase 0-G Fix 3

## الهدف

إضافة الفصل الدراسي للمصادر وإصلاح فشل حفظ السجل بعد اكتمال رفع PDF كبير.

## التنفيذ

1. تشغيل `supabase/phase_0_g_fix3_semester_upload_finalization.sql`.
2. استبدال Edge Function `google-drive-oauth` بالكامل.
3. إبقاء Verify JWT with legacy secret مغلقًا.
4. رفع ملفات الواجهة إلى GitHub.

## اختبار القبول

- يظهر حقل الفصل الدراسي في نموذج إضافة المصدر.
- يتضمن مسار Drive مجلد الفصل.
- اختيار الملف نفسه يستكمل الجلسة القديمة بدل إعادة رفع 89%.
- ينتهي الحفظ بحالة مرفوع وextractionStatus = لم يبدأ.
