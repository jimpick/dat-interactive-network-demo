#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const http = require('http')
const {exec} = require('child_process')
const etag = require('etag')
const budo = require('budo')

const server = http.createServer(handler)
server.listen(process.env.PORT || 5000, '0.0.0.0')
server.once('error', function () {
  server.listen(0)
})
server.on('listening', function () {
  console.log('Stats listening on port ' + server.address().port)
})

function handler(req, res) {
  middleware(req, res, next)

  function next() {
    if (req.url === '/') return file('index.html', 'text/html', res)
    if (req.url === '/noun_Antenna_31128.svg') return file('noun_Antenna_31128.svg', 'image/svg+xml', res)
    if (req.url === '/bundle.js') return file('bundle.js', 'text/javascript', res)
    return res.end()
  }
}

/*
budo('./app.js', {
  live: true,
  stream: process.stdout,
  port: 5000,
  middleware,
  browserify: {
    debug: true,
    transform: [
      'brfs-babel',
      ['babelify', {presets: ['env']}]
    ]
  }
}).on('connect', event => {
  const {server} = event
  console.log('Listening on port ' + server.address().port)
})
*/

let running = false
let addNode

function middleware (req, res, next) {
  console.log('Jim req url', req.url)
  const match1 = req.url.match(/\/events\/p2p-(\d+)/)
  const match2 = req.url.match(/\/events\/multicast-(\d+)/)
  if (match1) {
    const numNodes = match1[1]
    const runReplicate = require('./mininet-daemon/replicate-150mb')
    if (running) return
    running = true
    // event stream
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    addNode = runReplicate(numNodes, sendTelemetry, finished)

    function sendTelemetry (event) {
      res.write('data: ' + JSON.stringify(event) + '\n\n')
    }

    function finished () {
      console.log('Finished')
      res.end('data: {"type": "close"}\n\n')
      running = false
    }
  } else if (match2) {
    const numNodes = match2[1]
    const runReplicate = require('./mininet-daemon/hyperclock-multicast')
    if (running) return
    running = true
    // event stream
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    addNode = runReplicate(numNodes, sendTelemetry, finished)

    function sendTelemetry (event) {
      res.write('data: ' + JSON.stringify(event) + '\n\n')
    }

    function finished () {
      console.log('Finished')
      res.end('data: {"type": "close"}\n\n')
      running = false
    }
  } else if (req.url === '/addNode' && req.method === 'POST') {
    if (!addNode) return res.end('Not ready yet')
    addNode()
    res.end('Node added')
  } else if (req.url === '/reset' && req.method === 'POST') {
    exec('sudo mn -c', (err, stdout, stderr) => {
      if (err) {
        console.error('Reset Error', err)
        res.end('Error')
        return
      }
      console.log(stdout + stderr)
      res.end(stdout + stderr)
      console.log('Restarting server...\n')
      setTimeout(() => process.exit(0), 2000)
    })
  } else {
    next()
  }
}

function file (name, type, res) {
  res.setHeader('Content-Type', type + '; charset=utf-8')

  fs.readFile(path.join(__dirname, name), function (err, buf) {
    if (err) return res.end()
    res.setHeader('Cache-Control', 'max-age=3600, must-revalidate')
    res.setHeader('ETag', etag(buf))
    res.end(buf)
  })
}
