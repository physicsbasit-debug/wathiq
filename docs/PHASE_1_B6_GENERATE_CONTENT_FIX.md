# Phase 1-B6 — إصلاح بنية مخرجات Gemini

## العَرَض المؤكد

بعد Phase 1-B5 أصبحت استجابة Gemini قابلة للتحليل بصفتها JSON، لكن الخادم رفضها برسالة:

`بنية الأسئلة المولدة غير صالحة`

هذه الرسالة لا تصدر إلا عندما يكون الناتج المحلل بلا مصفوفة جذرية اسمها `items`. وبذلك انتقل التشخيص من مشكلة قصّ النص إلى مشكلة عقد المخرجات نفسه.

## القرار التقني

نُقلت مهمة التوليد الأحادية من مسار Interactions السابق إلى `models.generateContent` مع النموذج الحالي `gemini-2.5-flash`، للأسباب الآتية:

- `generateContent` ما زال مدعومًا رسميًا.
- `gemini-2.5-flash` مدرج رسميًا ضمن النماذج التي تدعم Structured Outputs في `generateContent`.
- المهمة الحالية طلب أحادي بلا أدوات أو تاريخ محادثة، لذلك لا تحتاج خصائص الوكلاء أو إدارة الخطوات في Interactions.
- عقد الاستجابة أبسط ومحدد: `candidates[].content.parts[].text` مع `finishReason`.

## التعديلات

- استخدام endpoint:
  `v1beta/models/{model}:generateContent`
- إرسال `systemInstruction` و`contents` وفق عقد GenerateContent.
- تفعيل `store: false`.
- تحديد `responseMimeType: application/json`.
- إرسال `responseJsonSchema` يفرض:
  - المفتاح الجذري `items`.
  - عدد عناصر الدفعة نفسه.
  - `planItemId` من قائمة معرفات الدفعة فقط.
  - ثلاثة بدائل لكل مفردة.
  - الحقول النصية وخانة `needsReview`.
- قراءة جميع أجزاء النص داخل المرشح الأول.
- فحص `promptFeedback` و`finishReason` قبل تحليل JSON.
- الاحتفاظ بالتحقق الدلالي الخادمي بعد التحقق البنيوي.
- تسجيل `generation_validation_failed` مع المفاتيح الجذرية وعدد العناصر فقط، دون تسجيل النص المولد أو نص المصدر.

## ما لم يتغير

- فهرسة الكتب والمقاطع.
- الدروس المتعددة.
- مرجع التقويم الرسمي.
- قالب الاختبار القصير والنهائي.
- مفتاح Gemini وأسرار Supabase.
- قاعدة البيانات وSQL.
- طريقة النشر من GitHub ثم محرر Supabase.
