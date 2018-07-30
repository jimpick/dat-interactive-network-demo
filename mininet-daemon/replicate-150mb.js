const path = require('path')
const thunky = require('thunky')
const supervisor = require('./mnSupervisor')

module.exports = run

const mininetOpts = {bandwidth: 100} // 100mbit
// const mininetOpts = {bandwidth: 10} // 10mbit

function runInSeries (fns, done) {
  loop(null)

  function loop (err) {
    if (fns.length === 0 || err) return done(err)
    fns.shift()(loop)
  }
}

function run (numNodes, sendTelemetry, finishedCallback) {
  console.log(`Starting replication, ${numNodes} nodes`)
  const nodes = supervisor.basicTopology(numNodes, mininetOpts)
  let finished = false
  var statsServerPath = path.resolve(__dirname, './hypercore-stats-server')

  supervisor.mininet.on('message', handleHostMessage)
  supervisor.on('message', handleSupervisorMessage)

  let ready
  let initialNodesStarted
  let addNode

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

    ready = thunky(waitForKey)

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

		addNode = function (name, cb) {
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

  return addOneMore // Return a function for adding nodes

  function addOneMore () {
    if (!ready) return // Doesn't work if clicking before first node is set up
    ready(() => {
      initialNodesStarted(() => {
        const h = supervisor.createHost()
        nodes.s1.link(h, mininetOpts)
        h.update((err, info) => {
          if (err) {
            console.error('Error creating host', err)
            return
          }
          console.log('Host info', h.id, info)
          const ip = '10.0.0.' + h.id.slice(1)
          h.setIP(ip, (err, data) => {
            if (err) {
              console.error('setIP error', err)
              return
            }
            const intf = info.intfNames[0]
            h.exec(`ifconfig ${intf}`, (err, data) => {
              if (err) {
                console.error('ifconfig2 error', err)
                return
              }
              console.log('Jim ifconfig2', data)
              nodes[h.id] = h
              nodes.s1.attach('s1-eth' + h.id.slice(1), err => {
                if (err) {
                  console.error('switch attach error', err)
                  return
                }
                h.exec(`ping -c 1 10.0.0.1`, (err, data) => {
                  if (err) {
                    console.error('ping error', err)
                    return
                  }
                  console.log('Jim ping', data)
                  addNode(h.id, () => { console.log('Added', h.id) })
                })
              })
            })
          })
        })
      })
    })
  }

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
    /*
    if (message.name === 'log' && message.args[0] === 'h2 dat synced') {
      setTimeout(() => {
        finished = true
        finishedCallback()
        supervisor.mininet.removeListener('message', handleHostMessage)
        supervisor.removeListener('message', handleSupervisorMessage)
      }, 8000)
    }
    */
  }
}
