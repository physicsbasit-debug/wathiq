# Phase 1-B — تعليمات الرفع

- الفرع المقترح: `fix/phase-1-b-gemini-provider`
- رسالة الحفظ: `fix: استخدام Gemini لتوليد الأسئلة الموثقة`
- ارفع محتويات حزمة الملفات المعدلة إلى جذر المستودع مع الاستبدال.
- انتظر فحص GitHub Actions الأخضر ثم ادمج إلى `main`.
- لا يوجد SQL جديد.
- توجد Edge Function جديدة يجب نشرها بعد الدمج: `generate-source-questions`.
- أضف سر Supabase باسم `GEMINI_API_KEY` قبل اختبار التوليد.
- لم يتغير workflow الخاص بـ GitHub Pages.
