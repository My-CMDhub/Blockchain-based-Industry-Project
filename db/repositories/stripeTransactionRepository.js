const { db } = require('../index');

/**
 * Repository for handling Stripe transactions
 */
class StripeTransactionRepository {
  /**
   * Get all Stripe transactions
   * @returns {Promise<Array>} Array of Stripe transactions
   */
  static getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM stripe_transactions', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  /**
   * Get Stripe transaction by ID
   * @param {string} id - Stripe transaction ID
   * @returns {Promise<Object>} Transaction object
   */
  static getById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM stripe_transactions WHERE id = ?', [id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  /**
   * Get Stripe transactions by order ID
   * @param {string} orderId - Order ID
   * @returns {Promise<Array>} Array of transaction objects
   */
  static getByOrderId(orderId) {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM stripe_transactions WHERE orderId = ?', [orderId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  /**
   * Add a new Stripe transaction
   * @param {Object} transaction - Transaction data
   * @returns {Promise<string>} ID of added transaction
   */
  static add(transaction) {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`INSERT INTO stripe_transactions 
        (id, orderId, amount, currency, status, timestamp, paymentMethod, customerEmail, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      stmt.run(
        transaction.id,
        transaction.orderId || null,
        transaction.amount || null,
        transaction.currency || null,
        transaction.status || null,
        transaction.timestamp || null,
        transaction.paymentMethod || null,
        transaction.customerEmail || null,
        transaction.metadata ? JSON.stringify(transaction.metadata) : null,
        function(err) {
          if (err) return reject(err);
          resolve(transaction.id);
        }
      );
      
      stmt.finalize();
    });
  }

  /**
   * Update a Stripe transaction
   * @param {string} id - Stripe transaction ID
   * @param {Object} transaction - Updated transaction data
   * @returns {Promise<number>} Number of rows affected
   */
  static update(id, transaction) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE stripe_transactions SET
          orderId = ?,
          amount = ?,
          currency = ?,
          status = ?,
          timestamp = ?,
          paymentMethod = ?,
          customerEmail = ?,
          metadata = ?
        WHERE id = ?`,
        [
          transaction.orderId || null,
          transaction.amount || null,
          transaction.currency || null,
          transaction.status || null,
          transaction.timestamp || null,
          transaction.paymentMethod || null,
          transaction.customerEmail || null,
          transaction.metadata ? JSON.stringify(transaction.metadata) : null,
          id
        ],
        function(err) {
          if (err) return reject(err);
          resolve(this.changes);
        }
      );
    });
  }

  /**
   * Delete a Stripe transaction
   * @param {string} id - Stripe transaction ID
   * @returns {Promise<number>} Number of rows affected
   */
  static delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM stripe_transactions WHERE id = ?', [id], function(err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });
  }
}

module.exports = StripeTransactionRepository; 