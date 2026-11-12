// IndexedDB retains the original File without base64/JSON size limits.
const DB = 'ta-reg-import-drafts-v1';
let queue = Promise.resolve();
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function draftTabID() {
  const key = 'ta-reg-import-tab';
  let id = sessionStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
  return id;
}
export async function readImportDraft<T>(key: string): Promise<T | undefined> {
  await queue;
  const db = await database();
  try { return await new Promise<T | undefined>((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export function writeImportDraft(key: string, value: unknown | null) {
  const task = queue.then(async () => {
    const db = await database();
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      if (value === null) tx.objectStore('drafts').delete(key);
      else tx.objectStore('drafts').put(value, key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  });
  queue = task.catch(() => {});
  return task;
}
