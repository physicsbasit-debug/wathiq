# نشر واثق 0.3.16 — Recovery Baseline Reconciliation

## متغيرات GitHub Pages

```text
WATHIQ_SUPABASE_URL
WATHIQ_SUPABASE_PUBLISHABLE_KEY
```

## أسرار Supabase

```text
WATHIQ_APP_URL
GEMINI_API_KEY
```

اختياريًا:

```text
GEMINI_AUTHOR_MODEL
GEMINI_REVIEW_MODEL
GEMINI_VISUAL_PLANNER_MODEL
GEMINI_IMAGE_MODEL
```

## ترتيب الاستعادة

1. ارفع حزمة `changed_files_only` فوق المستودع الحالي وانتظر نجاح GitHub Actions وPages.
2. **لا تشغّل SQL جديدًا**؛ Runtime Contract v0.3.12 وSchema 0.3.15 يبقيان كما هما.
3. هذه المرحلة لا تضيف Provider Protocol جديدًا ولا تتطلب Secret جديدًا.
4. لا تعِد نشر Edge Functions تلقائيًا لمجرد رفع الحزمة. بعد النشر افحص `assessment-generation-worker/health`: يجب أن يبقى `providerProtocolVersion=5`, `thinItemContractVersion=1`, `visualPlannerVersion=2`, `databaseContractVersion=1`.
5. إذا كان الـWorker الحي أقدم من ذلك فقط، أعد نشر `assessment-generation-worker` من المستودع ثم أعد فحص health.
6. لا تعِد نشر `science-visual-generation` في مرحلة الاستعادة قبل فحص نسخته الحية؛ ملف المستودع أعيد إلى آخر نسخة محلية اجتازت الفحوص، لكن حالة النشر الحي لا يمكن إثباتها من هذه البيئة.
7. نفّذ تحديثًا قويًا للصفحة ثم اختبار قبول حي كامل: تسجيل الدخول → اختيار صف/مادة/موضوع → إنشاء الدورة → أول مفردة → استكمال/تحديث الصفحة → المرئيات → المراجعة → Word/PDF.

## الفحص قبل الرفع

```bash
npm run check
```

`dist/` ناتج بناء ولا يحفظ في `main`.
