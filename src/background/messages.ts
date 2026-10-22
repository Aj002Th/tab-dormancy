import { AppError, type ErrorCode } from '../shared/errors';
import type { Request, Response } from '../shared/messages';
import type { TabDormancyService } from './service';

const ok = <T>(data: T): Response<T> => ({ ok: true, data });
const fail = (error: ErrorCode, message: string): Response<never> => ({ ok: false, error, message });

export async function handleRequest(message: unknown, service: TabDormancyService): Promise<Response<unknown>> {
  try {
    if (!message || typeof message !== 'object' || typeof (message as { type?: unknown }).type !== 'string') {
      return fail('INVALID_EXPRESSION', '未知消息');
    }
    const request = message as Request;
    switch (request.type) {
      case 'state.get':
        return ok(await service.getState());
      case 'cleanup.preview':
        return ok(await service.previewCleanup());
      case 'cleanup.run':
        return ok(await service.runCleanup('manual'));
      case 'tabs.list':
        return ok(await service.listTabs());
      case 'history.query':
        return ok(await service.queryHistory(request.query));
      case 'history.restore':
        return ok(await service.restoreHistory(request.ids, request.options));
      case 'history.delete':
        await service.deleteHistory(request.ids);
        return ok(null);
      case 'history.clear':
        await service.clearHistory();
        return ok(null);
      case 'strategy.preview':
        return ok(await service.previewStrategy(request.strategy));
      case 'strategy.save':
        return ok(await service.saveStrategy(request.strategy, request.previewSignature));
      case 'strategy.activate':
        await service.activateStrategy(request.id);
        return ok(null);
      case 'strategy.delete':
        await service.deleteStrategy(request.id);
        return ok(null);
      case 'settings.update':
        return ok(await service.updateSettings(request.patch));
      case 'debug.simulate-idle':
        if (import.meta.env.MODE === 'development') return ok(await service.runCleanup('manual'));
        return fail('NOT_FOUND', '仅开发模式可用');
      default:
        return fail('NOT_FOUND', '未知消息');
    }
  } catch (error) {
    if (error instanceof AppError) return fail(error.code, error.message);
    return fail('INTERNAL', error instanceof Error ? error.message : '内部错误');
  }
}

export function createMessageHandler(service: TabDormancyService) {
  return (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: Response<unknown>) => void,
  ): boolean => {
    void handleRequest(message, service).then(sendResponse);
    return true;
  };
}
