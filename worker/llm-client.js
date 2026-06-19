/**
 * LLM 客户端 — 调用 Claude API
 */

const Anthropic = require("@anthropic-ai/sdk");
const config = require("../shared/config");

let _client = null;

function getClient() {
  if (!_client) _client = new Anthropic();
  return _client;
}

async function chat(systemPrompt, userContent) {
  const client = getClient();
  const message = await client.messages.create({
    model: config.MODEL_NAME,
    max_tokens: 8096,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  return (textBlock?.text || "").trim();
}

function extractJSON(text) {
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) return JSON.parse(arrMatch[0]);
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);
  throw new Error("无法从 LLM 响应中提取 JSON");
}

module.exports = { chat, extractJSON };
