require('dotenv').config();
const { db, initDb } = require('../db');

initDb();

const games = ['freefire', 'bgmi', 'cod', 'valorant', 'apex', 'fortnite', 'practice'];

const insert = db.prepare(`
  INSERT INTO tournaments (game, title, mode, map, entry_fee, prize_pool, start_time, slots_total, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const seedAll = db.transaction(() => {
  const now = Date.now();
  games.forEach((game, i) => {
    insert.run(
      game,
      `${game.toUpperCase()} Weekly Clash #${i + 1}`,
      'Squad',
      'Bermuda',
      game === 'practice' ? 0 : 49,
      game === 'practice' ? 0 : 5000,
      new Date(now + (i + 1) * 3600 * 1000).toISOString(),
      100,
      'live'
    );
  });
});

seedAll();
console.log(`Seeded ${games.length} tournaments.`);
