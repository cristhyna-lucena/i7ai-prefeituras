import { test, expect } from '@playwright/test';
import { mockSession, fixtures } from './fixtures';

const image = { id: 'image-old', name: 'foto-antiga.png', mimeType: 'image/png', sizeBytes: 100, status: 'READY' };
const history = fixtures['/conversations/conversation-2'];
function userMessage(id, content, attachment) {
  return { id, role: 'user', content, createdAt: history.createdAt, attachments: attachment ? [{ document: attachment }] : [] };
}
const cases = [
  {
    name: 'imagem fora das últimas quarenta mensagens',
    messages: [userMessage('image-message', 'Analise esta imagem antiga.', image), ...Array.from({ length: 41 }, (_, index) => userMessage('later-' + index, 'Mensagem posterior ' + index))],
  },
  {
    name: 'imagem substituída por cinco arquivos de texto mais recentes',
    messages: [userMessage('image-message', 'Analise esta imagem antiga.', image), ...Array.from({ length: 5 }, (_, index) => userMessage('text-message-' + index, 'Analise o texto ' + index, { id: 'text-' + index, name: 'texto-' + index + '.txt', mimeType: 'text/plain', sizeBytes: 10, status: 'READY' }))],
  },
];

for (const scenario of cases) {
  test(scenario.name + ' permite continuar com modelo sem visão', async ({ page }) => {
    const writes = [];
    await mockSession(page, { writes, overrides: { '/conversations/conversation-2': { ...history, messages: scenario.messages } } });
    await page.goto('/?module=chat');
    await page.getByRole('button', { name: 'Relatório da educação' }).click();
    await expect(page.getByLabel('Modelo da conversa')).toHaveValue('model-2');
    await page.getByLabel('Modelo da conversa').selectOption('model-3');
    await page.getByLabel('Mensagem', { exact: true }).fill('Continue a conversa.');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Enviar mensagem' })).toBeEnabled();
    await page.getByRole('button', { name: 'Enviar mensagem' }).click();
    await expect(page.getByText('Resposta confirmada pelo servidor.', { exact: true })).toBeVisible();
    expect(JSON.parse(writes[0].body)).toEqual({ message: 'Continue a conversa.', modelId: 'model-3', conversationId: 'conversation-2' });
  });
}
