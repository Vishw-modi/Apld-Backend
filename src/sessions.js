import { createChat } from "./gemini.js";
import { getInitialSystemPrompt, getRefineSystemPrompt } from "./prompts.js";

/**
 * In-memory session store.
 * Each session holds:
 *   - chat: the Gemini chat object (maintains full conversation history)
 *   - rules: the latest business rules array
 *   - analysisType: e.g. "switch-analysis"
 *   - analysisName: e.g. "Switch Analysis"
 *   - datasetName: e.g. "APLD Claims 2022-2024"
 *   - phase: "chat" | "refine"
 *   - refineChat: a separate Gemini chat for refinement (created on demand)
 */
const sessions = new Map();

/**
 * Get or create an initial chat session.
 */
export function getOrCreateSession(sessionId, analysisType, analysisName, datasetName) {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  const systemPrompt = getInitialSystemPrompt(analysisType, analysisName, datasetName);
  const chat = createChat(systemPrompt);

  const session = {
    chat,
    rules: [],
    analysisType,
    analysisName,
    datasetName,
    phase: "chat",
    refineChat: null,
  };

  sessions.set(sessionId, session);
  return session;
}

/**
 * Get an existing session (or null).
 */
export function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * Store the latest rules in the session and create/update the refine chat.
 */
export function prepareRefineSession(sessionId, currentRules) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  session.rules = currentRules;
  session.phase = "refine";

  // Create a fresh refinement chat with the current rules as context
  const rulesJson = JSON.stringify(currentRules, null, 2);
  const refinePrompt = getRefineSystemPrompt(session.analysisName, rulesJson);
  session.refineChat = createChat(refinePrompt);

  sessions.set(sessionId, session);
  return session;
}

/**
 * Update stored rules after a refinement round.
 */
export function updateSessionRules(sessionId, rules) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.rules = rules;
  sessions.set(sessionId, session);
}
