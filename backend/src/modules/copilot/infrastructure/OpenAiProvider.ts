import OpenAI from 'openai';
import type { AiProvider, ChatMessage, ChatResult } from '../domain/ports.js';

export class OpenAiProvider implements AiProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly chatModel: string, private readonly embeddingModel: string) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({ model: this.embeddingModel, input: text });
    const embedding = response.data[0]?.embedding;
    if (!embedding) throw new Error('OpenAI no devolvio un embedding');
    return embedding;
  }

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const response = await this.client.chat.completions.create({
      model: this.chatModel,
      messages,
      temperature: 0.2,
    });
    const choice = response.choices[0];
    return {
      content: choice?.message?.content ?? '',
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
    };
  }
}
