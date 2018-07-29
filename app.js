var Stats = require('./hypercore-stats-ui')
var ess = require('event-source-stream')
var Vizceral = require('@jimpick/vizceral-dat')
var speedometer = require('speedometer')
var prettyHash = require('pretty-hash')

var uploadSpeed = speedometer()
var downloadSpeed = speedometer()
let peerSpeeds = {}
var peerIdToHostMap = {}
var updateTime = null

var viz = new Vizceral.default(document.getElementById('vizceral'))
viz.updateDefinitions({
	detailedNode: {
		volume: {
			default: {
				top: { header: 'Jim RPS', data: 'data.volumePercent', format: '0.0%' },
				bottom: { header: 'ERROR RATE', data: 'data.classPercents.danger', format: '0.00%' },
				donut: {
					data: 'data.globalClassPercents',
					indices: [
						{ key: 'danger' },
						{ key: 'warning' },
						{ key: 'normal', class: 'normalDonut' }
					]
				},
				arc: {}
			},
			labeled: {
				top: { header: 'RPS', data: 'data.volume', format: '0,0' },
				donut: {
					data: 'data.classPercents'
				}
			},
			entry: {
				top: { header: 'TOTAL RPS', data: 'data.volume', format: '0,0' }
			}
		}
	}
})

function updateViz () {
  var upload = uploadSpeed() / 3000
  var download = downloadSpeed() / 3000
  // console.log('Jim', upload, download)
  const nodes = [
    {
      name: 'h1',
      nodes: [{}]
    }
  ]
  const peers = {
    'h1': nodes[0]
  }
  const connections = []
  const fresh = Date.now() - updateTime < 1500
  Object.keys(peerSpeeds).forEach(key => {
    const match = key.match(/(h\d+)-(h\d+)/)
    if (match) {
      const observerPeer = match[1]
      const remotePeer = match[2]
      ensureNode(observerPeer)
      ensureNode(remotePeer)
      if (remotePeer === observerPeer) return
      // FIXME: These will get doubled up when observed from both ends
      const {uploadSpeed, downloadSpeed} = peerSpeeds[key]
      // console.log('Jim peerSpeeds', key, peerSpeeds[key])
      connections.push({
        source: observerPeer,
        target: remotePeer,
        metrics: { normal: fresh ? uploadSpeed / 3000 : 0 },
        metadata: { streaming: true }
      })
      connections.push({
        source: remotePeer,
        target: observerPeer,
        metrics: { normal: fresh ? downloadSpeed / 3000 : 0 },
        metadata: { streaming: true }
      })
    }

    function ensureNode (name) {
      if (peers[name]) return
      const newNode = {
        name,
        nodes: [{}]
      }
      nodes.push(newNode)
      peers[name] = newNode
    }
  })

  /*
  console.log('Jim speeds:')
  connections.forEach(({source, target, metrics: {normal}}) => {
    console.log('  ', source, target, normal) 
  })
  */
  viz.updateData({
    name: 'dat',
    // renderer: 'global',
    renderer: 'swarm',
    layout: 'ring',
    // maxVolume: 10,
    nodes,
    connections
  })
}

window.addEventListener('load', () => {
  updateViz()
  viz.setView()
  viz.animate()
  viz.setOptions({
   allowDraggingOfNodes: true,
   // showLabels: false
  })
  /*
  viz.currentGraph.setPhysicsOptions({
    isEnabled: true,
    jaspersReplusionBetweenParticles: true,
    viscousDragCoefficient: 0.1,
    hooksSprings: {
      restLength: 400,
      springConstant: 0.2,
      dampingConstant: 0.1
    },
    particles: {
      mass: 0.5
    }
  })
  */
})

setInterval(updateViz, 1000)

// var stats = Stats(document.getElementById('hypercore-stats'))

const startBtn = document.getElementById('startBtn')
startBtn.addEventListener('click', () => {
  console.log('Running')
  const stream = ess(window.location.origin + '/events')
  stream.on('data', function (data) {
    data = JSON.parse(data)
    switch (data.type) {
      case 'close':
        console.log('Finished')
        return stream.destroy()
      // case 'key': return stats.onkey(data)
      // case 'peer-update': return stats.onpeerupdate(data)
      // case 'feed': return stats.onfeed(data)
      // case 'update': return stats.onupdate(data)
      case 'download':
        // downloadSpeed(data.bytes)
        // stats.ondownload(data)
        return
      case 'upload':
        // uploadSpeed(data.bytes)
        // stats.onupload(data)
        return
      case 'health':
        // console.log('Jim', data)
        // peers = data.peers
        const {host, peers} = data
        const observerPeer = host
        peers.forEach(report => {
          const {remoteId, uploadSpeed, downloadSpeed, have, length} = report
          let remotePeer = peerIdToHostMap[remoteId] ?
              peerIdToHostMap[remoteId] : 'h1' // FIXME: Temporary
          peerSpeeds[`${observerPeer}-${remotePeer}`] = {
            remoteId,
            uploadSpeed,
            downloadSpeed,
            have,
            length
          }
        })
        updateTime = Date.now()
        return
      case 'peerIdToHostMap':
        {
          // console.log('Jim', data)
          const {peerId, host} = data
          peerIdToHostMap[peerId] = host
        }
        return
    }
  })
})
