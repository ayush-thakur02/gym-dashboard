const express = require('express');
const { getDB } = require('../db/database');
const { asyncHandler, DATE_RE } = require('./api.helpers');
const { requireAuth } = require('./api.middleware');

const router = express.Router();

// GET /api/members
router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const db = getDB();
    const search = `%${req.query.search || ''}%`;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const [[{ c: total }]] = await db.execute(
        'SELECT COUNT(*) AS c FROM members WHERE Name LIKE ? OR CAST(Phone AS CHAR) LIKE ?',
        [search, search]
    );
    const [rows] = await db.execute(
        'SELECT * FROM members WHERE Name LIKE ? OR CAST(Phone AS CHAR) LIKE ? ORDER BY ID DESC LIMIT ? OFFSET ?',
        [search, search, limit, offset]
    );
    res.json({ rows, total, page, limit });
}));

// GET /api/members/by-id/:id  — must come before /:phone
router.get('/by-id/:id', requireAuth, asyncHandler(async (req, res) => {
    const db = getDB();
    const [[member]] = await db.execute('SELECT * FROM members WHERE ID = ?', [Number(req.params.id)]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
}));

// GET /api/members/:phone
router.get('/:phone', requireAuth, asyncHandler(async (req, res) => {
    const db = getDB();
    const [[member]] = await db.execute('SELECT * FROM members WHERE Phone = ?', [req.params.phone]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
}));

// POST /api/members
router.post('/', requireAuth, asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, emergencyPhone, dob, address } = req.body;

    if (!firstName?.trim()) return res.status(400).json({ error: 'First name is required' });
    if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required' });

    const phoneStr = phone.trim();
    if (!/^\d{10}$/.test(phoneStr)) return res.status(400).json({ error: 'Phone must be exactly 10 digits' });
    if (firstName.trim().length > 50) return res.status(400).json({ error: 'First name is too long' });
    if ((lastName || '').trim().length > 50) return res.status(400).json({ error: 'Last name is too long' });
    if (dob && !DATE_RE.test(dob)) return res.status(400).json({ error: 'Invalid date of birth format' });
    if (emergencyPhone && !/^\d{10}$/.test(String(emergencyPhone)))
        return res.status(400).json({ error: 'Emergency phone must be 10 digits' });
    if ((address || '').trim().length > 300) return res.status(400).json({ error: 'Address is too long' });

    const db = getDB();
    const [[existing]] = await db.execute('SELECT 1 FROM members WHERE Phone = ?', [phoneStr]);
    if (existing) return res.status(409).json({ error: 'Phone number already registered' });

    const name = `${firstName.trim()} ${(lastName || '').trim()}`.trim().toUpperCase();
    const addr = (address || '').trim().toUpperCase() || null;

    const [result] = await db.execute(
        'INSERT INTO members (Name, Phone, Emergency_Phone, DOB, Address) VALUES (?, ?, ?, ?, ?)',
        [name, phoneStr, emergencyPhone || 0, dob || null, addr]
    );

    res.status(201).json({ success: true, id: result.insertId, name });
}));

// PUT /api/members/:id
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, emergencyPhone, dob, address } = req.body;

    if (!firstName?.trim()) return res.status(400).json({ error: 'First name is required' });
    if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required' });

    const phoneStr = phone.trim();
    if (!/^\d{10}$/.test(phoneStr)) return res.status(400).json({ error: 'Phone must be exactly 10 digits' });
    if (firstName.trim().length > 50) return res.status(400).json({ error: 'First name is too long' });
    if ((lastName || '').trim().length > 50) return res.status(400).json({ error: 'Last name is too long' });
    if (dob && !DATE_RE.test(dob)) return res.status(400).json({ error: 'Invalid date of birth format' });
    if (emergencyPhone && !/^\d{10}$/.test(String(emergencyPhone)))
        return res.status(400).json({ error: 'Emergency phone must be 10 digits' });
    if ((address || '').trim().length > 300) return res.status(400).json({ error: 'Address is too long' });

    const db = getDB();
    const memberId = Number(req.params.id);
    const [[member]] = await db.execute('SELECT * FROM members WHERE ID = ?', [memberId]);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const [[conflict]] = await db.execute(
        'SELECT 1 FROM members WHERE Phone = ? AND ID != ?', [phoneStr, memberId]
    );
    if (conflict) return res.status(409).json({ error: 'Phone number already used by another member' });

    const name = `${firstName.trim()} ${(lastName || '').trim()}`.trim().toUpperCase();
    const addr = (address || '').trim().toUpperCase() || null;

    await db.execute(
        'UPDATE members SET Name = ?, Phone = ?, Emergency_Phone = ?, DOB = ?, Address = ? WHERE ID = ?',
        [name, phoneStr, emergencyPhone || 0, dob || null, addr, memberId]
    );

    if (name !== member.Name || phoneStr !== String(member.Phone)) {
        await db.execute('UPDATE payments SET Phone = ?, Name = ? WHERE Phone = ?', [phoneStr, name, member.Phone]);
        await db.execute('UPDATE daily_entry SET Phone = ?, Name = ? WHERE Phone = ?', [phoneStr, name, member.Phone]);
    }
    res.json({ success: true });
}));

module.exports = router;
