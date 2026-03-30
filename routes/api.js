const express = require('express');

const router = express.Router();

router.use('/auth', require('./api.auth'));
router.use('/checkin', require('./api.checkin'));
router.use('/stats', require('./api.stats'));
router.use('/members', require('./api.members'));
router.use('/payments', require('./api.payments'));
router.use('/entry', require('./api.entry'));
router.use('/plans', require('./api.plans'));
router.use('/data-issues', require('./api.data-issues'));
router.use('/backup', require('./api.backup'));

module.exports = router;
