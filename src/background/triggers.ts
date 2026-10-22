import type { Browser } from '../platform/browser';
import { ALARM_LOCKED } from '../shared/constants';
import type { TabDormancyService } from './service';

function safe(promise: Promise<unknown>): void {
  void promise.catch((error) => console.error('[tab-dormancy]', error));
}

export function registerTriggers(browser: Browser, service: TabDormancyService): void {
  browser.onInstalled(() => safe(service.bootstrap()));
  browser.onStartup(() => safe(service.bootstrap()));

  browser.onIdleStateChanged((state) => {
    if (state === 'idle') safe(service.runCleanup('idle'));
    else if (state === 'locked') safe(service.onLocked());
    else safe(service.onActive());
  });

  browser.onAlarm((alarm) => {
    if (alarm.name === ALARM_LOCKED) safe(service.onLockAlarm());
  });
}
