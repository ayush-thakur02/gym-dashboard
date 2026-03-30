const express = require('express');
const { getDB } = require('../db/database');
const { asyncHandler, DATE_RE, toDateStr, addDays, todayStr } = require('./api.helpers');
const { requireAuth } = require('./api.middleware');

const router = express.Router();

// GET /api/stats
router.get('/', requireAuth, asyncHandler(async (_req, res) => {
    const db = getDB();
    const today = todayStr();
    const firstOfMonth = today.slice(0, 7) + '-01';
    const lastOfMonth = toDateStr(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));

    const [[{ c: totalMembers }]] = await db.execute('SELECT COUNT(*) AS c FROM members');
    const [[{ c: todayEntries }]] = await db.execute(
        'SELECT COUNT(*) AS c FROM daily_entry WHERE Date = ?', [today]
    );
    const [[{ s: monthlyRevenue }]] = await db.execute(
        'SELECT COALESCE(SUM(Money), 0) AS s FROM payments WHERE Date >= ? AND Date <= ?',
        [firstOfMonth, lastOfMonth]
    );
    const [[{ c: activeMembers }]] = await db.execute(
        'SELECT COUNT(DISTINCT Phone) AS c FROM daily_entry WHERE Date >= ?', [firstOfMonth]
    );

    res.json({ totalMembers, todayEntries, monthlyRevenue: Number(monthlyRevenue), activeMembers });
}));

// GET /api/stats/hourly
router.get('/hourly', requireAuth, asyncHandler(async (req, res) => {
    const date = req.query.date || todayStr();
    if (!DATE_RE.test(date))
        return res.status(400).json({ error: 'Invalid date' });
    const db = getDB();
    const [rows] = await db.execute(
        'SELECT HOUR(Time) AS hour, COUNT(*) AS count FROM daily_entry WHERE Date = ? GROUP BY hour ORDER BY hour',
        [date]
    );
    res.json(rows);
}));

// GET /api/stats/monthly
router.get('/monthly', requireAuth, asyncHandler(async (_req, res) => {
    const db = getDB();
    const [rows] = await db.execute(
        "SELECT DATE_FORMAT(Date, '%Y-%m') AS month, COUNT(*) AS count FROM daily_entry WHERE Date >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 11 MONTH), '%Y-%m-01') GROUP BY month ORDER BY month"
    );
    res.json(rows);
}));

// GET /api/stats/monthly-detail
router.get('/monthly-detail', requireAuth, asyncHandler(async (_req, res) => {
    const db = getDB();
    const [checkins] = await db.execute(
        "SELECT DATE_FORMAT(Date, '%Y-%m') AS month, COUNT(*) AS checkins FROM daily_entry GROUP BY month ORDER BY month"
    );
    const [revenue] = await db.execute(
        "SELECT DATE_FORMAT(Date, '%Y-%m') AS month, COUNT(*) AS payments, SUM(Money) AS revenue FROM payments GROUP BY month ORDER BY month"
    );

    const monthSet = new Set([...checkins.map(r => r.month), ...revenue.map(r => r.month)]);
    const months = Array.from(monthSet).sort();

    const checkinMap = Object.fromEntries(checkins.map(r => [r.month, r.checkins]));
    const revenueMap = Object.fromEntries(revenue.map(r => [r.month, { payments: r.payments, revenue: Number(r.revenue) }]));

    const rows = months.map(m => ({
        month: m,
        checkins: checkinMap[m] || 0,
        payments: revenueMap[m]?.payments || 0,
        revenue: revenueMap[m]?.revenue || 0,
    }));

    res.json(rows);
}));

// GET /api/stats/extended
router.get('/extended', requireAuth, asyncHandler(async (_req, res) => {
    const db = getDB();
    const today = todayStr();
    const firstOfMonth = today.slice(0, 7) + '-01';
    const firstOfYear = today.slice(0, 4) + '-01-01';
    const lastOfMonth = toDateStr(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));

    const [[{ c: newThisMonth }]] = await db.execute(`
        SELECT COUNT(DISTINCT p.Phone) AS c FROM payments p
        WHERE p.Date >= ? AND p.Date <= ?
          AND NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.Phone = p.Phone AND p2.Date < ?)
    `, [firstOfMonth, lastOfMonth, firstOfMonth]);

    const [topMembers] = await db.execute(`
        SELECT Name, Phone, COUNT(*) AS visits
        FROM daily_entry
        WHERE Date >= ? AND Date <= ?
        GROUP BY Phone ORDER BY visits DESC LIMIT 5
    `, [firstOfMonth, lastOfMonth]);

    const [revenueByMode] = await db.execute(`
        SELECT Mode, COALESCE(SUM(Money), 0) AS total, COUNT(*) AS txn
        FROM payments WHERE Date >= ? AND Date <= ? GROUP BY Mode
    `, [firstOfMonth, lastOfMonth]);
    revenueByMode.forEach(r => { r.total = Number(r.total); });

    const [[checkinStats]] = await db.execute(`
        SELECT COUNT(*) AS total, COUNT(DISTINCT Date) AS days
        FROM daily_entry WHERE Date >= ? AND Date <= ?
    `, [firstOfMonth, today]);
    const avgDaily = checkinStats.days > 0
        ? (checkinStats.total / checkinStats.days).toFixed(1)
        : 0;

    const [[{ s: ytdRevenue }]] = await db.execute(
        'SELECT COALESCE(SUM(Money), 0) AS s FROM payments WHERE Date >= ?', [firstOfYear]
    );

    res.json({ newThisMonth, topMembers, revenueByMode, avgDailyCheckins: Number(avgDaily), ytdRevenue: Number(ytdRevenue) });
}));

// GET /api/stats/expiring
router.get('/expiring', requireAuth, asyncHandler(async (req, res) => {
    const db = getDB();
    const today = todayStr();
    const daysAhead = Math.min(30, Math.max(1, parseInt(req.query.days) || 7));
    const future = new Date(today + 'T00:00:00');
    future.setDate(future.getDate() + daysAhead);
    const futureStr = toDateStr(future);

    const [lastPayments] = await db.execute(`
        SELECT p.Name, p.Phone, p.Date, p.Money
        FROM payments p
        INNER JOIN (SELECT Phone, MAX(Date) AS maxDate FROM payments GROUP BY Phone) latest
            ON p.Phone = latest.Phone AND p.Date = latest.maxDate
    `);

    const [planRows] = await db.execute('SELECT amount, duration_days FROM plans');
    const planDaysMap = Object.fromEntries(planRows.map(r => [r.amount, r.duration_days]));

    const expiring = lastPayments
        .filter(p => {
            const d = planDaysMap[p.Money];
            if (!d) return false;
            const expiry = addDays(p.Date, d);
            return expiry >= today && expiry <= futureStr;
        })
        .map(p => ({
            Name: p.Name,
            Phone: p.Phone,
            expiryDate: addDays(p.Date, planDaysMap[p.Money]),
        }))
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    res.json(expiring);
}));

module.exports = router;
