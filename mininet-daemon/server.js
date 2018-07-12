var corsify = require('corsify')
var fs = require('fs')
var path = require('path')

var cors = corsify({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
  'Access-Control-Allow-Headers': 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Authorization'
})

module.exports = function (cb) {
  return cors(function (req, res) {
    if (req.url === '/') return file('index.html', 'text/html', res)
    if (req.url === '/bundle.js') return file('bundle.js', 'text/javascript', res)

    // event stream
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    function sendTelemetry (message) {
      // console.log('Jim sendTelemetry', message)
      res.write('data: ' + JSON.stringify(message) + '\n\n')
    }
    cb(sendTelemetry)
  })
}

function file (name, type, res) {
  res.setHeader('Content-Type', type + '; charset=utf-8')
  fs.readFile(path.join(__dirname, name), function (err, buf) {
    if (err) return res.end()
    res.end(buf)
  })
}
