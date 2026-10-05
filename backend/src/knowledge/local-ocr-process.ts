import { fork, ChildProcess, ForkOptions } from 'node:child_process';
import { join } from 'node:path';

export class LocalOcrProcess {
  private readonly child: ChildProcess;
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: string) => void; reject: (error: Error) => void }>();
  readonly ready: Promise<string>;
  constructor() {
    this.ready = new Promise((resolve, reject) => this.pending.set(0, { resolve, reject }));
    const options: ForkOptions & { windowsHide: boolean } = { windowsHide: true, serialization: 'advanced', execArgv: ['--max-old-space-size=512'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] };
    this.child = fork(join(__dirname, 'ocr-worker.js'), [], options);
    this.child.on('message', (message: { id?: number; text?: string; ready?: boolean; error?: boolean }) => {
      if (typeof message?.id !== 'number') return;
      const pending = this.pending.get(message.id); if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error('Falha no OCR local. Verifique a instalação e a qualidade do PDF.'));
      else pending.resolve(message.ready ? '' : String(message.text ?? ''));
    });
    const failed = () => { for (const pending of this.pending.values()) pending.reject(new Error('O processo de OCR local foi interrompido.')); this.pending.clear(); };
    this.child.on('error', failed); this.child.on('exit', failed);
  }
  recognize(image: Buffer): Promise<string> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.send({ id, image }, error => { if (error) { this.pending.delete(id); reject(new Error('Não foi possível enviar a página ao OCR local.')); } });
    });
  }
  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    await new Promise<void>(resolve => { this.child.once('exit', () => resolve()); this.child.kill(); });
  }
}
