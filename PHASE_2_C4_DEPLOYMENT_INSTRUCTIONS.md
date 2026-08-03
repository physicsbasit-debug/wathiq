# نشر Phase 2-C4

## GitHub

1. أنشئ فرعًا من `main` باسم:
   `phase-2c4-unified-scientific-item`
2. ارفع محتويات حزمة changed-files-only إلى جذر المستودع مع الاستبدال.
3. رسالة الحفظ:
   `feat: unify scientific item generation and visuals`
4. انتظر GitHub Actions. النتيجة المطلوبة:
   `418 passed, 0 failed`
5. ادمج Pull Request بعد ظهور اللون الأخضر.

## Supabase

أعد نشر الوظيفتين من الملفات الموجودة في المستودع:

- `supabase/functions/generate-source-questions/index.ts`
- `supabase/functions/question-visual-jobs/index.ts`

لا تشغّل SQL جديدًا. جدول `question_visual_jobs` الحالي كافٍ لأن النموذج العلمي محفوظ داخل `request_payload`.

## اختبار القبول

استخدم اختبارًا جديدًا أو أعد توليد أسئلة مسودة قديمة. المسودة القديمة التي لا تحتوي `scientificItem` لن تُعتمد أو تُصدّر.

اختبر مفردتين على الأقل:

1. عربة تسوق بقوتين مختلفتين، وتحقق من تطابق الأرقام في النص والرسم والإجابة.
2. جسمان مشحونان بشحنتين متماثلتين، وتحقق من ظهور التنافر لا التجاذب.

ثم صدّر Word وPDF وتأكد أن الأصل البصري والطبقة العلمية متطابقان مع المعاينة.
