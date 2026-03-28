const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db/database');

const router = express.Router();

// ──────────────────────────────────────────────
// Plans helpers — DB-driven (replaces hardcoded PLAN_DAYS)
// ──────────────────────────────────────────────
function getPlanDays(amount) {
    const db = getDB();
    const plan = db
        .prepare('SELECT duration_days FROM plans WHERE amount = ? AND is_active = 1')
        .get(Number(amount));
    return plan ? plan.duration_days : null;
}

function getActivePlanAmounts() {
    const db = getDB();
    return db.prepare('SELECT amount FROM plans WHERE is_active = 1').all().map(r => r.amount);
}

function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

function nowTimeStr() {
    // IST = UTC+5:30
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().split('T')[1].split('.')[0];
}

// ──────────────────────────────────────────────
// Auth middleware
// ──────────────────────────────────────────────
function requireAuth(req, res, next) {
    const token =
        req.cookies?.gym_token ||
        (req.headers.authorization?.startsWith('Bearer ')
            ? req.headers.authorization.slice(7)
            : null);

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        req.admin = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
        next();
    } catch {
        res.clearCookie('gym_token');
        return res.status(401).json({ error: 'Session expired' });
    }
}

// ──────────────────────────────────────────────
// AUTH
// ──────────────────────────────────────────────
router.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: 'Username and password required' });

    const envUsername = process.env.ADMIN_USERNAME || 'admin';
    const envPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (username.trim() !== envUsername || password !== envPassword)
        return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
        { id: 1, username: envUsername },
        process.env.JWT_SECRET || 'dev_secret_change_me',
        { expiresIn: '8h' }
    );

    res.cookie('gym_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000,
        path: '/',
    });

    res.json({ success: true, username: envUsername });
});

router.post('/auth/logout', (_req, res) => {
    res.clearCookie('gym_token');
    res.json({ success: true });
});

router.get('/auth/verify', requireAuth, (req, res) => {
    res.json({ valid: true, username: req.admin.username });
});

// ──────────────────────────────────────────────
// USER CHECK-IN (public)
// ──────────────────────────────────────────────
router.post('/checkin', (req, res) => {
    const { phone } = req.body;
    if (!phone || String(phone).trim() === '')
        return res.status(400).json({ error: 'Phone number is required' });

    const db = getDB();
    const phoneNum = String(phone).trim();

    const member = db.prepare('SELECT * FROM members WHERE Phone = ?').get(phoneNum);
    if (!member)
        return res.status(404).json({ error: 'Member not found. Please register first.' });

    // Check latest payment
    const payment = db
        .prepare('SELECT * FROM payments WHERE Phone = ? ORDER BY Date DESC LIMIT 1')
        .get(phoneNum);

    if (!payment)
        return res.status(403).json({ error: 'No payment found. Please make payment first.' });

    const days = getPlanDays(payment.Money);
    if (!days)
        return res.status(500).json({ error: 'Unrecognized plan amount. Please contact admin.' });

    const expiryDate = addDays(payment.Date, days);
    const today = todayStr();

    if (today > expiryDate)
        return res.status(403).json({
            error: `Membership expired on ${expiryDate}. Please renew to enter.`,
        });

    // Duplicate check-in for today
    const alreadyIn = db
        .prepare('SELECT 1 FROM daily_entry WHERE Phone = ? AND Date = ?')
        .get(phoneNum, today);

    if (alreadyIn)
        return res.status(409).json({ error: 'You have already checked in today.' });

    const time = nowTimeStr();
    db.prepare(
        'INSERT INTO daily_entry (Name, Phone, Date, Time) VALUES (?, ?, ?, ?)'
    ).run(member.Name, phoneNum, today, time);

    res.json({
        success: true,
        message: `Welcome back, ${member.Name.trim()}!`,
        name: member.Name.trim(),
        time,
        expiresOn: expiryDate,
    });
});

// ──────────────────────────────────────────────
// STATS  (admin)
// ──────────────────────────────────────────────
router.get('/stats', requireAuth, (_req, res) => {
    const db = getDB();
    const today = todayStr();
    const firstOfMonth = today.slice(0, 7) + '-01';
    const lastOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        0
    )
        .toISOString()
        .split('T')[0];

    const totalMembers = db.prepare('SELECT COUNT(*) AS c FROM members').get().c;
    const todayEntries = db
        .prepare('SELECT COUNT(*) AS c FROM daily_entry WHERE Date = ?')
        .get(today).c;
    const monthlyRevenue = db
        .prepare(
            "SELECT COALESCE(SUM(Money), 0) AS s FROM payments WHERE Date >= ? AND Date <= ?"
        )
        .get(firstOfMonth, lastOfMonth).s;
    const activeMembers = db
        .prepare('SELECT COUNT(DISTINCT Phone) AS c FROM daily_entry WHERE Date >= ?')
        .get(firstOfMonth).c;

    res.json({ totalMembers, todayEntries, monthlyRevenue, activeMembers });
});

