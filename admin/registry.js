const { getAllBots } = require('../handlers/botStore');

function loadBotRegistry() {
  return getAllBots();
}

module.exports = {
  loadBotRegistry,
};
