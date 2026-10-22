import type { Request, Response } from '../shared/messages';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function send<T>(request: Request): Promise<T> {
  const response = (await chrome.runtime.sendMessage(request)) as Response<T> | undefined;
  if (!response) throw new ApiError('INTERNAL', '后台无响应');
  if (!response.ok) throw new ApiError(response.error, response.message);
  return response.data;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败';
}

export function openDashboard(): void {
  void chrome.runtime.openOptionsPage();
}
