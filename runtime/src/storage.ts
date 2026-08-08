import * as fs from 'node:fs';
import * as path from 'node:path';

export function ensurePrivateDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

export function atomicJsonWrite(file: string, value: unknown): void {
  ensurePrivateDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}

export function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export class ProcessLock {
  private fd: number | null = null;

  constructor(private readonly file: string) {}

  acquire(): void {
    ensurePrivateDir(path.dirname(this.file));
    try {
      this.fd = fs.openSync(this.file, 'wx', 0o600);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const pid = Number(fs.readFileSync(this.file, 'utf8').trim());
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          throw new Error(`zkuat: another runtime is active with pid ${pid}`);
        } catch (probe: unknown) {
          if ((probe as NodeJS.ErrnoException).code !== 'ESRCH') throw probe;
        }
      }
      fs.unlinkSync(this.file);
      this.fd = fs.openSync(this.file, 'wx', 0o600);
    }
    fs.writeFileSync(this.fd, `${process.pid}\n`);
  }

  release(): void {
    if (this.fd !== null) fs.closeSync(this.fd);
    this.fd = null;
    try {
      fs.unlinkSync(this.file);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
