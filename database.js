const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.RENDER_DISK_MOUNT_PATH || __dirname;
const DB_PATH = path.join(DATA_DIR, 'database.json');

function initDB() {
  if (!fs.existsSync(DB_PATH)) {
    const data = {
      users: {}, predictions: [], stats: { totalPredictions: 0, totalWins: 0, totalRevenue: 0 },
      analytics: { hourlyWins: {}, consecutiveWin: 0, consecutiveLoss: 0 },
      pendingPayments: [], premiumUsers: [], supportChats: {}, activityLog: [],
      withdrawRequests: [], referralCommissions: [],
      settings: { indianPaymentLink: '', btcAddress: '', usdtAddress: '', premiumPrice: 2499, referralCommission: 500, minWithdraw: 2500 }
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  }
}

function readDB() {
  initDB();
  try { const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); return data; }
  catch(e) { initDB(); return readDB(); }
}

function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

function createUser(id, referrer = null) {
  return { id: String(id), username: '', firstName: '', plan: 'none', trialUsed: false, expiresAt: null, totalPredictions: 0, wins: 0, losses: 0, dailyPredictions: 0, lastPredictionDate: '', referralCode: 'REF' + String(id).slice(-6), referredBy: referrer, referralEarnings: 0, balance: 0, joinedAt: new Date().toISOString(), lastActive: new Date().toISOString() };
}

function saveUser(id, username, firstName, referrer = null) { const db = readDB(); if (!db.users[id]) { db.users[id] = createUser(id, referrer); } db.users[id].username = username || ''; db.users[id].firstName = firstName || ''; writeDB(db); }

function getUserPlan(id) { const db = readDB(); const u = db.users[id]; if (!u) return { plan: 'none', expiresAt: null, trialUsed: false }; if (u.plan !== 'none' && u.expiresAt && Date.now() > new Date(u.expiresAt).getTime()) { u.plan = 'expired'; writeDB(db); return { plan: 'expired', expiresAt: u.expiresAt, trialUsed: u.trialUsed }; } return { plan: u.plan || 'none', expiresAt: u.expiresAt, trialUsed: u.trialUsed || false }; }

function setTrial(id) { const db = readDB(); if (!db.users[id]) db.users[id] = createUser(id); if (db.users[id].trialUsed) return false; db.users[id].plan = 'trial'; db.users[id].trialUsed = true; db.users[id].expiresAt = new Date(Date.now()+30*60*1000).toISOString(); writeDB(db); return true; }

function setPremium(id, days = 30) { const db = readDB(); if (!db.users[id]) db.users[id] = createUser(id); db.users[id].plan = 'premium'; db.users[id].expiresAt = new Date(Date.now()+days*24*60*60*1000).toISOString(); if (!db.premiumUsers.includes(id)) db.premiumUsers.push(id); writeDB(db); return true; }