router.get('/stats/hourly', requireAuth, (req, res) => {
    const db = getDB();
    const date = req.query.date || todayStr();
    const rows = db
        .prepare(
            "SELECT CAST(strftime('%H', Time) AS INTEGER) AS hour, COUNT(*) AS count FROM daily_entry WHERE Date = ? GROUP BY hour ORDER BY hour"
        )
        .all(date);
    res.json(rows);
});

router.get('/stats/monthly', requireAuth, (_req, res) => {
    const db = getDB();
    const rows = db
        .prepare(
            "SELECT strftime('%Y-%m', Date) AS month, COUNT(*) AS count FROM daily_entry WHERE Date >= date('now', '-11 months', 'start of month') GROUP BY month ORDER BY month"
        )
        .all();
    res.json(rows);
});

router.get('/stats/monthly-detail', requireAuth, (_req, res) => {
    const db = getDB();
    const checkins = db
        .prepare(
            "SELECT strftime('%Y-%m', Date) AS month, COUNT(*) AS checkins FROM daily_entry GROUP BY month ORDER BY month"
        )
        .all();
    const revenue = db
        .prepare(
            "SELECT strftime('%Y-%m', Date) AS month, COUNT(*) AS payments, SUM(Money) AS revenue FROM payments GROUP BY month ORDER BY month"
        )
        .all();

    // Build a map covering all months from checkins + revenue
    const monthSet = new Set([
        ...checkins.map(r => r.month),
        ...revenue.map(r => r.month),
    ]);
    const months = Array.from(monthSet).sort();

    const checkinMap = Object.fromEntries(checkins.map(r => [r.month, r.checkins]));
    const revenueMap = Object.fromEntries(revenue.map(r => [r.month, { payments: r.payments, revenue: r.revenue }]));

    const rows = months.map(m => ({
        month: m,
        checkins: checkinMap[m] || 0,
        payments: revenueMap[m]?.payments || 0,
        revenue: revenueMap[m]?.revenue || 0,
    }));

    res.json(rows);
});

// ──────────────────────────────────────────────
// MEMBERS  (admin)
// ──────────────────────────────────────────────
router.get('/members', requireAuth, (req, res) => {
    const db = getDB();
    const search = `%${req.query.search || ''}%`;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const total = db.prepare(
        'SELECT COUNT(*) AS c FROM members WHERE Name LIKE ? OR Phone LIKE ?'
    ).get(search, search).c;
    const rows = db.prepare(
        'SELECT * FROM members WHERE Name LIKE ? OR Phone LIKE ? ORDER BY ID DESC LIMIT ? OFFSET ?'
    ).all(search, search, limit, offset);
    res.json({ rows, total, page, limit });
});

router.get('/members/by-id/:id', requireAuth, (req, res) => {
    const db = getDB();
    const member = db.prepare('SELECT * FROM members WHERE ID = ?').get(Number(req.params.id));
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
});

router.get('/members/:phone', requireAuth, (req, res) => {
    const db = getDB();
    const member = db
        .prepare('SELECT * FROM members WHERE Phone = ?')
        .get(req.params.phone);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
});

router.post('/members', requireAuth, (req, res) => {
    const { firstName, lastName, phone, emergencyPhone, dob, address } = req.body;

    if (!firstName?.trim()) return res.status(400).json({ error: 'First name is required' });
    if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required' });

    const phoneStr = phone.trim();
    if (!/^\d{10}$/.test(phoneStr))
        return res.status(400).json({ error: 'Phone must be exactly 10 digits' });

    const db = getDB();
    const existing = db.prepare('SELECT 1 FROM members WHERE Phone = ?').get(phoneStr);
    if (existing) return res.status(409).json({ error: 'Phone number already registered' });

    const name = `${firstName.trim()} ${(lastName || '').trim()}`.trim().toUpperCase();
    const addr = (address || '').trim().toUpperCase() || null;

    const result = db
        .prepare(
            'INSERT INTO members (Name, Phone, Emergency_Phone, DOB, Address) VALUES (?, ?, ?, ?, ?)'
        )
        .run(name, phoneStr, emergencyPhone || 0, dob || null, addr);

    res.status(201).json({ success: true, id: result.lastInsertRowid, name });
});

