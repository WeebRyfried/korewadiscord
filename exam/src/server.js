const { loadConfig } = require('./config');
const { openDatabase } = require('./database');
const { createApp } = require('./app');

const config = loadConfig();
const db = openDatabase(config.dbPath);
const app = createApp({ db, config });

app.listen(config.port, () => {
  console.log(`Exam app listening on port ${config.port}`);
});
