const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure db directory exists
const DB_DIR = path.join(__dirname, '../database');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'blockchain_pg.db');
const db = new sqlite3.Database(DB_PATH);

// Initialize database schema
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Transaction table (from keys.json activeAddresses)
      db.run(`CREATE TABLE IF NOT EXISTS transactions (
        address TEXT PRIMARY KEY,
        addr_index INTEGER,
        ethAmount TEXT,
        expectedAmount TEXT,
        cryptoType TEXT,
        createdAt TEXT,
        expiresAt TEXT,
        status TEXT,
        orderId TEXT,
        fiatAmount TEXT,
        fiatCurrency TEXT,
        amount TEXT,
        timestamp TEXT,
        amountVerified INTEGER
      )`);

      // Merchant transactions table
      db.run(`CREATE TABLE IF NOT EXISTS merchant_transactions (
        txId TEXT PRIMARY KEY,
        txHash TEXT,
        address TEXT,
        amount TEXT,
        ethAmount TEXT,
        expectedAmount TEXT,
        timestamp TEXT,
        status TEXT,
        type TEXT,
        cryptoType TEXT,
        amountVerified INTEGER,
        from_address TEXT,
        to_address TEXT,
        gasUsed INTEGER,
        gasPrice TEXT,
        completedAt TEXT,
        lastUpdated TEXT,
        UNIQUE(txId)
      )`);

      // Stripe transactions table
      db.run(`CREATE TABLE IF NOT EXISTS stripe_transactions (
        id TEXT PRIMARY KEY,
        orderId TEXT,
        amount INTEGER,
        currency TEXT,
        status TEXT,
        timestamp TEXT,
        paymentMethod TEXT,
        customerEmail TEXT,
        metadata TEXT
      )`);
    });

    db.get("PRAGMA foreign_keys = ON");
    resolve();
  });
}

module.exports = { db, initializeDatabase }; 