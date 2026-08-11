import type {
  AssessmentEngineErrorCode,
  AssessmentEngineRetryClass,
} from "./contracts.js";

const RETRY_CLASS_BY_CODE: Readonly<Record<AssessmentEngineErrorCode, AssessmentEngineRetryClass>> = {
  INVALID_BLUEPRINT: "none",
  INVALID_ITEM_CONTRACT: "none",
  STALE_PLAN: "none",
  AUTHORIZATION_FAILED: "manual_authentication",
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
  readonly code: AssessmentEngineErrorCode;
  readonly retryClass: AssessmentEngineRetryClass;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: AssessmentEngineErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "AssessmentEngineError";
    this.code = code;
    this.retryClass = RETRY_CLASS_BY_CODE[code];
    this.details = details;
  }
}

export function retryClassForErrorCode(code: AssessmentEngineErrorCode): AssessmentEngineRetryClass {
  return RETRY_CLASS_BY_CODE[code];
}

export function modelTransportErrorCode(status: number, aborted = false): AssessmentEngineErrorCode {
  if (aborted) return "MODEL_TIMEOUT";
  if (status === 429) return "MODEL_RATE_LIMITED";
  if (status === 502 || status === 503 || status === 504) return "MODEL_UNAVAILABLE";
  return "INTERNAL_ERROR";
}