router.put('/members/:id', requireAuth, (req, res) => {
    const { firstName, lastName, phone, emergencyPhone, dob, address } = req.body;

    if (!firstName?.trim()) return res.status(400).json({ error: 'First name is required' });
    if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required' });

    const phoneStr = phone.trim();
    if (!/^\d{10}$/.test(phoneStr))
        return res.status(400).json({ error: 'Phone must be exactly 10 digits' });

    const db = getDB();
    const memberId = Number(req.params.id);
    const member = db.prepare('SELECT * FROM members WHERE ID = ?').get(memberId);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    // Check phone conflict with another member
    const conflict = db
        .prepare('SELECT 1 FROM members WHERE Phone = ? AND ID != ?')
        .get(phoneStr, memberId);
    if (conflict) return res.status(409).json({ error: 'Phone number already used by another member' });

    const name = `${firstName.trim()} ${(lastName || '').trim()}`.trim().toUpperCase();
    const addr = (address || '').trim().toUpperCase() || null;

    db.prepare(
        'UPDATE members SET Name = ?, Phone = ?, Emergency_Phone = ?, DOB = ?, Address = ? WHERE ID = ?'
    ).run(name, phoneStr, emergencyPhone || 0, dob || null, addr, memberId);

    // Cascade name + phone changes to related tables
    if (name !== member.Name || phoneStr !== String(member.Phone)) {
        db.prepare('UPDATE payments SET Phone = ?, Name = ? WHERE Phone = ?').run(
            phoneStr, name, member.Phone
        );
        db.prepare('UPDATE daily_entry SET Phone = ?, Name = ? WHERE Phone = ?').run(
            phoneStr, name, member.Phone
        );
    }

    res.json({ success: true });
});

// ──────────────────────────────────────────────
// PAYMENTS  (admin)
// ──────────────────────────────────────────────
router.get('/payments', requireAuth, (req, res) => {
    const db = getDB();
    const search = `%${req.query.search || ''}%`;
    const mode = req.query.mode || '';
    const month = req.query.month || '';   // '01'..'12'
    const year = req.query.year || '';   // '2024'
    const amount = req.query.amount || '';   // exact amount value
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const conditions = ['(Name LIKE ? OR Phone LIKE ?)'];
    const params = [search, search];

    if (mode) { conditions.push('Mode = ?'); params.push(mode); }
    if (year) { conditions.push("strftime('%Y', Date) = ?"); params.push(year); }
    if (month) { conditions.push("strftime('%m', Date) = ?"); params.push(month); }
    if (amount) { conditions.push('Money = ?'); params.push(Number(amount)); }

    const where = conditions.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS c FROM payments WHERE ${where}`).get(...params).c;
    const rows = db.prepare(`SELECT * FROM payments WHERE ${where} ORDER BY Date DESC, ID DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({ rows, total, page, limit });
});

router.get('/payments/:id', requireAuth, (req, res) => {
    const db = getDB();
    const payId = Number(req.params.id);
    if (!Number.isInteger(payId) || payId <= 0)
        return res.status(400).json({ error: 'Invalid payment ID' });
    const pay = db.prepare('SELECT * FROM payments WHERE ID = ?').get(payId);
    if (!pay) return res.status(404).json({ error: 'Payment not found' });
    res.json(pay);
});

router.post('/payments', requireAuth, (req, res) => {
    const { phone, amount, date, mode } = req.body;

    if (!phone?.trim()) return res.status(400).json({ error: 'Phone is required' });
    if (!amount) return res.status(400).json({ error: 'Amount is required' });
    if (!date) return res.status(400).json({ error: 'Date is required' });
    if (!mode) return res.status(400).json({ error: 'Payment mode is required' });

    if (!getActivePlanAmounts().includes(Number(amount)))
        return res.status(400).json({ error: 'Invalid plan amount' });

    const db = getDB();
    const member = db.prepare('SELECT * FROM members WHERE Phone = ?').get(phone.trim());
    if (!member) return res.status(404).json({ error: 'Member not found. Register first.' });

    db.prepare(
        'INSERT INTO payments (Name, Date, Phone, Mode, Money) VALUES (?, ?, ?, ?, ?)'
    ).run(member.Name, date, phone.trim(), mode, Number(amount));

    res.status(201).json({ success: true, name: member.Name });
});

