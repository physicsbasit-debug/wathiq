# رفع Phase 0-E عبر واجهة GitHub

## قبل الرفع

أنشئ فرعًا من `main` باسم:

`feat/phase-0-e-central-source-storage`

## الرفع

1. فك ضغط حزمة `Changed Files Only`.
2. افتح الفرع الجديد في GitHub.
3. اختر **Add file → Upload files**.
4. ارفع محتويات الحزمة مع الحفاظ على المجلدات.
5. استخدم رسالة الالتزام:
   - `feat: إضافة التخزين المركزي لسجل المصادر في Phase 0-E`
6. افتح Pull Request إلى `main` بالعنوان نفسه.
7. انتظر نجاح **فحص واثق**.
8. راجع ملف `docs/PHASE_0_E_SUPABASE_SETUP.md` ونفّذ إعداد Supabase ومتغيرات GitHub من الواجهة.
9. ادمج Pull Request.
10. أعد تشغيل **نشر معاينة واثق** على `main`.

## لا تضع داخل GitHub

- Supabase Secret key.
- Service Role key.
- كلمة مرور مالك المنصة.
