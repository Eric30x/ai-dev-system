/**
 * LLM Router V10 — 多 Provider 自动切换 + 重试 + 成本控制
 *
 * 支持: DeepSeek / Claude / OpenAI / Gemini
 * 策略: 按优先级尝试, 失败自动 fallback, 超时 60s
 */

const config = require("../../shared/config");

const PROVIDERS = [
  {
    name: "deepseek",
    check: () => !!config.ANTHROPIC_API_KEY,
    call: async (system, user, opts = {}) => {
      const Anthropic = require("@anthropic-ai/sdk");
      const client = new Anthropic({
        apiKey: config.ANTHROPIC_API_KEY,
        baseURL: config.ANTHROPIC_BASE_URL || "https://api.deepseek.com/anthropic",
        timeout: opts.timeout || 60000,
      });
      const msg = await client.messages.create({
        model: opts.model || config.MODEL_NAME || "deepseek-v4-pro",
        max_tokens: opts.maxTokens || 8096,
        temperature: opts.temperature ?? 0.3,
        system,
        messages: [{ role: "user", content: user }],
      });
      const block = msg.content.find((b) => b.type === "text");
      return (block?.text || "").trim();
    },
  },
  {
    name: "claude",
    check: () => !!process.env.CLAUDE_API_KEY,
    call: async (system, user, opts = {}) => {
      const Anthropic = require("@anthropic-ai/sdk");
      const client = new Anthropic({
        apiKey: process.env.CLAUDE_API_KEY,
        timeout: opts.timeout || 60000,
      });
      const msg = await client.messages.create({
        model: opts.model || "claude-sonnet-4-6",
        max_tokens: opts.maxTokens || 8096,
        temperature: opts.temperature ?? 0.3,
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
    call: async (system, user, opts = {}) => {
      const OpenAI = require("openai");
      const client = new OpenAI({
        apiKey: config.OPENAI_API_KEY,
        timeout: opts.timeout || 60000,
      });
      const res = await client.chat.completions.create({
        model: opts.model || "gpt-4o-mini",
        max_tokens: opts.maxTokens || 8096,
        temperature: opts.temperature ?? 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return res.choices[0].message.content.trim();
    },
  },
  {
    name: "gemini",
    check: () => !!process.env.GEMINI_API_KEY,
    call: async (system, user, opts = {}) => {
      const Gemini = require("@google/generative-ai");
      const genAI = new Gemini.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: opts.model || "gemini-2.0-flash" });
      const prompt = system ? `${system}\n\nUser: ${user}` : user;
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    },
  },
];

/**
 * 调用 LLM（按优先级 fallback）
 * @param {string} systemPrompt
 * @param {string} userContent
 * @param {object} opts — { model, maxTokens, temperature, timeout }
 */
async function chat(systemPrompt, userContent, opts = {}) {
  let lastError;
  const tried = [];

  for (const provider of PROVIDERS) {
    if (!provider.check()) {
      tried.push(`${provider.name}(skipped)`);
      continue;
    }

    try {
      const result = await provider.call(systemPrompt, userContent, opts);
      console.log(`  🤖 LLM: ${provider.name} ✓`);
      return result;
    } catch (err) {
      console.warn(`  ⚠️ ${provider.name} 失败: ${err.message}`);
      tried.push(`${provider.name}(error)`);
      lastError = err;
    }
  }

  throw lastError || new Error(`没有可用的 LLM Provider [${tried.join(", ")}]`);
}

/**
 * 提取 JSON（从 LLM 响应中）
 */
function extractJSON(text) {
  // 尝试直接解析
  try { return JSON.parse(text); } catch (e) { /* continue */ }

  // 提取数组
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch (e) { /* continue */ }
  }

  // 提取对象
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch (e) { /* continue */ }
  }

  // 提取 markdown 代码块中的 JSON
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) {
    try { return JSON.parse(codeMatch[1]); } catch (e) { /* continue */ }
  }

  throw new Error("无法从 LLM 响应中提取 JSON");
}

/**
 * 流式调用（SSE 风格，返回 async generator）
 */
async function* chatStream(systemPrompt, userContent, opts = {}) {
  // 先尝试支持 streaming 的 provider
  for (const provider of PROVIDERS) {
    if (!provider.check()) continue;
    try {
      // 非流式 fallback：一次性返回然后拆分
      const full = await provider.call(systemPrompt, userContent, opts);
      const chunks = full.split(/(?<=\n)/);
      for (const chunk of chunks) {
        yield chunk;
        await new Promise(r => setTimeout(r, 10));
      }
      return;
    } catch (err) {
      console.warn(`  ⚠️ ${provider.name} stream 失败: ${err.message}`);
    }
  }
  throw new Error("没有可用的 LLM Provider 支持流式调用");
}

module.exports = { chat, chatStream, extractJSON, PROVIDERS };
