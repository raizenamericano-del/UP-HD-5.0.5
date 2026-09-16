'use strict';
/**
 * ALL VD HD — Riwayat pengiriman (JSON file, persistent di volume)
 */
const fs = require('fs');
const crypto = require('crypto');
const config = require('./config');
const { log } = require('./logger');

function load() {
  try {
    if (!fs.existsSync(config.HISTORY_FILE)) return [];
    const raw = fs.readFileSync(config.HISTORY_FILE, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    log.warn('Gagal membaca riwayat:', err.message);
    return [];
  }
}

function save(list) {
  try {
    fs.writeFileSync(config.HISTORY_FILE, JSON.stringify(list, null, 2));
  } catch (err) {
    log.error('Gagal menyimpan riwayat:', err.message);
  }
}

/** Tambah entri baru; kembalikan entri yang sudah tersimpan */
function add(entry) {
  const list = load();
  const item = {
    id: crypto.randomBytes(6).toString('hex'),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  list.unshift(item);
  // Prune: jaga maksimal MAX_HISTORY
  save(list.slice(0, config.MAX_HISTORY));
  return item;
}

function list() {
  return load();
}

function get(id) {
  return load().find((e) => e.id === id) || null;
}

function remove(id) {
  save(load().filter((e) => e.id !== id));
}

function clear() {
  save([]);
}

module.exports = { add, list, get, remove, clear, load };
