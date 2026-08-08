import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const CONTAINER = 'zkuat-proof-server';
const LABEL = 'works.zkuat.runtime=true';

export interface ProofServerStatus {
  healthy: boolean;
  managed: boolean;
  running: boolean;
}

export class ProofServerManager {
  constructor(
    private readonly url: string,
    private readonly image: string,
  ) {}

  async isHealthy(): Promise<boolean> {
    try {
      await fetch(this.url, { method: 'GET', signal: AbortSignal.timeout(2_000) });
      return true;
    } catch {
      return false;
    }
  }

  private async inspect(): Promise<{ exists: boolean; running: boolean; managed: boolean }> {
    try {
      const { stdout } = await execFile('docker', [
        'inspect',
        '--format',
        '{{json .Config.Labels}}|{{.State.Running}}',
        CONTAINER,
      ]);
      const [labels, running] = stdout.trim().split('|');
      return {
        exists: true,
        running: running === 'true',
        managed: labels?.includes('works.zkuat.runtime') ?? false,
      };
    } catch {
      return { exists: false, running: false, managed: false };
    }
  }

  async status(): Promise<ProofServerStatus> {
    const inspected = await this.inspect();
    return {
      healthy: await this.isHealthy(),
      managed: inspected.managed,
      running: inspected.running,
    };
  }

  async start(timeoutMs = 120_000): Promise<void> {
    if (await this.isHealthy()) return;

    const inspected = await this.inspect();
    if (inspected.exists) {
      if (!inspected.managed) {
        throw new Error(`zkuat: Docker container ${CONTAINER} exists but is not owned by zkuat`);
      }
      if (!inspected.running) await execFile('docker', ['start', CONTAINER]);
    } else {
      const port = new URL(this.url).port || '6300';
      await execFile('docker', [
        'run',
        '--detach',
        '--name',
        CONTAINER,
        '--label',
        LABEL,
        '--publish',
        `127.0.0.1:${port}:6300`,
        '--env',
        'RUST_BACKTRACE=full',
        this.image,
        'midnight-proof-server',
        '-v',
      ]);
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isHealthy()) return;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error(`zkuat: proof server did not become ready at ${this.url}`);
  }

  async stop(): Promise<void> {
    const inspected = await this.inspect();
    if (!inspected.exists || !inspected.running) return;
    if (!inspected.managed) {
      throw new Error(`zkuat: refusing to stop unowned Docker container ${CONTAINER}`);
    }
    await execFile('docker', ['stop', CONTAINER]);
  }
}
