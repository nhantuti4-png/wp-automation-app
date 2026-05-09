import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { AISettings, WorkflowStep, TaskState } from "../types.ts";

export interface AIPlanResult {
  strategy?: string;
  steps?: WorkflowStep[];
  coupons?: any[];
  [key: string]: any;
}

export interface AIPlanner {
  plan(prompt: string, screenshot?: string): Promise<AIPlanResult | null>;
}

export class GeminiPlanner implements AIPlanner {
  private client: GoogleGenAI;
  private model: string;

  constructor(settings: AISettings) {
    const key = settings.openaiApiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Gemini API Key missing. Please check settings or environment variables.");
    }
    this.client = new GoogleGenAI({ apiKey: key });
    this.model = settings.model || "gemini-2.0-flash";
  }

  async plan(prompt: string, screenshot?: string): Promise<AIPlanResult | null> {
    try {
      const contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];
      
      if (screenshot) {
        contents[0].parts.push({
          inlineData: {
            mimeType: "image/png",
            data: screenshot
          }
        });
      }

      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          responseMimeType: "application/json"
        }
      });
      
      const text = response.text;
      if (text) {
        const jsonMatch = text.match(/\{[\s\S]*\}/s);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
    } catch (e) {
      console.error("[GeminiPlanner] Error:", e);
    }
    return null;
  }
}

export class OpenAIPlanner implements AIPlanner {
  private client: OpenAI;
  private model: string;

  constructor(settings: AISettings) {
    const key = settings.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OpenAI API Key missing. Please check settings or environment variables.");
    }
    this.client = new OpenAI({
      apiKey: key
    });
    this.model = settings.model || "gpt-4o";
  }

  async plan(prompt: string, screenshot?: string): Promise<AIPlanResult | null> {
    try {
      const messages: any[] = [
        {
          role: "user",
          content: [
            { type: "text", text: prompt }
          ]
        }
      ];

      if (screenshot) {
        messages[0].content.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${screenshot}`
          }
        });
      }

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: { type: "json_object" }
      });
      
      const content = response.choices[0].message.content;
      if (content) {
        return JSON.parse(content);
      }
    } catch (e) {
      console.error("[OpenAIPlanner] Error:", e);
    }
    return null;
  }
}

export function createAIPlanner(settings: AISettings): AIPlanner | null {
  if (settings.provider === 'gemini') {
    return new GeminiPlanner(settings);
  }
  if (settings.provider === 'openai') {
    return new OpenAIPlanner(settings);
  }
  return null;
}
