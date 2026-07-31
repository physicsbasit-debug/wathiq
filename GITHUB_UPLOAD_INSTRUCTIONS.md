# خطوات الرفع إلى GitHub

1. تأكد أن `main` يحتوي Phase 1-C4 الإصدار `0.0.45`.
2. أنشئ فرعًا جديدًا باسم: `phase-1c4-fix1-contextual-stimulus-alignment`.
3. فك الحزمة وارفع **محتوياتها** إلى جذر المستودع مع الاستبدال. لا ترفع ملف ZIP نفسه.
4. رسالة الحفظ: `fix: align contextual questions with visual stimulus`.
5. النتيجة المطلوبة: `306 passed` و`0 failed`.
6. بعد الدمج أعد نشر `supabase/functions/generate-source-questions/index.ts` من محرر Supabase.
7. نفذ `Ctrl + F5`، وافتح المسودة نفسها واضغط `التالي`. ستبقى المفردات المكتملة ويُستكمل الباقي فقط.

لا حاجة إلى SQL أو أسرار جديدة أو إعادة فهرسة أو إنشاء اختبار جديد.
