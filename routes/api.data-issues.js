const express = require('express');
const { getDB } = require('../db/database');
const { asyncHandler } = require('./api.helpers');
const { requireAuth } = require('./api.middleware');

const router = express.Router();

// GET /api/data-issues
router.get('/', requireAuth, asyncHandler(async (_req, res) => {
    const db = getDB();
    const [rows] = await db.execute(`
        SELECT di.*, m.Name, m.Address
        FROM data_issues di
        LEFT JOIN members m ON di.table_name = 'members' AND di.record_id = m.ID
        ORDER BY di.id DESC
    `);
    res.json(rows);
}));

// DELETE /api/data-issues/:id
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return res.status(400).json({ error: 'Invalid ID' });
    const db = getDB();
    await db.execute('DELETE FROM data_issues WHERE id = ?', [id]);
    res.json({ success: true });
}));

module.exports = router;
