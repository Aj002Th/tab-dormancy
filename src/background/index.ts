import { ChromeBrowser } from '../platform/chrome-browser';
import { Repo } from '../platform/storage';
import { createMessageHandler } from './messages';
import { TabDormancyService } from './service';
import { registerTriggers } from './triggers';

const browser = new ChromeBrowser();
const repo = new Repo(browser.storageLocal, browser.storageSession);
const service = new TabDormancyService({
  browser,
  repo,
  now: () => Date.now(),
  id: () => crypto.randomUUID(),
  userAgent: () => navigator.userAgent,
});

void service.bootstrap();
registerTriggers(browser, service);
chrome.runtime.onMessage.addListener(createMessageHandler(service));
