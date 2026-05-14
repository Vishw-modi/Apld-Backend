import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { sendMessage } from "./gemini.js";
import {
  getOrCreateSession,
  getSession,
  prepareRefineSession,
  updateSessionRules,
} from "./sessions.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse the structured response from Gemini.
 * If the response contains ===RULES_JSON_START=== ... ===RULES_JSON_END===,
 * extract the JSON rules and the surrounding text as the reply.
 */
function parseGeminiResponse(rawText) {
  const startMarker = "===RULES_JSON_START===";
  const endMarker = "===RULES_JSON_END===";

  const startIdx = rawText.indexOf(startMarker);
  const endIdx = rawText.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    // No rules in this response — just a conversational reply
    return { reply: rawText.trim(), rules: null };
  }

  // Extract the JSON string between markers
  const jsonStr = rawText
    .substring(startIdx + startMarker.length, endIdx)
    .trim();

  // Extract the text before and after the JSON block as the reply
  const beforeJson = rawText.substring(0, startIdx).trim();
  const afterJson = rawText.substring(endIdx + endMarker.length).trim();
  const reply = [beforeJson, afterJson].filter(Boolean).join("\n\n");

  try {
    const rules = JSON.parse(jsonStr);

    // Add IDs to each rule if missing
    const rulesWithIds = rules.map((rule, index) => ({
      id: rule.id || `ai-${Date.now()}-${index}`,
      parameter: rule.parameter || "",
      description: rule.description || "",
      value: rule.value || "",
      enabled: rule.enabled !== undefined ? rule.enabled : true,
    }));

    return { reply, rules: rulesWithIds };
  } catch (err) {
    console.error("Failed to parse rules JSON from Gemini:", err.message);
    console.error("Raw JSON string:", jsonStr.substring(0, 500));
    // Return the full text as the reply if JSON parsing fails
    return {
      reply: rawText.trim(),
      rules: null,
    };
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/chat
 * Handles the initial chat phase — greeting + analysis request → business rules.
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, message, analysisType, analysisName, datasetName } =
      req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: "sessionId and message required" });
    }

    // Get or create session
    const session = getOrCreateSession(
      sessionId,
      analysisType || "switch-analysis",
      analysisName || "Analysis",
      datasetName || "Unknown Dataset"
    );

    // Send the message to Gemini
    const rawResponse = await sendMessage(session.chat, message);

    // Parse the response
    const { reply, rules } = parseGeminiResponse(rawResponse);

    // If rules were generated, store them in the session
    if (rules) {
      updateSessionRules(sessionId, rules);
    }

    return res.json({ reply, rules });
  } catch (err) {
    console.error("Error in /api/chat:", err);
    return res.status(500).json({
      error: "AI request failed",
      details: err.message,
    });
  }
});

/**
 * POST /api/refine
 * Handles the refinement phase — discussion + optional rule updates.
 */
app.post("/api/refine", async (req, res) => {
  try {
    const { sessionId, message, currentRules } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: "sessionId and message required" });
    }

    let session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // If this is the first refine call, prepare the refine chat
    if (!session.refineChat) {
      prepareRefineSession(sessionId, currentRules || session.rules);
      session = getSession(sessionId);
    }

    // Send to the refinement chat
    const rawResponse = await sendMessage(session.refineChat, message);

    // Parse the response
    const { reply, rules } = parseGeminiResponse(rawResponse);

    // If rules were updated, store them
    if (rules) {
      updateSessionRules(sessionId, rules);
    }

    return res.json({ reply, rules });
  } catch (err) {
    console.error("Error in /api/refine:", err);
    return res.status(500).json({
      error: "AI request failed",
      details: err.message,
    });
  }
});

/**
 * Health check
 */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 APLD Backend running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});
