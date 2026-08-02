# Phase 2-C2 — True 2D Render Pipeline

- الإصدار: 0.0.54
- الهدف: تحويل منظومة المرئيات من تحسين شكلي إلى بنية جذرية تفصل بين الأصل البصري وطبقة الشرح العلمي.

## ما تغير
- إضافة حقول assetKind و renderMode داخل illustration.
- دعم نمطي Replace و Overlay.
- توسيع أهلية الذكاء الاصطناعي إلى force_diagram (free_body / balanced_forces).
- توليد أصل 2D للكائن فقط في مخطط القوى، ثم إضافة الأسهم والتسميات من التطبيق نفسه.
- توحيد العرض في الواجهة وWord/PDF حول الأصل نفسه.

## الفحص المتوقع
- npm run build
- node --test tests/question-visual.test.mjs tests/phase-2-c1-visual-first-2d.test.mjs
