#!/usr/bin/env node

var stats = require('./server.js')
var http = require('http')
var minimist = require('minimist')

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

var target = argv.hyperdrive ? hyperdrive(ram, key) : hypercore(ram, key)

var server = http.createServer(stats(target, argv.wait))

server.on('listening', function () {
  target.ready(function () {
    console.log('Feed/archive:', target.key.toString('hex'))
    console.log('Stats listening on port ' + server.address().port)
  })
})

server.listen(argv.port || process.env.PORT || 10000)
server.once('error', function () {
  server.listen(0)
})