router.put('/payments/:id', requireAuth, (req, res) => {
    const { amount, date, mode } = req.body;
    const db = getDB();
    const payId = Number(req.params.id);

    const pay = db.prepare('SELECT 1 FROM payments WHERE ID = ?').get(payId);
    if (!pay) return res.status(404).json({ error: 'Payment not found' });

    if (!getActivePlanAmounts().includes(Number(amount)))
        return res.status(400).json({ error: 'Invalid plan amount' });

    db.prepare('UPDATE payments SET Date = ?, Mode = ?, Money = ? WHERE ID = ?').run(
        date, mode, Number(amount), payId
    );

    res.json({ success: true });
});

// ──────────────────────────────────────────────
// DAILY ENTRY  (admin)
// ──────────────────────────────────────────────
router.get('/entry', requireAuth, (req, res) => {
    const db = getDB();
    const { filter, date, month, year, search } = req.query;
    const today = todayStr();

    let start, end;

    if (filter === 'month' && month && year) {
        const m = Number(month);
        const y = Number(year);
        start = `${y}-${String(m).padStart(2, '0')}-01`;
        const last = new Date(y, m, 0);
        end = last.toISOString().split('T')[0];
    } else if (filter === 'date' && date) {
        start = date;
        end = date;
    } else {
        start = today;
        end = today;
    }

    const searchParam = `%${search || ''}%`;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const total = db.prepare(
        `SELECT COUNT(*) AS c FROM daily_entry
         WHERE (Name LIKE ? OR CAST(Phone AS TEXT) LIKE ?)
           AND Date >= ? AND Date <= ?`
    ).get(searchParam, searchParam, start, end).c;

    const rows = db
        .prepare(
            `SELECT * FROM daily_entry
       WHERE (Name LIKE ? OR CAST(Phone AS TEXT) LIKE ?)
         AND Date >= ? AND Date <= ?
       ORDER BY Date DESC, Sno DESC LIMIT ? OFFSET ?`
        )
        .all(searchParam, searchParam, start, end, limit, offset);

    res.json({ rows, total, page, limit, start, end });
});

router.get('/stats/extended', requireAuth, (_req, res) => {
    const db = getDB();
    const today = todayStr();
    const firstOfMonth = today.slice(0, 7) + '-01';
    const firstOfYear = today.slice(0, 4) + '-01-01';
    const lastOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        0
    ).toISOString().split('T')[0];

    // New members: phone appearing in payments for the first time this month
    const newThisMonth = db.prepare(`
        SELECT COUNT(DISTINCT p.Phone) AS c FROM payments p
        WHERE p.Date >= ? AND p.Date <= ?
          AND NOT EXISTS (
              SELECT 1 FROM payments p2
              WHERE p2.Phone = p.Phone AND p2.Date < ?
          )
    `).get(firstOfMonth, lastOfMonth, firstOfMonth).c;

    // Top 5 most active members this month by check-ins
    const topMembers = db.prepare(`
        SELECT Name, Phone, COUNT(*) AS visits
        FROM daily_entry
        WHERE Date >= ? AND Date <= ?
        GROUP BY Phone
        ORDER BY visits DESC
        LIMIT 5
    `).all(firstOfMonth, lastOfMonth);

    // Revenue breakdown by payment mode this month
    const revenueByMode = db.prepare(`
        SELECT Mode, COALESCE(SUM(Money), 0) AS total, COUNT(*) AS txn
        FROM payments
        WHERE Date >= ? AND Date <= ?
        GROUP BY Mode
    `).all(firstOfMonth, lastOfMonth);

    // Avg daily check-ins this month (only days with at least one entry)
    const checkinStats = db.prepare(`
        SELECT COUNT(*) AS total, COUNT(DISTINCT Date) AS days
        FROM daily_entry WHERE Date >= ? AND Date <= ?
    `).get(firstOfMonth, today);
    const avgDaily = checkinStats.days > 0
        ? (checkinStats.total / checkinStats.days).toFixed(1)
        : 0;

    // Year-to-date revenue
    const ytdRevenue = db.prepare(
        `SELECT COALESCE(SUM(Money), 0) AS s FROM payments WHERE Date >= ?`
    ).get(firstOfYear).s;

    res.json({
        newThisMonth,
        topMembers,
        revenueByMode,
        avgDailyCheckins: Number(avgDaily),
        ytdRevenue,
    });
});

