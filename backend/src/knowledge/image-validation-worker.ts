import { loadImage } from '@napi-rs/canvas';

process.on('disconnect', () => process.exit(0));
process.once('message', async (message: { buffer?: Buffer }) => {
  try {
    if (!Buffer.isBuffer(message?.buffer) || message.buffer.length > 10 * 1024 * 1024) throw new Error('invalid');
    const decoded = await loadImage(message.buffer);
    process.send?.({ width: decoded.width, height: decoded.height }, () => process.exit(0));
  } catch { process.send?.({ error: true }, () => process.exit(0)); }
});
