const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const controller = require('./usage.controller');

const router = express.Router();

router.get('/summary', authMiddleware, controller.getSummary);

module.exports = router;
