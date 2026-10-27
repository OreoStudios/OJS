'use strict';
const { getTitles } = require('./api');
module.exports = ({ database }) => ({ titles: () => getTitles(database.list()) });
