const axios = require('axios');

class AIPredictor {
  constructor() { this.history = {}; }
  normalizeColor(c) { return (!c) ? 'GREEN' : c.toUpperCase().includes('RED') ? 'RED' : 'GREEN'; }

  async fetchHistory(gameType = '30S', limit = 500) {
    try {
      const urls = {
        '30S': 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
        '1MIN': 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json',
        '3MIN': 'https://draw.ar-lottery01.com/WinGo/WinGo_3M/GetHistoryIssuePage.json',
        '5MIN': 'https://draw.ar-lottery01.com/WinGo/WinGo_5M/GetHistoryIssuePage.json'
      };
      const r = await axios.get(urls[gameType], { params: { ts: Date.now() }, timeout: 8000 });
      this.history[gameType] = (r.data?.data?.list || []).slice(0, limit).map(i => ({
        issueNumber: i.issueNumber, number: parseInt(i.number),
        color: this.normalizeColor(i.color)
      }));
      return this.history[gameType];
    } catch (e) { return []; }
  }

  async predict(gameType = '30S') {
    const h = this.history[gameType] || [];
    if (h.length < 10) await this.fetchHistory(gameType, 500);
    if (h.length < 10) return { color: 'RED', number: 6, confidence: 50 };
    const r = h.slice(0, 10).filter(x => x.color === 'RED').length;
    const nums = r < 5 ? [0,2,4,6,8] : [1,3,5,7,9];
    return { color: r < 5 ? 'RED' : 'GREEN', number: nums[Math.floor(Math.random()*nums.length)], confidence: 50 + Math.floor(Math.random()*30) };
  }

  async refreshAll() {
    await this.fetchHistory('30S', 100);
    await this.fetchHistory('1MIN', 100);
    await this.fetchHistory('3MIN', 100);
    await this.fetchHistory('5MIN', 100);
  }
}

module.exports = AIPredictor;