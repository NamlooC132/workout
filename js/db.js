// IndexedDB wrapper. Every change is written immediately, so nothing is lost
// if the phone locks, the browser is closed or the app is swiped away.

const DB_NAME = 'workoutlog';
const DB_VERSION = 1; // bump + add a case below to migrate the database structure
export const STORES = ['exercises', 'routines', 'workouts', 'measurements', 'blocks'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('This browser has no storage (IndexedDB).'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const old = ev.oldVersion;
      // Structural migrations, applied in order.
      if (old < 1) {
        for (const s of STORES) db.createObjectStore(s, { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      // if (old < 2) { …future changes… }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Close other tabs of the app and reload.'));
  });
  return dbPromise;
}

function tx(storeNames, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    result = fn(t);
  }));
}

export function getAll(store) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
}

export function put(store, value) {
  return tx([store], 'readwrite', (t) => { t.objectStore(store).put(value); });
}

export function del(store, id) {
  return tx([store], 'readwrite', (t) => { t.objectStore(store).delete(id); });
}

export function getMeta(key) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction('meta').objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror = () => reject(req.error);
  }));
}

export function putMeta(key, value) {
  return tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').put({ key, value }); });
}

/** Writes many records across stores in ONE transaction – all or nothing. */
export function putMany(records /* { storeName: [values] } */, meta = {}) {
  const names = [...Object.keys(records), ...(Object.keys(meta).length ? ['meta'] : [])];
  return tx(names, 'readwrite', (t) => {
    for (const [s, list] of Object.entries(records)) {
      const os = t.objectStore(s);
      for (const v of list) os.put(v);
    }
    for (const [k, v] of Object.entries(meta)) t.objectStore('meta').put({ key: k, value: v });
  });
}

export function clearAll() {
  return tx([...STORES, 'meta'], 'readwrite', (t) => {
    for (const s of [...STORES, 'meta']) t.objectStore(s).clear();
  });
}
