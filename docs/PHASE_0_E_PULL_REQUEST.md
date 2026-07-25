# Pull Request — Phase 0-E

## العنوان

`feat: إضافة التخزين المركزي لسجل المصادر في Phase 0-E`

## الوصف

تنقل هذه المرحلة سجل المصادر إلى Supabase مع تسجيل دخول مالك المنصة وسياسات RLS، وتبقي نسخة محلية احتياطية. كما ترحّل بيانات Phase 0-D المحلية تلقائيًا وتضيف إعداد GitHub Pages عبر متغيرات المستودع.

## الملفات البارزة

- `src/central-source-store.ts`
- `src/runtime-config.ts`
- `supabase/phase_0_e_source_registry.sql`
- `docs/PHASE_0_E_SUPABASE_SETUP.md`
- تحديث `src/app.ts`, `src/styles.css`, `scripts/build.mjs`, و`pages.yml`

## الفحوص

- `24/24 PASS` محليًا.
- يلزم نجاح GitHub Actions قبل الدمج.

## خارج النطاق

لا يوجد رفع حقيقي لملفات PDF أو Google Drive أو فهرسة أو ذكاء اصطناعي في هذه المرحلة.
