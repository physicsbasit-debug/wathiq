# Pull Request — Phase 0-F1

## العنوان

`feat: ربط Google Drive وإنشاء مجلدات واثق الأساسية`

## الوصف

تضيف المرحلة اتصال Google Drive الآمن لمالك المنصة عبر OAuth وSupabase Edge Function، وتُنشئ هيكل المجلدات الأساسي مرة واحدة، مع التحقق من عدم التكرار وإمكانية فتح المجلد وفصل الاتصال دون حذف الملفات.

## الملفات الرئيسية

- `src/google-drive.ts`
- `src/app.ts`
- `src/runtime-config.ts`
- `src/central-source-store.ts`
- `src/styles.css`
- `supabase/phase_0_f1_google_drive.sql`
- `supabase/functions/google-drive-oauth/index.ts`
- `supabase/config.toml`
- `.github/workflows/pages.yml`
- `tests/google-drive.test.mjs`

## خارج النطاق

- رفع PDF.
- استخراج محتوى المصادر.
- إنشاء مجلدات الصفوف والمواد.
- توليد الاختبارات.

## الفحوص

- [x] TypeScript strict
- [x] Build
- [x] 29/29 tests
- [ ] OAuth الحقيقي على Google Cloud
- [ ] المراجعة البصرية على الحاسوب والهاتف
