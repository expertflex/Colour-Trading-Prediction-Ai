require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const AIPredictor = require('./ai_predictor');
const db = require('./database');

const token = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID || '7329384967';
const BOT_USERNAME = process.env.BOT_USERNAME || 'ColourTradingPredictions_bot';
const bot = new TelegramBot(token, { polling: true });
const ai = new AIPredictor();
const autoUsers = {};
const DAILY_LIMIT = 100;

const CHANNEL_USERNAME = 'Colour_trading_prediction_ai';
const CHANNEL_URL = 'https://t.me/' + CHANNEL_USERNAME;
const GAME_NAMES = { '30S': '30 Seconds', '1MIN': '1 Minute', '3MIN': '3 Minutes', '5MIN': '5 Minutes' };
const GAME_URLS = {
  '30S': 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
  '1MIN': 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json',
  '3MIN': 'https://draw.ar-lottery01.com/WinGo/WinGo_3M/GetHistoryIssuePage.json',
  '5MIN': 'https://draw.ar-lottery01.com/WinGo/WinGo_5M/GetHistoryIssuePage.json'
};

console.log('Bot starting...');
ai.refreshAll().then(() => console.log('AI Ready!'));
setInterval(() => ai.refreshAll(), 120000);

function getBigSmall(num) { return parseInt(num) >= 5 ? 'BIG' : 'SMALL'; }
function getTodayCount(userId) { const u = db.getAllUsers()[userId]; if (!u) return 0; const t = new Date().toDateString(); return u.lastPredictionDate !== t ? 0 : (u.dailyPredictions || 0); }
async function checkChannelMember(userId) { try { const m = await bot.getChatMember('@' + CHANNEL_USERNAME, userId); return ['member','administrator','creator'].includes(m.status); } catch(e) { return false; } }

// ==================== START ====================
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id, user = msg.from, referrer = match ? match[1] : null;
  if (!await checkChannelMember(user.id)) return bot.sendMessage(chatId, 'Join @' + CHANNEL_USERNAME + ' to use this bot.\n\n1. Join channel\n2. Click "Joined" button', { reply_markup: { inline_keyboard: [[{ text: 'Join Channel', url: CHANNEL_URL }], [{ text: 'I Have Joined! Start', callback_data: 'check_join' }]] } });
  
  db.saveUser(user.id, user.username, user.first_name, referrer);
  const plan = db.getUserPlan(user.id), isActive = autoUsers[user.id]?.active || false, todayCount = getTodayCount(user.id), stats = db.getUserStats(user.id);
  let planBadge = plan.plan === 'trial' ? 'TRIAL' : plan.plan === 'premium' ? 'PREMIUM' : plan.plan === 'expired' ? 'EXPIRED' : 'FREE';
  let msgText = 'WIN GO AI\n\n' + user.first_name + '\nPlan: ' + planBadge + '\nStatus: ' + (isActive ? 'ACTIVE' : 'IDLE') + '\nToday: ' + todayCount + '/' + DAILY_LIMIT + '\nBalance: Rs.' + stats.balance;
  
  const kb = [];
  if (plan.plan === 'none' && !plan.trialUsed) kb.push([{ text: 'Free Trial', callback_data: 'start_trial' }], [{ text: 'Buy Premium', callback_data: 'upgrade_premium' }]);
  else if (plan.plan === 'trial') kb.push([{ text: '1 Minute Game', callback_data: 'game_1MIN' }], [{ text: 'Upgrade', callback_data: 'upgrade_premium' }]);
  else if (plan.plan === 'premium') kb.push([{ text: '30 Sec', callback_data: 'game_30S' }, { text: '1 Min', callback_data: 'game_1MIN' }], [{ text: '3 Min', callback_data: 'game_3MIN' }, { text: '5 Min', callback_data: 'game_5MIN' }]);
  else kb.push([{ text: 'Renew', callback_data: 'upgrade_premium' }]);
  if (isActive) kb.push([{ text: 'STOP', callback_data: 'stop_auto' }]);
  else if ((plan.plan === 'trial' || plan.plan === 'premium') && todayCount < DAILY_LIMIT) kb.push([{ text: 'START AUTO', callback_data: 'start_auto' }]);
  kb.push([{ text: 'Plan', callback_data: 'menu_plan' }, { text: 'Stats', callback_data: 'menu_stats' }], [{ text: 'Referral', callback_data: 'menu_referral' }, { text: 'Support', callback_data: 'support_info' }]);
  bot.sendMessage(chatId, msgText, { reply_markup: { inline_keyboard: kb } });
});

