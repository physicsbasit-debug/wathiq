# Phase 0-E Fix 1 — إصلاح استدعاء fetch في المتصفح

## المشكلة

كان `fetch` الأصلي يُحفظ كدالة داخل `CentralSourceStore` ثم يُستدعى عبر `this.fetcher(...)`.
بعض المتصفحات ترفض استدعاء `window.fetch` بسياق كائن مختلف وتعرض:

`Failed to execute 'fetch' on 'Window': Illegal invocation`

## الإصلاح

- إضافة غلاف افتراضي يستدعي `globalThis.fetch(input, init)` مباشرة.
- إبقاء حقن `fetcher` للاختبارات دون تغيير عقد الفئة.
- إضافة اختبار انحدار يفرض أن يكون سياق الاستدعاء `globalThis`.

## النطاق

لا تغيير في قاعدة البيانات أو SQL أو إعدادات Supabase أو ملفات GitHub Actions.
