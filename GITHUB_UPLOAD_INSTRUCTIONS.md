# رفع Phase 0-F1 عبر GitHub

## الفرع

أنشئ من `main` فرعًا باسم:

`feat/phase-0-f1-google-drive-connection`

## الحزمة

استخدم حزمة `Changed Files Only` وارفع محتوياتها داخل الفرع الجديد.

## رسالة الالتزام

`feat: ربط Google Drive وإنشاء مجلدات واثق الأساسية`

## Pull Request

العنوان:

`feat: ربط Google Drive وإنشاء مجلدات واثق الأساسية`

## مهم: ملف GitHub Pages

تم تعديل:

`.github/workflows/pages.yml`

لذلك يُسلَّم أيضًا كملف منفصل. ارفعه داخل `.github/workflows` في الفرع نفسه.

## قبل الدمج

1. انتظر نجاح GitHub Actions.
2. أكمل إعداد Google Cloud وSupabase وفق الوثيقة:
   - `docs/PHASE_0_F1_GOOGLE_CLOUD_SETUP.md`
3. أضف متغير GitHub:
   - `WATHIQ_GOOGLE_OAUTH_CLIENT_ID`
4. نفّذ SQL وانشر Edge Function.
5. ادمج إلى `main`.
6. أعد نشر GitHub Pages واختبر الربط الحقيقي.
