const axios = require('axios');

const GAMES = {
  '30S': { name: '30 Seconds', url: 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json' },
  '1MIN': { name: '1 Minute', url: 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json' },
  '3MIN': { name: '3 Minutes', url: 'https://draw.ar-lottery01.com/WinGo/WinGo_3M/GetHistoryIssuePage.json' },
  '5MIN': { name: '5 Minutes', url: 'https://draw.ar-lottery01.com/WinGo/WinGo_5M/GetHistoryIssuePage.json' }
};

function normalizeColor(color) {
  if (!color) return 'GREEN';
  return color.toUpperCase().includes('RED') ? 'RED' : 'GREEN';
}

async function getHistory(gameType = '30S', limit = 500) {
  try {
    const game = GAMES[gameType];
    if (!game) return [];
    const response = await axios.get(game.url, { params: { ts: Date.now() }, timeout: 8000 });
    const data = response.data;
    let list = data?.data?.list || [];
    return list.slice(0, limit).map(item => ({
      issueNumber: item.issueNumber, number: parseInt(item.number),
      color: normalizeColor(item.color), time: item.time || new Date().toISOString()
    }));
  } catch (error) { return []; }
}

module.exports = { getHistory, GAMES, normalizeColor };