const path = require('path')
const supervisor = require('./mnSupervisor')

module.exports = run

var {h1, h2} = supervisor.basicTopology(2, {bandwidth: 100}) // 100mbit

function run (sendTelemetry, finishedCallback) {
  console.log('Starting replication')
  let finished = false
  var attachPath = path.resolve(__dirname, './attach')

  supervisor.mininet.on('message', handleHostMessage)
  supervisor.on('message', handleSupervisorMessage)

  supervisor.start(startNode => {
    // setTimeout(() => {
    // }, 0)
    const testFunc = function () {
      var Dat = require('dat-node')
      var tempy = require('tempy')
      var statsServer = require(attachPath)

      var dir = tempy.directory()

      h2.on('sharing', ({key}) => {
        Dat(dir, {key: key, temp: true}, function (err, dat) {
          if (err) throw err

          var archive = dat.archive
          statsServer(archive, 0.5, (message, args) => {
            h1.emit(message, args)
          })

          if (archive.content) contentReady()
          archive.once('content', contentReady)

          function contentReady () {
            supervisor.log('h1 content ready')
            archive.content.on('sync', function () {
              supervisor.log('h1 dat synced')
            })
          }
        })
      })
    }
    const src = `;var attachPath = '${attachPath}';\n` +
      '(\n' +
      testFunc.toString() + '\n' +
      ')()'
    startNode(h1, src)

    startNode(h2, function () {
      var Dat = require('dat-node')
      var path = require('path')
      var fixture = path.join(__dirname, '../fixtures/dat2-150mb')
      Dat(fixture, {temp: true}, function (err, dat) {
        if (err) throw err
        dat.importFiles()

        var network = dat.joinNetwork()

        h2.emit('sharing', {key: dat.key.toString('hex')})
      })
    })
  })

  function handleHostMessage (name, data) {
    if (name === 'h1:emit' && data[0] === 'telemetry') {
      if (finished) return
      sendTelemetry(data[1])
    }
  }

  function handleSupervisorMessage (message) {
    console.log('Supervisor message', message)
    if (message.name === 'log' && message.args[0] === 'h1 dat synced') {
      setTimeout(() => {
        finished = true
        finishedCallback()
        supervisor.mininet.removeListener('message', handleHostMessage)
        supervisor.removeListener('message', handleSupervisorMessage)
      }, 8000)
    }
  }
}
