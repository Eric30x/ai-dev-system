/**
 * LLM Router — 多 Provider 自动切换
 * Claude primary → OpenAI fallback → Mimo optional
 */

const config = require("../../shared/config");

const PROVIDERS = [
  {
    name: "claude",
    check: () => !!config.ANTHROPIC_API_KEY,
    call: async (system, user) => {
      const Anthropic = require("@anthropic-ai/sdk");
      const client = new Anthropic({
        apiKey: config.ANTHROPIC_API_KEY,
        baseURL: config.ANTHROPIC_BASE_URL || undefined,
      });
      const msg = await client.messages.create({
        model: config.MODEL_NAME,
        max_tokens: 8096,
        system,
        messages: [{ role: "user", content: user }],
      });
      const block = msg.content.find((b) => b.type === "text");
      return (block?.text || "").trim();
    },
  },
  {
    name: "openai",
    check: () => !!config.OPENAI_API_KEY,
    call: async (system, user) => {
      const OpenAI = require("openai");
      const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
      const res = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 8096,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return res.choices[0].message.content.trim();
    },
  },
];

/**
 * 调用 LLM（自动 fallback）
 */
async function chat(systemPrompt, userContent) {
  let lastError;

  for (const provider of PROVIDERS) {
    if (!provider.check()) continue;

    try {
      const result = await provider.call(systemPrompt, userContent);
      console.log(`  🤖 LLM: ${provider.name}`);
      return result;
    } catch (err) {
      console.warn(`  ⚠️ ${provider.name} 失败: ${err.message}`);
      lastError = err;
    }
  }

  throw lastError || new Error("没有可用的 LLM Provider");
}

/**
 * 提取 JSON
 */
function extractJSON(text) {
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) return JSON.parse(arrMatch[0]);
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);
  throw new Error("无法从 LLM 响应中提取 JSON");
}

module.exports = { chat, extractJSON };
