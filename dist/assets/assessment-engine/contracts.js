export const ASSESSMENT_ENGINE_SCHEMA_VERSION = 1;
export const ASSESSMENT_CONTRACT_VERSION = 1;
export const ASSESSMENT_BLUEPRINT_VERSION = 1;
export const MODEL_ALLOWED_OUTPUT_FIELDS = Object.freeze([
    "stimulus",
    "text",
    "options",
    "answer",
    "rationale",
    "markScheme",
    "needsReview",
]);
export const MODEL_FORBIDDEN_OUTPUT_FIELDS = Object.freeze([
    "planItemId",
    "sourceEvidenceId",
    "enrichmentEvidenceId",
    "sourceSupport",
    "enrichmentSupport",
    "enrichmentSourceTitle",
    "enrichmentSourceUrl",
    "lessonId",
    "sourceId",
    "chunkIndex",
    "visualTarget",
    "visual",
    "scientificItem",
    "marks",
    "questionType",
    "questionForm",
    "workingRequired",
    "contractHash",
    "model",
    "generatedAt",
    "requestId",
]);
//# sourceMappingURL=contracts.js.map