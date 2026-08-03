const RETRY_CLASS_BY_CODE = {
    INVALID_BLUEPRINT: "none",
    INVALID_ITEM_CONTRACT: "none",
    STALE_PLAN: "none",
    STALE_SOURCE: "manual_source_refresh",
    SOURCE_NOT_FOUND: "manual_source_refresh",
    SOURCE_ACCESS_DENIED: "manual_authentication",
    SOURCE_NOT_GROUNDED: "content_once",
    MODEL_TIMEOUT: "transport_once",
    MODEL_RATE_LIMITED: "transport_once",
    MODEL_UNAVAILABLE: "transport_once",
    MODEL_INVALID_JSON: "content_once",
    MODEL_INCOMPLETE_CONTENT: "content_once",
    MODEL_SCIENTIFIC_MISMATCH: "content_once",
    MODEL_ASSESSMENT_MISMATCH: "content_once",
    GLOBAL_DUPLICATION: "content_once",
    CANCELLED_BY_USER: "none",
    SUPERSEDED_BY_NEW_RUN: "none",
    INTERNAL_ERROR: "none",
};
export class AssessmentEngineError extends Error {
    code;
    retryClass;
    details;
    constructor(code, message, details = {}) {
        super(message);
        this.name = "AssessmentEngineError";
        this.code = code;
        this.retryClass = RETRY_CLASS_BY_CODE[code];
        this.details = details;
    }
}
export function retryClassForErrorCode(code) {
    return RETRY_CLASS_BY_CODE[code];
}
export function modelTransportErrorCode(status, aborted = false) {
    if (aborted)
        return "MODEL_TIMEOUT";
    if (status === 429)
        return "MODEL_RATE_LIMITED";
    if (status === 502 || status === 503 || status === 504)
        return "MODEL_UNAVAILABLE";
    return "INTERNAL_ERROR";
}
//# sourceMappingURL=errors.js.map