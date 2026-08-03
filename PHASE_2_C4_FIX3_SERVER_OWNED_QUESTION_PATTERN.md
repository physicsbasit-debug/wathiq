# Phase 2-C4 Fix 3 — Server-Owned Question Pattern

## Root cause
`questionForm` and `workingRequired` were duplicated between the official plan and Gemini output. A scientifically valid question could be rejected merely because Gemini labelled a contextual calculation as `سياقي` instead of the plan's `حسابي`.

## Architectural fix
- The official plan is now the only source of truth for question pattern metadata.
- Gemini no longer returns `questionForm` or `workingRequired` in structured output.
- The server injects `questionForm = styleTarget` and derives `workingRequired` from marks.
- Semantic validators still enforce the actual requested pattern in the question content.
- Initial generation and per-item repair use the same server-owned contract.
