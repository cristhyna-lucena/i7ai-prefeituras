const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { ValidationPipe } = require('@nestjs/common');
const { CatalogService } = require('../dist/catalog/catalog.service');
const { UpdateModelDto } = require('../dist/catalog/catalog.dto');
const { ChatDto } = require('../dist/ai/dto/chat.dto');

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validate = (payload, metatype) => pipe.transform(payload, { type: 'body', metatype });

test('model capabilities accept supported settings and reject secret/config fields in HTTP payloads', async () => {
  const accepted = await validate({ capabilities: { supportsVision: true, supportsTools: true, contextWindow: 32000, maxOutputTokens: 1000 } }, UpdateModelDto);
  assert.equal(accepted.capabilities.contextWindow, 32000);
  await assert.rejects(validate({ capabilities: { supportsVision: true, apiKey: 'synthetic-never-public' } }, UpdateModelDto), /Bad Request/);
  await assert.rejects(validate({ capabilities: { contextWindow: 1 } }, UpdateModelDto), /Bad Request/);
  await assert.rejects(validate({ capabilities: { maxOutputTokens: -1 } }, UpdateModelDto), /Bad Request/);
});

test('public model catalog strips unknown capability keys and provider secrets even from administrative DB records', async () => {
  const service = new CatalogService({ aiModel: { findMany: async () => [{ id: 'model', name: 'GPT', slug: 'account-model', inputPrice: null, outputPrice: null, capabilities: { supportsVision: true, contextWindow: 32000, apiKey: 'synthetic-private', endpoint: 'private-address' }, provider: { id: 'provider', name: 'OpenAI', slug: 'openai' } }] } });
  const models = await service.models();
  assert.deepEqual(models[0].capabilities, { supportsVision: true, contextWindow: 32000 });
  assert.ok(!JSON.stringify(models).includes('synthetic-private'));
  assert.ok(!JSON.stringify(models).includes('private-address'));
});

test('chat HTTP payloads validate model IDs and attachment lists, rejecting client gateway overrides', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const accepted = await validate({ message: 'Analise', modelId: id, attachmentIds: [id] }, ChatDto);
  assert.equal(accepted.modelId, id);
  await assert.rejects(validate({ message: 'Analise', modelId: 'arbitrary-model-slug' }, ChatDto), /Bad Request/);
  await assert.rejects(validate({ message: 'Analise', attachmentIds: [id, id] }, ChatDto), /Bad Request/);
  await assert.rejects(validate({ message: 'Analise', gatewayUrl: 'https://untrusted.invalid', apiKey: 'client-secret' }, ChatDto), /Bad Request/);
});
