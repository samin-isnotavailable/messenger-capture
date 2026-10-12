import { insertTask } from './authClient.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'create-task',
    title: 'Create Task with Taskapture',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'create-task') return;

  const sourceType = tab.url && tab.url.includes('messenger.com') ? 'messenger' : 'website';

  try {
    await insertTask({
      task: info.selectionText,
      source_url: tab.url,
      source_type: sourceType,
      workflow_status: 'inbox',
      priority: 'medium',
    });
  } catch (err) {
    console.error('Taskapture: failed to create task —', err.message);
    // Context menu clicks have no UI to show an error in directly;
    // a badge/notification can be layered on later if this needs
    // to be more visible.
  }
});
