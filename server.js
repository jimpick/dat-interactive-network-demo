#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const http = require('http')
const {exec} = require('child_process')

const server = http.createServer(handler)
server.listen(process.env.PORT || 5000, '0.0.0.0')
server.once('error', function () {
  server.listen(0)
})
server.on('listening', function () {
  console.log('Stats listening on port ' + server.address().port)
})

let running = false
let addNode

function handler (req, res) {
  console.log('Jim req url', req.url)
  if (req.url === '/') return file('index.html', 'text/html', res)
  if (req.url === '/bundle.js') return file('bundle.js', 'text/javascript', res)
  const match1 = req.url.match(/\/events\/p2p-(\d+)/)
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
  }
  const match2 = req.url.match(/\/events\/multicast-(\d+)/)
  if (match2) {
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
  }
  if (req.url === '/addNode' && req.method === 'POST') {
    if (!addNode) return res.end('Not ready yet')
    addNode()
    res.end('Node added')
  }
  if (req.url === '/reset' && req.method === 'POST') {
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
  }
}

function file (name, type, res) {
  res.setHeader('Content-Type', type + '; charset=utf-8')
  fs.readFile(path.join(__dirname, name), function (err, buf) {
    if (err) return res.end()
    res.end(buf)
  })
}
