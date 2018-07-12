#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var http = require('http')

var server = http.createServer(handler)
server.listen(process.env.PORT || 5000)
server.once('error', function () {
  server.listen(0)
})
server.on('listening', function () {
  console.log('Stats listening on port ' + server.address().port)
})

function handler (req, res) {
  if (req.url === '/') return file('index.html', 'text/html', res)
  if (req.url === '/bundle.js') return file('bundle.js', 'text/javascript', res)
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
