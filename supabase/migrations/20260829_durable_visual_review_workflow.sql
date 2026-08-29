-- Wathiq durable visual review workflow
-- Adds per-stage durable state for question_visual_jobs.

alter table public.question_visual_jobs
  add column if not exists workflow_state jsonb
  not null
  default '{
    "version": 1,
    "stage": "generate_original",
    "originalAssetPath": null,
    "correctedAssetPath": null,
    "provisionalOriginal": null,
    "provisionalCorrected": null,
    "correction": "",
    "generationAttempts": {"original": 0, "corrected": 0},
    "reviewAttempts": {"original": 0, "corrected": 0}
  }'::jsonb;

update public.question_visual_jobs
set workflow_state = '{
  "version": 1,
  "stage": "generate_original",
  "originalAssetPath": null,
  "correctedAssetPath": null,
  "provisionalOriginal": null,
  "provisionalCorrected": null,
  "correction": "",
  "generationAttempts": {"original": 0, "corrected": 0},
  "reviewAttempts": {"original": 0, "corrected": 0}
}'::jsonb
where workflow_state is null;
