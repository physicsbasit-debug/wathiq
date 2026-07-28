# نشر Phase 0-G Fix 2B

## الترتيب

1. ارفع حزمة GitHub وافتح Pull Request وانتظر الفحص الأخضر.
2. شغّل `supabase/phase_0_g_fix2b_arabic_ocr.sql` في SQL Editor.
3. فعّل Cloud Vision API داخل مشروع Google Cloud الحالي.
4. أنشئ API key مقيّدًا بخدمة Cloud Vision API.
5. أضف المفتاح في Supabase Edge Function Secrets باسم:
   `GOOGLE_CLOUD_VISION_API_KEY`
6. استبدل كود `google-drive-oauth` بالكامل بالكود الجديد وانشر الدالة.
7. تأكد أن `Verify JWT with legacy secret` ما زال OFF.
8. ادمج Pull Request وانتظر نشر GitHub Pages.
9. افتح المصدر الذي حالته `يحتاج OCR` واضغط «تشغيل OCR العربي».

## لا توجد تغييرات

- لا تغيير على `.github/workflows/pages.yml`.
- لا متغيرات GitHub جديدة.
- لا تعديل على OAuth الخاص بـGoogle Drive.
