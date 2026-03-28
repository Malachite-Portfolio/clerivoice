const express = require('express');
const controller = require('./listeners.controller');
const { validate } = require('../../middleware/validate');
const { listListenersQuerySchema } = require('./listeners.validator');

const router = express.Router();

router.get('/', validate(listListenersQuerySchema, 'query'), controller.getListeners);
router.get('/:id', controller.getListener);
router.get('/:id/availability', controller.getAvailability);

module.exports = router;
