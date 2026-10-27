'use strict';
const { describeTicket } = require('../domain/ticket-description');
const titles = tickets => tickets.map(describeTicket);
module.exports = { titles };
