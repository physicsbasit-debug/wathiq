# واثق

**واثق** مولد اختبارات **علوم Cambridge** بسيط في الإعداد، ومشدّد في المراجعة العلمية.

> **اختر برنامج Cambridge والمرحلة والمادة والموضوع؛ دع المؤلف يكتب بحرية، ثم دع المراجع العلمي يحاسبه.**

- الإصدار الحالي: **0.2.0 — Cambridge-first Simplicity Reset**
- النطاق: **مواد العلوم فقط**.
- Cambridge Primary Science: **0097 · Stages 1-6**.
- Cambridge Lower Secondary Science: **0893 · Stages 7-9**.
- Cambridge IGCSE: Physics 0625، Chemistry 0620، Biology 0610، Combined Science 0653، Co-ordinated Sciences 0654.
- رفع الكتب ودليل المعلم **اختياري**؛ ليس شرطًا لبدء التوليد.

## المسار الأساسي

```text
برنامج Cambridge + Stage + مادة + موضوع
  ↓
خطة أسئلة بسيطة قابلة للتعديل
  ↓
AI Author حر في السياق والبنية والمثير
  ↓
AI Reviewer مستقل يراجع العلم والتقويم والإجابة
  ↓
تحقق حتمي فقط فيما يستطيع البرنامج إثباته
  ↓
2D علمي مدقق عند الحاجة / بيانات رقمية حتمية عند الحاجة
  ↓
مراجعة الاختبار → Word / PDF
```

المصدر المرفوع، إن وُجد، يخصص السياق بكتاب أو دليل معين. غيابه لا يمنع التوليد ولا يجعل السؤال غير صالح تلقائيًا.

## ما لا يوجد في المسار الحالي

- لا يعتمد إنشاء الاختبار على أي خدمة تخزين خارجية.
- لا شرط لرفع كتاب الطالب أو دليل المعلم.
- لا شجرة كتاب إلزامية ولا TOC معقد.
- لا توجد قوالب خفية تفرض على المؤلف سياقًا أو شكلًا مصطنعًا للسؤال.
- لا بوابة رفض مبنية على تطابق كلمات عنوان الدرس.
- لا line-art كبديل للمرئيات التوضيحية 2D.
- لا ملفات SQL مرحلية؛ للبيئة الجديدة مخطط واحد فقط: `supabase/schema-current.sql`.

## تشغيل وفحص

```bash
npm install --no-audit --no-fund
npm run repo:check
npm run check
npm run dev
```

## الإعداد الخارجي

GitHub Pages variables:

```text
WATHIQ_SUPABASE_URL
WATHIQ_SUPABASE_PUBLISHABLE_KEY
```

Supabase secrets:

```text
WATHIQ_APP_URL
GEMINI_API_KEY
```

اختياريًا لتبديل النماذج دون تعديل الكود:

```text
GEMINI_AUTHOR_MODEL
GEMINI_REVIEW_MODEL
GEMINI_OCR_MODEL
GEMINI_IMAGE_MODEL
```

## الوثائق

- [المعمارية](docs/ARCHITECTURE.md)
- [النشر](docs/DEPLOYMENT.md)
- [التشغيل](docs/OPERATIONS.md)
- [معيار قبول الجودة](docs/QUALITY_ACCEPTANCE.md)
- [صيانة المستودع](docs/REPOSITORY_MAINTENANCE.md)
- [التاريخ المختصر](docs/HISTORY.md)
