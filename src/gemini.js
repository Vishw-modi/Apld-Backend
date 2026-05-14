import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL_ID = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * Create a new chat session with a system instruction.
 * Returns the chat object from the SDK.
 */
export function createChat(systemInstruction) {
  return ai.chats.create({
    model: MODEL_ID,
    config: {
      systemInstruction,
      temperature: 0.7,
      topP: 0.9,
    },
  });
}

/**
 * Send a message to an existing chat with automatic retry on rate-limit (429).
 */
export async function sendMessage(chat, userMessage, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await chat.sendMessage({ message: userMessage });
      return response.text;
    } catch (err) {
      if (err.status === 429 && attempt < maxRetries) {
        // Parse retry delay from error or use exponential backoff
        const waitSec = Math.min(5 * Math.pow(2, attempt), 60);
        console.warn(`Rate limited (429). Retrying in ${waitSec}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }
      throw err;
    }
  }
}

console.log(`Using Gemini model: ${MODEL_ID}`);
