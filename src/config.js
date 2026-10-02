const logger = {
  info(message) {
    console.log(`[Roast XMD] ${message}`);
  },
  warn(message) {
    console.warn(`[Roast XMD] ${message}`);
  },
  error(message) {
    console.error(`[Roast XMD] ${message}`);
  }
};

module.exports = { logger };
