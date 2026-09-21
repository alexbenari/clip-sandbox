export type BackendErrorCategory =
  | 'invalid-request'
  | 'invalid-state'
  | 'frame-boundary'
  | 'unsupported-command'
  | 'backend-failure'
  | 'cache-unavailable'
  | 'process-crash'
  | 'timeout'
  | 'protocol-error'
  | 'stale-response';

export class BackendError extends Error {
  constructor(
    public readonly category: BackendErrorCategory,
    message: string,
    public readonly recoverable: boolean,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}
