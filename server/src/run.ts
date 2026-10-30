import { spawn, type ChildProcess } from 'node:child_process';

export class CommandError extends Error {
  readonly stderr: string;
  readonly timedOut: boolean;

  constructor(command: string, exitCode: number | null, stderr: string, timedOut: boolean) {
    super(timedOut ? `${command} timed out` : `${command} exited with code ${exitCode}`);
    this.name = 'CommandError';
    this.stderr = stderr;
    this.timedOut = timedOut;
  }
}

/** Runs a program (no shell) and resolves with its stdout. */
export function run(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Own process group on POSIX so a timeout also kills the ffmpeg that yt-dlp spawns.
    const detached = process.platform !== 'win32';
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout!.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-20_000);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      kill(child);
    }, timeoutMs);

    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(error.code === 'ENOENT' ? new Error(`"${command}" was not found. Is it installed and on PATH?`) : error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && !timedOut) resolve(stdout);
      else reject(new CommandError(command, code, stderr, timedOut));
    });
  });
}

function kill(child: ChildProcess) {
  try {
    if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch {
    // Already exited.
  }
}
