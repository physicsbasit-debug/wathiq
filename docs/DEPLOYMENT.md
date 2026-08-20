# نشر واثق 0.3.19 — Server-Owned 2D Visual Jobs

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

## نشر 0.3.19 — Server-Owned 2D Visual Jobs

1. ارفع حزمة `changed_files_only` فوق 0.3.18 وانتظر نجاح GitHub Actions وPages.
2. **لا تشغّل SQL جديدًا** ولا تضف Secret جديدًا.
3. أعد نشر هاتين الوظيفتين فقط من ملفات المستودع الحالية كاملة:

```text
supabase/functions/assessment-generation-worker/index.ts
supabase/functions/question-visual-jobs/index.ts
```

4. لا حاجة لإعادة نشر `science-visual-generation` إذا كانت نسخة 0.3.18 الحالية منشورة، ولا تعِد نشر `assessment-generation-jobs`.
5. نفّذ تحديثًا قويًا للصفحة ثم أنشئ اختبارًا جديدًا يحتاج `context_scene`.
6. القبول: لا تظهر عبارة «لم تُنشأ مهمة الصورة بعد» بعد اكتمال المفردة؛ يجب أن تظهر مهمة `queued/generating/validating/ready`. وإذا تعذرت خدمة الصور يجب ألا تصبح المفردة `ready` بلا مهمة.

## نشر 0.3.18 — 2D Visual Reset

1. ارفع حزمة `changed_files_only` فوق 0.3.17 وانتظر نجاح GitHub Actions وPages.
2. **لا تشغّل SQL جديدًا.** Runtime Contract v0.3.12 وSchema الحاليان لا يتغيران.
3. لا Secret جديدًا؛ يستخدم مسار الصور `GEMINI_IMAGE_MODEL` الحالي إن كان مضبوطًا، وإلا fallback الموجود في الوظيفة.
4. أعد نشر **وظيفتين فقط** من ملفات المستودع الحالية كاملة، لا ترقيعًا يدويًا:

```text
supabase/functions/assessment-generation-worker/index.ts
supabase/functions/science-visual-generation/index.ts
```

5. لا تعِد نشر `assessment-generation-jobs` أو `question-visual-jobs`.
6. نفّذ تحديثًا قويًا للصفحة.
7. اختبار القبول الحي: أنشئ اختبارًا يحتوي زنبركًا/قوة/دائرة أو مشهدًا علميًا غير رقمي، وتأكد أن واثق لا يعرض الرسم التخطيطي الأسود القديم بل ينشئ مهمة `context_scene` ثم أصل 2D مدقق. اختبر أيضًا جدولًا أو رسمًا بيانيًا وتأكد أنه يبقى حتميًا بلا مهمة صورة.
8. القبول النهائي يتطلب تجربة Supabase/Gemini الحية؛ اختبارات المستودع لا تثبت نجاح نموذج الصور الخارجي.

## الفحص قبل الرفع

```bash
npm run check
```

`dist/` ناتج بناء ولا يحفظ في `main`.
