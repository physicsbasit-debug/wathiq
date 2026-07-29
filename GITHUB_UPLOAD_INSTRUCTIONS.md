# Phase 1-B — تعليمات الرفع

- الفرع المقترح: `feat/phase-1-b-source-grounded-generation`
- رسالة الحفظ: `feat: توليد أسئلة موثقة من صفحات المصدر`
- ارفع محتويات حزمة الملفات المعدلة إلى جذر المستودع مع الاستبدال.
- انتظر فحص GitHub Actions الأخضر ثم ادمج إلى `main`.
- لا يوجد SQL جديد.
- توجد Edge Function جديدة يجب نشرها بعد الدمج: `generate-source-questions`.
- أضف سر Supabase باسم `OPENAI_API_KEY` قبل اختبار التوليد.
- لم يتغير workflow الخاص بـ GitHub Pages.
