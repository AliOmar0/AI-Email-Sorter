import OpenAI from "openai";

let client: OpenAI | null = null;

export function getAIClient(): OpenAI {
  const apiKey = process.env["DEEPSEEK_API_KEY"];
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com",
    });
  }
  return client;
}

export function isAIConfigured(): boolean {
  return Boolean(process.env["DEEPSEEK_API_KEY"]);
}

export const AI_MODEL = "deepseek-chat";
