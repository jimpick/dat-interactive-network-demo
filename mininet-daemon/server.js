#!/usr/bin/env node

var path = require('path')
var http = require('http')
var minimist = require('minimist')
var corsify = require('corsify')

var cors = corsify({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
  'Access-Control-Allow-Headers': 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Authorization'
})

var server = http.createServer(cors(statsRequest))
function statsRequest (req, res) {
  // event stream
  console.log('New request', req.url)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  // Stays open
  var test = require('./replicate-150mb')
  var attachPath = path.resolve(__dirname, 'attach')
  test(attachPath, event => {
    res.write('data: ' + JSON.stringify(event) + '\n\n')
    process.stdout.write('.')
  })
}

server.listen(process.env.PORT || 10000)
server.once('error', function () {
  server.listen(0)
})
server.on('listening', function () {
  console.log('Stats listening on port ' + server.address().port)
})

