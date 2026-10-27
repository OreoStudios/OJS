'use strict';
const { makeTicket } = require('../domain/ticket');
const list = () => [makeTicket(42, 'Demo')];
module.exports = { list };
