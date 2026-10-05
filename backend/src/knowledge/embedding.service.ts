import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class EmbeddingService {
  get model() { return process.env.EMBEDDING_MODEL || 'text-embedding-3-small'; }
  get configured() { return Boolean(process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY); }

  async embed(texts: string[]): Promise<number[][] | null> {
    if (!this.configured) return null;
    const client = new OpenAI({
      apiKey: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL || undefined,
      timeout: 60000,
      maxRetries: 1,
    });
    try {
      const vectors: number[][] = [];
      for (let start = 0; start < texts.length; start += 64) {
        const batch = texts.slice(start, start + 64);
        const response = await client.embeddings.create({ model: this.model, input: batch, dimensions: 1536 });
        const ordered = [...response.data].sort((a, b) => a.index - b.index);
        if (ordered.length !== batch.length || ordered.some((item) => item.embedding.length !== 1536 || item.embedding.some((n) => !Number.isFinite(n)))) {
          throw new Error('Invalid embedding dimensions');
        }
        vectors.push(...ordered.map((item) => item.embedding));
      }
      return vectors;
    } catch {
      throw new ServiceUnavailableException('O provedor de embeddings falhou. Verifique a chave, o modelo e a conexão; depois reprocesse o documento.');
    }
  }
}
