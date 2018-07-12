#!/usr/bin/env node

var path = require('path')
var stats = require('./server')
var http = require('http')
var minimist = require('minimist')
var events = require('events')

/*
var argv = minimist(process.argv.slice(2), {
  alias: {port: 'p', 'hyperdrive': 'd', wait: 'w'},
  boolean: ['hyperdrive']
})

var hypercore = require('hypercore')
var hyperdrive = require('hyperdrive')
var ram = require('random-access-memory')

var key = argv._[0]
if (!key) {
  console.error(
    `Usage: node cli [--port=<port>] [--hyperdrive] \n` +
    `          [--wait=<seconds>] <key>\n`
  )
  process.exit(1)
}
*/

var telemetry = new events.EventEmitter()

// server.listen(argv.port || process.env.PORT || 10000)
var server = http.createServer(stats(sendTelemetry => {
  telemetry.on('telemetry', sendTelemetry)
}))
server.listen(process.env.PORT || 10000)
server.once('error', function () {
  server.listen(0)
})
server.on('listening', function () {
  console.log('Stats listening on port ' + server.address().port)

  var test = require('integration-tests/tests/dat/replicate-1gb')
  var attachPath = path.resolve(__dirname, 'attach')
  test(attachPath, event => { telemetry.emit('telemetry', event) })
})

