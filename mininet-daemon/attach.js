module.exports = attach

var statsServer = require('./hypercore-stats-server')

function attach (target, wait, emit) {
  statsServer(target, wait, emit)
}