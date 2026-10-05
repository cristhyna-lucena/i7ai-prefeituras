export type ModelCapabilities = {
  supportsVision?: boolean; supportsTools?: boolean; supportsReasoning?: boolean; supportsTemperature?: boolean;
  contextWindow?: number; maxOutputTokens?: number;
};

// Only public, validated model settings leave the server. Provider configuration
// and arbitrary keys inserted by administrative scripts are never serialized.
export function publicModelCapabilities(value: unknown): ModelCapabilities {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: ModelCapabilities = {};
  for (const key of ['supportsVision', 'supportsTools', 'supportsReasoning', 'supportsTemperature'] as const) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  for (const [key, minimum, maximum] of [['contextWindow', 4096, 2000000], ['maxOutputTokens', 1, 200000]] as const) {
    const number = source[key];
    if (typeof number === 'number' && Number.isSafeInteger(number) && number >= minimum && number <= maximum) result[key] = number;
  }
  return result;
}