// ==================== CALLBACKS ====================
bot.on('callback_query', async (q) => {
  const cid = q.message.chat.id, uid = q.from.id, d = q.data;
  if (d === 'check_join') { if (await checkChannelMember(uid)) { await bot.answerCallbackQuery(q.id, { text: 'Verified!' }); await bot.deleteMessage(cid, q.message.message_id).catch(() => {}); bot.emit('message', { chat: { id: cid }, from: q.from, text: '/start' }); } else { await bot.answerCallbackQuery(q.id, { text: 'Join channel first!', show_alert: true }); } return; }
  await bot.answerCallbackQuery(q.id);
  if (!await checkChannelMember(uid)) return bot.sendMessage(cid, 'Join @' + CHANNEL_USERNAME);
  
  const plan = db.getUserPlan(uid), tc = getTodayCount(uid), stats = db.getUserStats(uid);
  
  if (d === 'start_trial') { if (plan.trialUsed) return bot.sendMessage(cid, 'Trial used!'); db.setTrial(uid); return bot.sendMessage(cid, 'Trial Activated! 30 min\n/start'); }
  
  if (d === 'upgrade_premium') { const s = db.getSettings(); return bot.sendMessage(cid, 'PREMIUM\n\nIndia: Rs.' + (s.premiumPrice||2499) + '/mo\nGlobal: $30/mo\n\nSelect Payment:', { reply_markup: { inline_keyboard: [[{ text: 'UPI/Card', callback_data: 'pay_indian' }], [{ text: 'Bitcoin', callback_data: 'pay_btc' }], [{ text: 'USDT', callback_data: 'pay_usdt' }], [{ text: 'Back', callback_data: 'back_start' }]] } }); }
  if (d === 'pay_indian') { const s = db.getSettings(); return bot.sendMessage(cid, 'UPI Payment\n\nLink: ' + (s.indianPaymentLink||'Set by admin') + '\nAmount: Rs.' + (s.premiumPrice||2499)); }
  if (d === 'pay_btc') { const s = db.getSettings(); return bot.sendMessage(cid, 'BTC Payment\n\nAddress: ' + (s.btcAddress||'Set by admin') + '\nAmount: $30'); }
  if (d === 'pay_usdt') { const s = db.getSettings(); return bot.sendMessage(cid, 'USDT Payment\n\nAddress: ' + (s.usdtAddress||'Set by admin') + '\nAmount: $30'); }
  
  if (d === 'start_auto') { 
    if (plan.plan !== 'trial' && plan.plan !== 'premium') return bot.sendMessage(cid, 'No plan!'); 
    if (tc >= DAILY_LIMIT) return bot.sendMessage(cid, 'Daily limit!'); 
    let gt = plan.plan === 'trial' ? '1MIN' : '30S'; 
    if (autoUsers[uid]?.active) autoUsers[uid].active = false; 
    autoUsers[uid] = { chatId: cid, active: true, roundCount: 0, lastSeenPeriod: null, pendingPred: null, firstRun: true, gameType: gt }; 
    await bot.sendMessage(cid, 'STARTED - ' + GAME_NAMES[gt]); 
    startWatching(uid);
  }
  if (d.startsWith('game_')) { let gt = d.replace('game_',''), allowed = plan.plan === 'trial' ? ['1MIN'] : ['30S','1MIN','3MIN','5MIN']; if (!allowed.includes(gt)) return bot.sendMessage(cid, 'Premium only!'); if (tc >= DAILY_LIMIT) return bot.sendMessage(cid, 'Limit!'); if (autoUsers[uid]?.active) autoUsers[uid].active = false; autoUsers[uid] = { chatId: cid, active: true, roundCount: 0, lastSeenPeriod: null, pendingPred: null, firstRun: true, gameType: gt }; await bot.sendMessage(cid, GAME_NAMES[gt]); startWatching(uid); }
  if (d === 'stop_auto') { if (autoUsers[uid]?.active) { autoUsers[uid].active = false; bot.sendMessage(cid, 'Stopped'); } }
  if (d === 'menu_plan') bot.sendMessage(cid, 'Plan: ' + stats.plan + '\nBalance: Rs.' + stats.balance);
  if (d === 'menu_stats') bot.sendMessage(cid, 'Total: ' + stats.total + '\nWins: ' + stats.wins + '\nRate: ' + stats.winRate + '%');
  if (d === 'menu_referral') { bot.sendMessage(cid, 'Referral\nCode: ' + stats.referralCode + '\nLink: https://t.me/' + BOT_USERNAME + '?start=' + stats.referralCode + '\nEarn Rs.500/ref', { disable_web_page_preview: true }); }
  if (d === 'support_info') bot.sendMessage(cid, 'Support: /support message');
  if (d === 'back_start') bot.emit('message', { chat: { id: cid }, from: q.from, text: '/start' });
});

