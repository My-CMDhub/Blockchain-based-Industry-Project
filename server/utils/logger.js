const winston = require('winston');

// Configure winston logger (copy from server.js if needed)
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Blockchain operation logger
function logBlockchain(operation, details) {
    console.log(`=== BLOCKCHAIN OPERATION [${new Date().toISOString()}] ===`);
    console.log(`>> Operation: ${operation}`);
    console.log(`>> Details: ${JSON.stringify(details, null, 2)}`);
    console.log('=======================================');
}

// Log to file function (currently logs to console)
function logToFile(message) {
    console.log(message);
}

module.exports = {
    logBlockchain,
    logToFile,
    logger
}; 