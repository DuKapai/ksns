const path = require('node:path');
require('../server/node_modules/dotenv').config({ path: path.resolve(__dirname, '../server/.env') });

module.exports = {
  '/api/**': { target: `http://127.0.0.1:${process.env.PORT || 3000}`, secure: false },
};
