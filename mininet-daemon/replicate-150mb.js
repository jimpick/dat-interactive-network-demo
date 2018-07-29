const path = require('path')
const thunky = require('thunky')
const supervisor = require('./mnSupervisor')

module.exports = run

function runInSeries (fns, done) {
  loop(null)

  function loop (err) {
    if (fns.length === 0 || err) return done(err)
    fns.shift()(loop)
  }
}

function run (numNodes, sendTelemetry, finishedCallback) {
  console.log(`Starting replication, ${numNodes} nodes`)
  const nodes = supervisor.basicTopology(numNodes, {bandwidth: 100}) // 100mbit
  let finished = false
  var statsServerPath = path.resolve(__dirname, './hypercore-stats-server')

  supervisor.mininet.on('message', handleHostMessage)
  supervisor.on('message', handleSupervisorMessage)

  supervisor.start(startNode => {
    let key

    // Server: h1
    const {h1} = nodes
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

    const ready = thunky(waitForKey)

    function waitForKey (cb) {
      supervisor.mininet.on('message', watchForSharing)

      function watchForSharing (name, data) {
        const match = name.match(/h1:emit/)
        if (match && data[0] === 'sharing') {
          supervisor.mininet.removeListener('message', watchForSharing)
          console.log('Jim h1 message', data)
          key = data[1].key
          cb()
        }
      }
    }

    // Clients: h2, h3, h4, h5, ...
    let initialNodesStarted
    ready(() => {
      console.log('Ready')
      initialNodesStarted = thunky(startInitialNodes)
      initialNodesStarted(() => {
        console.log('All initial nodes started.')
      })

      function startInitialNodes (cb) {
        console.log('Starting initial nodes')
        const fns = Object.keys(nodes)
        .filter(name => (name[0] === 'h') && (name !== 'h1'))
        .map(name => {
          return cb => addNode(name, cb)
        })
        runInSeries(fns, cb)
      }
    })

    return function addOneMore () {
      ready(() => {
        initialNodesStarted(() => {
          const hNodes = Object.keys(nodes).filter(name => name[0] === 'h')
          const nextName = 'h' + hNodes.length + 1
          addNode(nextName, () => { console.log('Added', nextName) })
        })
      })
    }

		function addNode (name, cb) {
      console.log('Starting node', name, key)
      const funcTemplate = function () {
        var Dat = require('dat-node')
        var tempy = require('tempy')
        var statsServer = require(statsServerPath)

        var dir = tempy.directory()

        console.log('Jim key', key)
        Dat(dir, {key: key, temp: true}, function (err, dat) {
          if (err) throw err

          var archive = dat.archive
          archive.id = 'hreplace'
          statsServer(archive, 0.5, (message, args) => {
            hreplace.emit(message, args)
          })

          if (archive.content) contentReady()
          archive.once('content', contentReady)

          function contentReady () {
            supervisor.log('hreplace content ready')
            archive.content.on('sync', function () {
              supervisor.log('hreplace dat synced')
            })
          }
        })
      }
      const funcString = funcTemplate.toString().replace(/hreplace/g, name)
      const src =
        `;var statsServerPath = '${statsServerPath}';\n` +
        `;var key = '${key}';\n` +
        '(\n' + funcString + '\n' + ')()'
      startNode(nodes[name], src)
			setTimeout(cb, 100)
    }
  })

  function handleHostMessage (name, data) {
    const match = name.match(/(h\d+):emit/)
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
