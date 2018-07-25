const path = require('path')
const supervisor = require('./mnSupervisor')

module.exports = run

var {h1, h2, h3} = supervisor.basicTopology(3, {bandwidth: 100}) // 100mbit

function run (sendTelemetry, finishedCallback) {
  console.log('Starting replication')
  let finished = false
  var statsServerPath = path.resolve(__dirname, './hypercore-stats-server')

  supervisor.mininet.on('message', handleHostMessage)
  supervisor.on('message', handleSupervisorMessage)

  supervisor.start(startNode => {
    // Clients: h2, h3
    ['h2', 'h3'].forEach(name => {
      const funcTemplate = function () {
        var Dat = require('dat-node')
        var tempy = require('tempy')
        var statsServer = require(statsServerPath)

        var dir = tempy.directory()

        h1.on('sharing', ({key}) => {
          Dat(dir, {key: key, temp: true}, function (err, dat) {
            if (err) throw err

            var archive = dat.archive
            statsServer(archive, 0.5, (message, args) => {
              h2.emit(message, args)
            })

            if (archive.content) contentReady()
            archive.once('content', contentReady)

            function contentReady () {
              supervisor.log('h2 content ready')
              archive.content.on('sync', function () {
                supervisor.log('h2 dat synced')
              })
            }
          })
        })
      }
      const funcString = funcTemplate.toString().replace('h2', name)
      const src = `;var statsServerPath = '${statsServerPath}';\n` +
        '(\n' + funcString + '\n' + ')()'
      startNode(eval(name), src)
    })

    // Server: h1
    startNode(h1, function () {
      var Dat = require('dat-node')
      var path = require('path')
      var fixture = path.join(__dirname, '../fixtures/dat2-150mb')
      Dat(fixture, {temp: true}, function (err, dat) {
        if (err) throw err
        dat.importFiles()

        var network = dat.joinNetwork()

        h1.emit('sharing', {key: dat.key.toString('hex')})
      })
    })
  })

  function handleHostMessage (name, data) {
    const match = name.match(/(h[\d+]):emit/)
    if (match && data[0] === 'telemetry') {
      if (finished) return
      const message = {
        host: match[1],
        ...data[1]
      }
      sendTelemetry(message)
    }
  }

  function handleSupervisorMessage (message) {
    console.log('Supervisor message', message)
    if (message.name === 'log' && message.args[0] === 'h2 dat synced') {
      setTimeout(() => {
        finished = true
        finishedCallback()
        supervisor.mininet.removeListener('message', handleHostMessage)
        supervisor.removeListener('message', handleSupervisorMessage)
      }, 8000)
    }
  }
}
