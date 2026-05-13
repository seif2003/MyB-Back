const { Router } = require('express');
const authenticate = require('../middleware/auth');
const meController = require('../controllers/me.controller');

const router = Router();

router.get('/me', authenticate, meController.getProfile);

module.exports = router;
