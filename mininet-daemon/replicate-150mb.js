var test = require('tapenet')

// var {h1, h2} = test.topologies.basic() // 1mbit

module.exports = runTest

function runTest (attachPath, sendTelemetry) {
  console.log('Jim runTest')
  var {h1, h2} = test.topologies.basic(2, {bandwidth: 100}) // 100mbit

  test('share a dat between two nodes', function (t) {
    t.timeoutAfter(25000)
    setTimeout(() => {
      test.mininet.on('message', (name, data) => {
        // console.log('Jim mininet message', name, data)
        if (name === 'h1:emit' && data[0] === 'telemetry') {
          sendTelemetry(data[1])
        }
      })
    }, 0)
    const testFunc = function () {
      var Dat = require('dat-node')
      var tempy = require('tempy')

      var dir = tempy.directory()
      t.pass('h1 run')

      h2.on('sharing', ({key}) => {
        t.pass('h1 received sharing')
        Dat(dir, {key: key, temp: true}, function (err, dat) {
          if (err) throw err
          // dat.joinNetwork()

          /*
          var network = dat.joinNetwork(function (err) {
            t.error(err && err.toString(), 'h1 joinNetwork calls back okay')
          })
          network.once('connection', function () {
            t.pass('h1 got connection')
          })
          */

          t.pass('h1 downloading dat://' + key)

          var archive = dat.archive
          require(attachPath)(archive, 3, (message, args) => {
            // console.log('Jim send message', message, args)
            h1.emit(message, args)
          })
          if (archive.content) contentReady()
          archive.once('content', contentReady)

          function contentReady () {
            t.pass('h1 content ready')
            archive.content.on('sync', function () {
              t.pass('h1 dat synced')
              // TODO tests
              t.end()
            })
          }
        })
      })
    }
    const src = `;var attachPath = '${attachPath}';\n` +
      '(\n' +
      testFunc.toString() + '\n' +
      ')()'
    t.run(h1, src)

    t.run(h2, function () {
      var Dat = require('dat-node')
      var path = require('path')
      var fixture = path.join(__dirname, '../fixtures/dat2-150mb')
      t.pass('h2 run')
      Dat(fixture, {temp: true}, function (err, dat) {
        if (err) throw err
        dat.importFiles()

        var network = dat.joinNetwork(function (err) {
          t.error(err && err.toString(), 'h2 joinNetwork calls back okay')
        })
        network.once('connection', function () {
          t.pass('h2 got connection')
        })

        t.pass('h2 sharing dat://' + dat.key.toString('hex'))
        h2.emit('sharing', {key: dat.key.toString('hex')})
      })
    })
  })
}
