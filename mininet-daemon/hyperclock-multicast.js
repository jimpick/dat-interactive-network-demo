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
      const hyperclock = require('hyperclock')
      const ram = require('random-access-memory')
      const swarmDefaults = require('dat-swarm-defaults')
      const discSwarm = require('discovery-swarm')
      const mswarm = require('hypercore-multicast-swarm')

      // const clock = hyperclock(ram, {interval: 500})
      const clock = hyperclock(ram, {interval: 2000})

      clock.ready(() => {
        h1.emit('sharing', {key: clock.key.toString('hex')})

        const sw = discSwarm(swarmDefaults({
					tcp: true,
					utp: false,
					dht: false,
					live: true,
					hash: false,
					dns: {
						server: null, domain: 'dat.local'
					},
          stream: () => clock.replicate({
            live: true,
            upload: true,
            download: true
          })
        }))
        sw.join(clock.discoveryKey)

        sw.on('connection', function (peer, info) {
          console.log('new connection', info.host, info.port,
                      info.initiator ? 'outgoing' : 'incoming')
          peer.on('close', function () {
            console.log('peer disconnected')
          })
        })

        const msw = mswarm(clock, {
          mtu: 900,
          port: 5007,
          address: '239.0.0.1'
        })

        clock.on('append', () => msw.multicast(clock.length - 1))
      })
    })
    const h1AddRouteMulticast = 
      `route add -net 224.0.0.0 netmask 240.0.0.0 dev h1-eth0`
    h1.exec(h1AddRouteMulticast, console.error)

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
        const hyperclock = require('hyperclock')
        const ram = require('random-access-memory')
        const swarmDefaults = require('dat-swarm-defaults')
        const discSwarm = require('discovery-swarm')
        const mswarm = require('hypercore-multicast-swarm')
				const crypto = require('hypercore-crypto')
        const statsServer = require(statsServerPath)

        console.log('Key:', key)
				const clock = hyperclock(ram, key, {sparse: true, allowPush: true})

				// Display clock
				clock.ready(() => {
					console.log('Key:', clock.key.toString('hex'))
					console.log('Discovery Key:', clock.discoveryKey.toString('hex'))

				  let mode = 'Bootstrapping (TCP)'

          // statsServer connects to the swarm for us
          const sw = statsServer(clock, 0.5, (message, args) => {
            hreplace.emit(message, args)
          })

          /*
					let streamCount = 0
          const sw = discSwarm(swarmDefaults({
						tcp: true,
						utp: false,
						dht: false,
						live: true,
						hash: false,
						dns: {
							server: null, domain: 'dat.local'
						},
            stream: info => {
							const stream = clock.replicate({
								live: true,
								upload: true,
								download: true
							})
							const streamNumber = ++streamCount
							console.log('New swarm stream', streamNumber, info)
							stream.on('close', () => {
								console.log('Closed stream', streamNumber)
							})
							return stream
						}
          }))

          const discoveryKey = crypto.discoveryKey(key)
          sw.join(discoveryKey)

					console.log('Jim1')
          sw.on('connection', function (peer, info) {
						console.log('Jim2')
            console.log('new connection', info.host, info.port,
                        info.initiator ? 'outgoing' : 'incoming')
            peer.on('close', function () {
              console.log('peer disconnected')
            })
          })
					*/

					// UDP Multicast
					const msw = mswarm(clock, {
						mtu: 900,
						port: 5007,
						address: '239.0.0.1'
					})

          setTimeout(() => {
            console.log('Closing TCP swarm')
            sw.close()
            mode = 'Multicast only'
          }, 4500)

					clock.update(() => {
						console.log('Length', clock.length)

						clock.createReadStream({live: true, tail: true}).on('data', data => {
							console.log(`${mode}: ${data.time}`)
						})
					})
				})
			}
      const funcString = funcTemplate.toString().replace(/hreplace/g, name)
      const src =
        `;var statsServerPath = '${statsServerPath}';\n` +
        `;var key = '${key}';\n` +
        '(\n' + funcString + '\n' + ')()'
      const host = nodes[name]
      startNode(host, src)
      const addRouteMulticast = 
        `route add -net 224.0.0.0 netmask 240.0.0.0 dev ${name}-eth0`
      host.exec(addRouteMulticast, err => {
        if (err) console.error('Multicast route error', name, err)
			  setTimeout(cb, 100)
      })
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
                console.error('ifconfig error', err)
                return
              }
              console.log('Jim ifconfig', data)
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
