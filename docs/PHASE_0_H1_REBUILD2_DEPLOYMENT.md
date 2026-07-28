# نشر Phase 0-H1 Rebuild 2

## GitHub

ارفع الملفات إلى فرع `fix/phase-0-h1-positional-ocr-toc` وانتظر الفحص الأخضر دون دمج.

## Supabase SQL

نفّذ `supabase/phase_0_h1_rebuild2_positional_toc.sql` من SQL Editor. النتيجة المتوقعة: `Success. No rows returned`.

## Edge Function

استبدل كود `google-drive-oauth` بالكامل، وانشر الدالة، ثم تأكد أن `Verify JWT with legacy secret` مغلق.

## الدمج والاختبار

ادمج Pull Request، انتظر نشر GitHub Pages، ثم افتح الكتاب وأعد استخراج الهيكل. عند عدم اكتشاف الصفحة تلقائيًا، أدخل `12` في صفحات الفهرس يدويًا.
