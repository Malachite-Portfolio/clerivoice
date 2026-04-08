const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const controller = require('./app.controller');

const router = express.Router();

router.get('/sidebar', authMiddleware, controller.getSidebar);

module.exports = router;
