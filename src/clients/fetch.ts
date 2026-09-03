// 外部 HTTP クライアント共通の可用性境界。停止した上流で評価要求を永久に保持しない。

const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}
