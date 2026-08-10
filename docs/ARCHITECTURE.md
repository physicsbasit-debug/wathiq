# معمارية واثق الحالية

## الحالة

خط الأساس الحالي هو **v0.0.66 / Phase 2-D4**. المسار الإنتاجي يستخدم التوليد التدريجي الدائم، بينما تبقى بعض وحدات المحرك السابق لأغراض التوافق إلى أن يكتمل فحص الإزالة في المرحلة اللاحقة.

## الطبقات

### 1. المصدر والمحتوى

- `source-domain.ts` و`source-registry.ts`: هوية المصدر وحالته.
- `central-source-store.ts`: التخزين المركزي للمصادر.
- `pdf-indexer.ts` و`ocr-indexer.ts`: الاستخراج والفهرسة.
- `source-retrieval.ts`: استرجاع المقاطع المرتبطة بالدروس والصفحات.
- `book-content-tree.ts` و`lesson-catalog.ts`: شجرة الكتاب والوحدات والدروس.

### 2. نطاق الاختبار والسياسة

- `assessment-policy.ts`: قواعد التقويم الرسمية.
- `domain.ts`: المسودة وخطة الاختبار وتوزيع الدرجات.
- `assessment-generation-progressive.ts`: تحويل الخطة إلى Blueprint وعقود مفردات مستقلة.

### 3. نواة التوليد المشتركة

`src/assessment-engine/` هي الطبقة الحتمية المشتركة:

- `contracts.ts`: عقود الدورة والمفردة.
- `hashing.ts`: بصمات الخطط والعقود والمصادر.
- `blueprint.ts`: بناء المخطط.
- `source-grounding.ts`: تثبيت مرجع المفردة.
- `scientific-contracts.ts`: العقود العلمية الحتمية الحالية.
- `normalization.ts`: تطبيع نتيجة التوليد.
- `item-validation.ts`: تحقق المفردة.
- `global-review.ts`: مراجعة الاختبار ككل.
- `invariants.ts` و`errors.ts`: الثوابت والأخطاء.

### 4. التوليد الدائم

- `assessment-generation-jobs.ts`: عميل دورة التوليد الدائمة.
- `assessment-generation-orchestrator.ts`: التوازي، polling، الاستكمال وإعادة المفردة الفاشلة.
- `assessment-generation-worker.ts`: عميل عامل المفردة.
- Edge Function `assessment-generation-jobs`: إدارة الدورات والمهام.
- Edge Function `assessment-generation-worker`: Grounding + Gemini + Normalization + Validation لمفردة واحدة.

الحالة النموذجية للمفردة:

```text
queued / retry_pending
→ grounding
→ generating
→ normalizing
→ validating
→ ready
```

### 5. المرئيات

- `question-visual.ts`: مواصفات ورسوم SVG الحتمية.
- `scientific-item.ts`: النموذج العلمي الموحد المستخدم لربط النص والمرئي في الأنماط المدعومة.
- `visual-jobs.ts` + `question-visual-jobs`: تحسينات 2D الدائمة خارج المسار الحرج.

### 6. المراجعة والتصدير

- `app.ts`: ربط الواجهة والدورة والمسودة.
- `storage.ts`: حفظ المسودات وترحيل العقود القديمة.
- `exam-export.ts`: Word/PDF.

## حدود يجب الحفاظ عليها

1. Gemini لا يملك هوية المصدر أو الدليل أو العقد العلمي الخادمي.
2. نتيجة كل مفردة تحفظ خادميًا قبل اعتمادها في الواجهة.
3. `generationEpoch` والبصمات تمنع قبول النتائج المتأخرة أو الخاصة بخطة مختلفة.
4. المرئيات الضرورية علميًا لا يجوز حذفها لتقليل ميزانية الرسوم.
5. التصدير لا يعتمد على تفاصيل طابور التوليد.

## الدين التقني المعروف

- بعض وحدات التوليد السابقة ما زالت موجودة للتوافق، ويجب حذفها فقط بعد إغلاق اختبار D4 الحي وفحص الاعتماديات.
- العقود العلمية الحالية تغطي أنماطًا محددة وليست بعد إطار Validators عام للفيزياء والكيمياء والأحياء.
- منع التكرار البنيوي وObjective Capability Profiles من أعمال Phase 3 المقترحة، وليس من خط الأساس الحالي.
