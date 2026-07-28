-- واثق | Phase 0-H1 Rebuild 2
-- حفظ إحداثيات OCR لصفحات الفهرس حتى يُعاد استخدامها دون تكلفة Vision إضافية.

alter table public.source_ocr_pages
  add column if not exists layout_json jsonb;

comment on column public.source_ocr_pages.layout_json is
  'تحليل موضعي للكلمات وإحداثياتها في صفحة الفهرس، صادر من Google Cloud Vision.';
