/* ============================================================
   storage.js — local persistence layer
   All app data lives in localStorage under namespaced keys.
   Kept separate from every other module so the persistence
   strategy (localStorage today) can be swapped later without
   touching business logic.
   ============================================================ */

const Storage = (() => {
  const NS = 'omrmagic:v1:';

  function keyOf(collection) { return NS + collection; }

  function readAll(collection) {
    try {
      const raw = localStorage.getItem(keyOf(collection));
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Storage read failed for', collection, e);
      return [];
    }
  }

  function writeAll(collection, arr) {
    try {
      localStorage.setItem(keyOf(collection), JSON.stringify(arr));
      return true;
    } catch (e) {
      console.error('Storage write failed for', collection, e);
      return false;
    }
  }

  function getById(collection, id) {
    return readAll(collection).find(item => item.id === id) || null;
  }

  function upsert(collection, item) {
    const all = readAll(collection);
    const idx = all.findIndex(x => x.id === item.id);
    if (idx >= 0) all[idx] = item; else all.unshift(item);
    writeAll(collection, all);
    return item;
  }

  function remove(collection, id) {
    const all = readAll(collection).filter(x => x.id !== id);
    writeAll(collection, all);
  }

  function removeWhere(collection, predicate) {
    const all = readAll(collection).filter(x => !predicate(x));
    writeAll(collection, all);
  }

  function clearCollection(collection) {
    localStorage.removeItem(keyOf(collection));
  }

  function clearEverything() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(NS))
      .forEach(k => localStorage.removeItem(k));
  }

  function estimateUsageBytes() {
    let total = 0;
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(NS)) total += (localStorage.getItem(k) || '').length;
    });
    return total;
  }

  function uid(prefix) {
    const rand = Math.random().toString(36).slice(2, 9);
    return `${prefix}_${Date.now().toString(36)}${rand}`;
  }

  return { readAll, writeAll, getById, upsert, remove, removeWhere, clearCollection, clearEverything, estimateUsageBytes, uid };
})();