// ==================== SUPPORT ====================
bot.onText(/\/support (.+)/, (m, match) => { db.addSupportMessage(m.from.id.toString(), match[1], 'user'); bot.sendMessage(m.chat.id, 'Sent!'); bot.sendMessage(ADMIN_ID, 'Support\nUser: ' + m.from.id + '\nMsg: ' + match[1] + '\n/reply ' + m.from.id + ' msg'); });
bot.onText(/\/reply (\d+) (.+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.addSupportMessage(match[1], match[2], 'admin'); bot.sendMessage(match[1], 'Admin: ' + match[2]); });

// ==================== WITHDRAW ====================
bot.onText(/\/withdraw (\d+) (.+)/, (m, match) => { const uid = m.from.id, amt = parseInt(match[1]), addr = match[2], s = db.getUserStats(uid); if (amt < 2500) return bot.sendMessage(m.chat.id, 'Min Rs.2500'); if (amt > s.balance) return bot.sendMessage(m.chat.id, 'Balance: Rs.' + s.balance); db.addWithdrawRequest(uid, amt, addr.includes('@')?'UPI':'Crypto', addr); bot.sendMessage(m.chat.id, 'Request sent!'); bot.sendMessage(ADMIN_ID, 'Withdraw\nUser: ' + uid + '\nRs.' + amt); });

// ==================== PAYMENT ====================
bot.on('message', (m) => { const t = m.text; if (!t || t.startsWith('/') || t.length < 3) return; const ignore = ['Free Trial','Buy Premium','1 Minute','Upgrade','30 Sec','1 Min','3 Min','5 Min','Renew','STOP','START AUTO','Plan','Stats','Referral','Support','Back']; if (ignore.some(x => t.includes(x))) return; db.addPendingPayment(m.from.id, 'Manual', t); bot.sendMessage(m.chat.id, 'Payment proof received!'); bot.sendMessage(ADMIN_ID, 'Payment\nUser: ' + m.from.id + '\nProof: ' + t + '\n/approve 0'); });

// ==================== ADMIN ====================
bot.onText(/\/admin/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const u = db.getAllUsers(), p = db.getPendingPayments(); bot.sendMessage(m.chat.id, 'ADMIN\nUsers: ' + Object.keys(u).length + '\nPending: ' + p.length + '\n\n/pending | /users | /settings'); });
bot.onText(/\/pending/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const p = db.getPendingPayments(); if (!p.length) return bot.sendMessage(m.chat.id, 'No pending'); let t = 'Pending\n\n'; p.forEach((x,i) => { t += '#' + i + ' | ' + (x.userId||'').slice(-6) + '\n' + (x.txHash||'').slice(0,25) + '\n\n'; }); t += '/approve [num]'; bot.sendMessage(m.chat.id, t); });
bot.onText(/\/approve (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; const uid = db.approvePayment(parseInt(match[1]), m.from.id); if (uid) { bot.sendMessage(m.chat.id, 'Approved!'); bot.sendMessage(uid, 'Premium Activated!\n/start'); } });
bot.onText(/\/users/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const u = db.getAllUsers(); let t = 'Users\n\n'; Object.entries(u).slice(0,20).forEach(([id, data]) => { t += (data.firstName||'N/A') + ' | ' + (data.plan||'none') + '\n'; }); bot.sendMessage(m.chat.id, t); });
bot.onText(/\/addpremium (\d+) ?(\d+)?/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.setPremium(match[1], parseInt(match[2])||30); bot.sendMessage(m.chat.id, 'Premium added!'); bot.sendMessage(match[1], 'Premium Activated!\n/start'); });
bot.onText(/\/restarttrial (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.restartTrial(match[1]); bot.sendMessage(m.chat.id, 'Trial restarted!'); });

// ==================== SETTINGS ====================
bot.onText(/\/settings/, (m) => { if (m.from.id.toString() !== ADMIN_ID) return; const s = db.getSettings(); bot.sendMessage(m.chat.id, 'Settings\nLink: ' + (s.indianPaymentLink||'N/A') + '\nBTC: ' + (s.btcAddress||'N/A') + '\nUSDT: ' + (s.usdtAddress||'N/A') + '\nPrice: Rs.' + (s.premiumPrice||2499)); });
bot.onText(/\/setlink (.+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.saveSettings({ indianPaymentLink: match[1] }); bot.sendMessage(m.chat.id, 'Link saved!'); });
bot.onText(/\/setbtc (.+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.saveSettings({ btcAddress: match[1] }); bot.sendMessage(m.chat.id, 'BTC saved!'); });
bot.onText(/\/setusdt (.+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.saveSettings({ usdtAddress: match[1] }); bot.sendMessage(m.chat.id, 'USDT saved!'); });
bot.onText(/\/setprice (\d+)/, (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; db.saveSettings({ premiumPrice: parseInt(match[1]) }); bot.sendMessage(m.chat.id, 'Price updated!'); });

