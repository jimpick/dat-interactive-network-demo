#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var http = require('http')

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
    var test = require('./mininet-daemon/replicate-150mb')
    var attachPath = path.resolve(__dirname, './mininet-daemon/attach')
    test(attachPath, event => { 
      res.write('data: ' + JSON.stringify(event) + '\n\n')
    })
  }
}

function file (name, type, res) {
  console.log('File', name)
  res.setHeader('Content-Type', type + '; charset=utf-8')
  fs.readFile(path.join(__dirname, name), function (err, buf) {
    console.log('Jim', err)
    if (err) return res.end()
    res.end(buf)
  })
}
