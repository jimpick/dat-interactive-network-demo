const path = require('path')
const thunky = require('thunky')
const supervisor = require('../mnSupervisor')

module.exports = run

const mininetOpts = {bandwidth: 1} // 1mbit

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
  // var statsServerPath = path.resolve(__dirname, './hypercore-stats-server')

  supervisor.mininet.on('message', handleHostMessage)
  supervisor.on('message', handleSupervisorMessage)

  let ready
  let initialNodesStarted

  supervisor.start(startNode => {
    let key

    // Server: h1
    const {h1} = nodes
    startNode(h1, function () {
      const listen = require('./mininet-daemon/libp2p-echo/listener2')

      listen(message => {
        console.log('Message', message)
      })
    })

    // Clients: h2, h3, h4, h5, ...
    initialNodesStarted = thunky(startInitialNodes)
    initialNodesStarted(() => {
      console.log('All initial nodes started.')
    })

    function startInitialNodes (cb) {
      console.log('Starting initial nodes')
      setTimeout(() => {
        const fns = Object.keys(nodes)
        .filter(name => (name[0] === 'h') && (name !== 'h1'))
        .map(name => {
          return cb => addNode(name, cb)
        })
        runInSeries(fns, cb)
      }, 6000)
    }

		function addNode (name, cb) {
      console.log('Starting node', name, key)
      const funcTemplate = function () {
        const dial = require('./mininet-daemon/libp2p-echo/dialer2')

        dial(message => {
          console.log('Message', message)
          // hreplace.emit(message, args)
        })
      }
      const funcString = funcTemplate.toString().replace(/hreplace/g, name)
      const src =
        //`;var statsServerPath = '${statsServerPath}';\n` +
        // `;var key = '${key}';\n` +
        '(\n' + funcString + '\n' + ')()'
      startNode(nodes[name], src)
			setTimeout(cb, 100)
    }
  })

  return addOneMore // Return a function for adding nodes

  function addOneMore () {
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
