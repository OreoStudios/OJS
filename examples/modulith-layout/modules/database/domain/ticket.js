'use strict';
const makeTicket = (id, title) => Object.freeze({ id, title });
module.exports = { makeTicket };