function restartTrial(id) { const db = readDB(); if (!db.users[id]) db.users[id] = createUser(id); db.users[id].plan = 'trial'; db.users[id].trialUsed = true; db.users[id].expiresAt = new Date(Date.now()+30*60*1000).toISOString(); writeDB(db); return true; }
function removePremium(id) { const db = readDB(); if (!db.users[id]) return false; db.users[id].plan = 'expired'; db.premiumUsers = db.premiumUsers.filter(u => u !== id); writeDB(db); return true; }
function deleteUser(id) { const db = readDB(); delete db.users[id]; db.premiumUsers = db.premiumUsers.filter(u => u !== id); writeDB(db); return true; }
function savePrediction(userId, period, color, number, confidence) { const db = readDB(); db.predictions.push({ userId: String(userId), period, predictedColor: color, predictedNumber: number, confidence: confidence || 50, timestamp: new Date().toISOString(), status: 'pending' }); if (db.users[userId]) db.users[userId].totalPredictions = (db.users[userId].totalPredictions || 0) + 1; db.stats.totalPredictions = (db.stats.totalPredictions || 0) + 1; writeDB(db); }
function updatePredictionResult(period, actualColor, actualNumber) { const db = readDB(); const pred = db.predictions.find(p => p.period === period && p.status === 'pending'); if (pred) { const win = pred.predictedColor === actualColor; pred.actualColor = actualColor; pred.actualNumber = actualNumber; pred.status = win ? 'win' : 'loss'; if (db.users[pred.userId]) { if (win) { db.users[pred.userId].wins = (db.users[pred.userId].wins || 0) + 1; db.stats.totalWins = (db.stats.totalWins || 0) + 1; } else { db.users[pred.userId].losses = (db.users[pred.userId].losses || 0) + 1; } } writeDB(db); return win; } return false; }
function getUserStats(id) { const db = readDB(); const u = db.users[id] || {}; return { total: u.totalPredictions||0, wins: u.wins||0, losses: u.losses||0, winRate: (u.totalPredictions||0)>0?(((u.wins||0)/(u.totalPredictions||0))*100).toFixed(1):'0.0', plan: u.plan||'none', balance: u.balance||0, referralEarnings: u.referralEarnings||0, referralCode: u.referralCode||'' }; }
function addPendingPayment(userId, type, txHash = '') { const db = readDB(); db.pendingPayments.push({ userId: String(userId), type, txHash, timestamp: new Date().toISOString(), status: 'pending' }); writeDB(db); }
function approvePayment(index, adminId) { const db = readDB(); if (db.pendingPayments[index]) { db.pendingPayments[index].status = 'approved'; const userId = db.pendingPayments[index].userId; setPremium(userId, 30); if (db.users[userId]?.referredBy && db.users[db.users[userId].referredBy]) { const ref = db.users[db.users[userId].referredBy]; ref.referralEarnings = (ref.referralEarnings||0)+(db.settings.referralCommission||500); ref.balance = (ref.balance||0)+(db.settings.referralCommission||500); } writeDB(db); return userId; } return null; }
function rejectPayment(index) { const db = readDB(); if (db.pendingPayments[index]) { db.pendingPayments[index].status = 'rejected'; writeDB(db); return true; } return false; }
function addSupportMessage(userId, message, from) { const db = readDB(); if (!db.supportChats) db.supportChats = {}; if (!db.supportChats[userId]) db.supportChats[userId] = []; db.supportChats[userId].push({ from, text: message, time: new Date().toISOString() }); writeDB(db); }
function getSupportChats(userId) { return (readDB().supportChats||{})[userId] || []; }
function getAllSupportUsers() { return Object.keys(readDB().supportChats||{}); }
function getPendingPayments() { return readDB().pendingPayments.filter(p => p.status === 'pending'); }
function getAllUsers() { return readDB().users; }
function getPremiumUsers() { const db = readDB(); return db.premiumUsers.map(uid => db.users[uid]).filter(u => u); }
function getAllPayments() { return readDB().pendingPayments; }
function getActivityLog() { return readDB().activityLog || []; }
function getSettings() { return readDB().settings || {}; }
function getWithdrawRequests() { return readDB().withdrawRequests || []; }
function getAnalytics() { return readDB().analytics || {}; }
function saveSettings(s) { const db = readDB(); db.settings = { ...db.settings, ...s }; writeDB(db); return true; }
function addWithdrawRequest(userId, amount, method, address) { const db = readDB(); db.withdrawRequests.push({ userId, amount, method, address, status: 'pending', time: new Date().toISOString() }); writeDB(db); }
function approveWithdraw(index) { const db = readDB(); if (db.withdrawRequests[index]) { db.withdrawRequests[index].status = 'approved'; const u = db.withdrawRequests[index]; if (db.users[u.userId]) db.users[u.userId].balance = Math.max(0, (db.users[u.userId].balance||0)-u.amount); writeDB(db); return u.userId; } return null; }

module.exports = { saveUser, savePrediction, updatePredictionResult, getUserStats, getAnalytics, getUserPlan, setTrial, setPremium, restartTrial, removePremium, deleteUser, addPendingPayment, approvePayment, rejectPayment, getPendingPayments, getAllUsers, getPremiumUsers, getAllPayments, getActivityLog, getSettings, saveSettings, addSupportMessage, getSupportChats, getAllSupportUsers, addWithdrawRequest, approveWithdraw, getWithdrawRequests };