router.get('/stats/expiring', requireAuth, (req, res) => {
    const db = getDB();
    const today = todayStr();
    const daysAhead = Math.min(30, Math.max(1, parseInt(req.query.days) || 7));
    const future = new Date(today);
    future.setDate(future.getDate() + daysAhead);
    const futureStr = future.toISOString().split('T')[0];

    // Get the most recent payment per member
    const lastPayments = db.prepare(`
        SELECT p.Name, p.Phone, p.Date, p.Money
        FROM payments p
        INNER JOIN (
            SELECT Phone, MAX(Date) AS maxDate FROM payments GROUP BY Phone
        ) latest ON p.Phone = latest.Phone AND p.Date = latest.maxDate
    `).all();

    // Build plan-days map from DB once for this request
    const planDaysMap = Object.fromEntries(
        getDB().prepare('SELECT amount, duration_days FROM plans').all().map(r => [r.amount, r.duration_days])
    );

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
});

router.get('/entry/daily-counts', requireAuth, (req, res) => {
    const db = getDB();
    const { month, year } = req.query;
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const last = new Date(y, m, 0);
    const end = last.toISOString().split('T')[0];

    const rows = db
        .prepare(
            "SELECT Date, COUNT(*) AS count FROM daily_entry WHERE Date >= ? AND Date <= ? GROUP BY Date ORDER BY Date"
        )
        .all(start, end);

    res.json({ rows, start, end });
});

// ──────────────────────────────────────────────
// DATA ISSUES  (admin)
// ──────────────────────────────────────────────
router.get('/data-issues', requireAuth, (_req, res) => {
    const db = getDB();
    // Check table exists before querying
    const tableExists = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='data_issues'")
        .get();
    if (!tableExists) return res.json([]);

    const rows = db
        .prepare(`
            SELECT di.*, m.Name, m.Address
            FROM data_issues di
            LEFT JOIN members m ON di.table_name = 'members' AND di.record_id = m.ID
            ORDER BY di.id DESC
        `)
        .all();
    res.json(rows);
});

router.delete('/data-issues/:id', requireAuth, (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM data_issues WHERE id = ?').run(Number(req.params.id));
    res.json({ success: true });
});

// ──────────────────────────────────────────────
// PLANS  (admin)
// ──────────────────────────────────────────────
router.get('/plans', requireAuth, (_req, res) => {
    const db = getDB();
    const plans = db.prepare('SELECT * FROM plans ORDER BY category, amount').all();
    res.json(plans);
});

router.get('/plans/:id', requireAuth, (req, res) => {
    const db = getDB();
    const plan = db.prepare('SELECT * FROM plans WHERE ID = ?').get(Number(req.params.id));
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
});

router.post('/plans', requireAuth, (req, res) => {
    const { label, amount, duration_days, category } = req.body;

    if (!label?.trim()) return res.status(400).json({ error: 'Label is required' });
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
        return res.status(400).json({ error: 'Valid amount (₹) is required' });
    if (!duration_days || isNaN(Number(duration_days)) || Number(duration_days) <= 0)
        return res.status(400).json({ error: 'Valid duration (days) is required' });

    const db = getDB();
    const result = db
        .prepare('INSERT INTO plans (label, amount, duration_days, category, is_active) VALUES (?, ?, ?, ?, 1)')
        .run(label.trim(), Number(amount), Number(duration_days), (category || 'General').trim());

    res.status(201).json({ success: true, id: result.lastInsertRowid });
});

router.put('/plans/:id', requireAuth, (req, res) => {
    const { label, amount, duration_days, category, is_active } = req.body;
    const planId = Number(req.params.id);

    if (!label?.trim()) return res.status(400).json({ error: 'Label is required' });
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
        return res.status(400).json({ error: 'Valid amount (₹) is required' });
    if (!duration_days || isNaN(Number(duration_days)) || Number(duration_days) <= 0)
        return res.status(400).json({ error: 'Valid duration (days) is required' });

    const db = getDB();
    const plan = db.prepare('SELECT * FROM plans WHERE ID = ?').get(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const oldAmount = plan.amount;
    const newAmount = Number(amount);

    const updateBoth = db.transaction(() => {
        db.prepare(
            'UPDATE plans SET label = ?, amount = ?, duration_days = ?, category = ?, is_active = ? WHERE ID = ?'
        ).run(label.trim(), newAmount, Number(duration_days), (category || 'General').trim(), is_active ? 1 : 0, planId);

        if (oldAmount !== newAmount) {
            db.prepare('UPDATE payments SET Money = ? WHERE Money = ?').run(newAmount, oldAmount);
        }
    });

    updateBoth();

    res.json({ success: true });
});

router.delete('/plans/:id', requireAuth, (req, res) => {
    const planId = Number(req.params.id);
    const db = getDB();
    const plan = db.prepare('SELECT 1 FROM plans WHERE ID = ?').get(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    db.prepare('DELETE FROM plans WHERE ID = ?').run(planId);
    res.json({ success: true });
});

module.exports = router;
