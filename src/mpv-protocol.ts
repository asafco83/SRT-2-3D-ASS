// Pure mpv IPC protocol helpers — no Node.js APIs, testable anywhere.

export function buildMpvCommand(args: unknown[], requestId: number): string {
  return JSON.stringify({ command: args, request_id: requestId }) + '\n';
}

export interface MpvResponse {
  type: 'response';
  requestId: number;
  error: string;
  data: unknown;
}

export interface MpvEvent {
  type: 'event';
  event: string;
  data: unknown;
}

export type MpvMessage = MpvResponse | MpvEvent;

export function parseMpvMessage(line: string): MpvMessage | null {
  try {
    const obj = JSON.parse(line.trim()) as Record<string, unknown>;
    if ('event' in obj) {
      return { type: 'event', event: String(obj['event']), data: obj };
    }
    if ('request_id' in obj) {
      return {
        type: 'response',
        requestId: Number(obj['request_id']),
        error: String(obj['error'] ?? 'success'),
        data: obj['data'] ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}
