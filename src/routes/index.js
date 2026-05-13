const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const meRoutes = require('./me.routes');
const clientRoutes = require('./client.routes');
const adminRoutes = require('./admin.routes');
const supportRoutes = require('./support.routes');

const router = Router();

router.use(healthRoutes);
router.use('/auth', authRoutes);
router.use(meRoutes);
router.use('/client', clientRoutes);
router.use('/admin', adminRoutes);
router.use('/support', supportRoutes);

module.exports = router;
