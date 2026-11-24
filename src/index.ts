export { PharmAssistant, type ClientOptions, type Conversations } from "./client.js";
export { Conversation, type ConversationOptions, type ConversationDefaults, MAX_HISTORY_TURNS } from "./conversation.js";
export {
  APIConnectionError, APIStatusError, APITimeoutError, AuthenticationError, CODES, type CodeErreur,
  ConfigurationError, ConversationNotFoundError, type ErrorInit, InvalidRequestError, NotFoundError,
  PermissionDeniedError, PharmAssistantError, QuotaExceededError, RateLimitError, ServerError,
} from "./errors.js";
export {
  type AskOptions, DEFAULT_BASE_URL, DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT, type HistoryInput, type Journal,
} from "./internal/base.js";
export {
  Answer, type AskResponse, type Citation, type Citations, type Clarification, type ConversationDeleted,
  type ConversationDetail, type ConversationMessage, type ConversationSummary, correctedQuestion, type Health,
  type HistoryTurn, KeyInfo, type KeyInfoResponse, type KeyPoint, type Mode, type Passage, type RateLimit,
  type RecordLine, type Reference, type SourceRef, type Usage,
} from "./models.js";
export { AnswerStream, EVENEMENTS, type StreamEvent } from "./stream.js";
export { VERSION } from "./version.js";