// ==================== BROADCAST ====================
bot.onText(/\/broadcast (.+)/, async (m, match) => { if (m.from.id.toString() !== ADMIN_ID) return; const ids = Object.keys(db.getAllUsers()); let s = 0; for (const id of ids) { try { await bot.sendMessage(id, match[1]); s++; } catch(e) {} } bot.sendMessage(m.chat.id, 'Sent: ' + s + '/' + ids.length); });

// ==================== WATCHER ====================
async function startWatching(userId) {
  if (!autoUsers[userId]?.active) return;
  const plan = db.getUserPlan(userId);
  if (plan.plan !== 'trial' && plan.plan !== 'premium') { autoUsers[userId].active = false; return; }
  if (getTodayCount(userId) >= DAILY_LIMIT) { autoUsers[userId].active = false; return bot.sendMessage(autoUsers[userId].chatId, 'Daily limit reached!'); }
  
  const chatId = autoUsers[userId].chatId, gameType = autoUsers[userId].gameType || '30S';
  try {
    const r = await axios.get(GAME_URLS[gameType], { params: { ts: Date.now() }, timeout: 5000 });
    const list = (r.data?.data?.list || []);
    if (!list.length) { setTimeout(() => startWatching(userId), 2000); return; }
    
    const latest = list[0], lp = latest.issueNumber;
    if (autoUsers[userId].firstRun) { autoUsers[userId].firstRun = false; autoUsers[userId].lastSeenPeriod = lp; await sendPrediction(userId, lp); setTimeout(() => startWatching(userId), 2000); return; }
    if (autoUsers[userId].lastSeenPeriod === lp) { setTimeout(() => startWatching(userId), 1000); return; }
    
    autoUsers[userId].lastSeenPeriod = lp;
    const ac = (latest.color||'').toUpperCase().includes('RED') ? 'RED' : 'GREEN', an = parseInt(latest.number);
    
    if (autoUsers[userId].pendingPred && lp === autoUsers[userId].pendingPred.period) {
      const pred = autoUsers[userId].pendingPred, cw = pred.color === ac, bw = pred.bigSmall === getBigSmall(an);
      db.updatePredictionResult(lp, ac, an);
      if (cw || bw) {
        let lines = cw && bw ? 'Color: ' + pred.color + ' | B/S: ' + pred.bigSmall : cw ? 'Color: ' + pred.color : 'B/S: ' + pred.bigSmall;
        let title = cw && bw ? 'DOUBLE WIN' : cw ? 'COLOR WIN' : 'B/S WIN';
        await bot.sendMessage(chatId, 'RESULT\nPeriod: ' + lp.slice(-4) + ' | ' + an + '\n' + lines + '\n' + title);
        await bot.sendMessage(chatId, 'WIN');
      }
      autoUsers[userId].pendingPred = null;
    }
    await sendPrediction(userId, lp);
    setTimeout(() => startWatching(userId), 2000);
  } catch(e) { setTimeout(() => startWatching(userId), 3000); }
}

async function sendPrediction(userId, fromPeriod) {
  const chatId = autoUsers[userId].chatId, gameType = autoUsers[userId].gameType || '30S';
  const p = fromPeriod.slice(0,-3), n = parseInt(fromPeriod.slice(-3)), np = p + String(n+1).padStart(3,'0');
  const pred = await ai.predict(gameType), bs = pred.number >= 5 ? 'BIG' : 'SMALL';
  autoUsers[userId].roundCount++;
  autoUsers[userId].pendingPred = { color: pred.color, number: pred.number, bigSmall: bs, period: np };
  db.savePrediction(userId, np, pred.color, pred.number, pred.confidence);
  await bot.sendMessage(chatId, 'PREDICTION\nPeriod: ' + np.slice(-4) + '\nColor: ' + pred.color + '\nB/S: ' + bs + '\nConf: ' + pred.confidence + '%');
}

bot.on('polling_error', (e) => console.log('Error:', e.message));
process.on('uncaughtException', (e) => console.log('Error:', e.message));
console.log('Bot Ready!');