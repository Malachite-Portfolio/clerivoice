const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const controller = require('./support.controller');
const { createSupportTicketSchema } = require('./support.validator');

const router = express.Router();

router.post('/ticket', authMiddleware, validate(createSupportTicketSchema), controller.createTicket);

module.exports = router;
