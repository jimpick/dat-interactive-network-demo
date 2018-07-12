#!/usr/bin/env node

var path = require('path')
var http = require('http')
var minimist = require('minimist')
var events = require('events')
var corsify = require('corsify')

var cors = corsify({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
  'Access-Control-Allow-Headers': 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Authorization'
})

var telemetry = new events.EventEmitter()

var server = http.createServer(cors(statsRequest))
function statsRequest (req, res) {
  // event stream
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  telemetry.on('telemetry', message => {
    res.write('data: ' + JSON.stringify(message) + '\n\n')
  })
  // Stays open
}

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

