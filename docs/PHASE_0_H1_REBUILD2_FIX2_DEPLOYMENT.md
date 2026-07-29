# نشر Phase 0-H1 Rebuild 2 Fix 2

1. أنشئ فرع `fix/phase-0-h1-cache-handshake`.
2. ارفع محتويات Changed Files Only مع المسارات.
3. استخدم الرسالة: `fix: فصل فحص كاش OCR عن رفع صورة الفهرس`.
4. انتظر GitHub Actions الأخضر ثم ادمج.
5. بعد الدمج استبدل كود Edge Function `google-drive-oauth` بملف `supabase/functions/google-drive-oauth/index.ts` وانشره.
6. تأكد أن Verify JWT ما زال OFF.
7. حدّث واثق بـ Ctrl+F5، ثم اختبر الصفحة 12 مرة واحدة.

لا يوجد SQL جديد، و`pages.yml` لم يتغير.
