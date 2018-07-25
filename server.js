#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var http = require('http')
var runReplicate = require('./mininet-daemon/replicate-150mb')

var server = http.createServer(handler)
server.listen(process.env.PORT || 5000, '0.0.0.0')
server.once('error', function () {
  server.listen(0)
})
server.on('listening', function () {
  console.log('Stats listening on port ' + server.address().port)
})

function handler (req, res) {
  console.log('Jim req url', req.url)
  if (req.url === '/') return file('index.html', 'text/html', res)
  if (req.url === '/bundle.js') return file('bundle.js', 'text/javascript', res)
  if (req.url === '/events') {
    // event stream
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    runReplicate(sendTelemetry, finished)

    function sendTelemetry (event) {
      res.write('data: ' + JSON.stringify(event) + '\n\n')
    }

    function finished () {
      console.log('Finished')
      res.end('data: {"type": "close"}\n\n')
    }
  }
}

function file (name, type, res) {
  res.setHeader('Content-Type', type + '; charset=utf-8')
  fs.readFile(path.join(__dirname, name), function (err, buf) {
    if (err) return res.end()
    res.end(buf)
  })
}
