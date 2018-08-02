var Stats = require('./hypercore-stats-ui')
var ess = require('event-source-stream')
var Vizceral = require('./vizceral-dat/vizceral')
var speedometer = require('speedometer')
var prettyHash = require('pretty-hash')

var uploadSpeed = speedometer()
var downloadSpeed = speedometer()
let peerSpeeds = {}
var peerIdToHostMap = {}
let layout = 'ring'

const startBtn = document.getElementById('startBtn')
const addNodeBtn = document.getElementById('addNodeBtn')
const statusEl = document.getElementById('status')
const resetBtn = document.getElementById('resetBtn')
const experimentSelEl = document.getElementById('experiment')

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

const nodes = []
const peers = {}
let scaleFactor = 3000

function ensureNode (name) {
  if (peers[name]) return
  const newNode = {
    name,
    nodes: [{}]
  }
  nodes.push(newNode)
  peers[name] = newNode
}

function updateViz () {
  // var upload = uploadSpeed() / scaleFactor
  // var download = downloadSpeed() / scaleFactor
  // console.log('Jim', upload, download)
  const connections = []
  const now = Date.now()
  Object.keys(peerSpeeds).forEach(key => {
    const match = key.match(/(h\d+|m)-(h\d+|m)/)
    if (match) {
      const observerPeer = match[1]
      const remotePeer = match[2]
      ensureNode(observerPeer)
      ensureNode(remotePeer)
      if (remotePeer === observerPeer) return
      // FIXME: These will get doubled up when observed from both ends
      if (remotePeer === 'm') {
        let {speed, timestamp} = peerSpeeds[key]
        if (!timestamp || timestamp < now - 1500) speed = 0
        connections.push({
          source: observerPeer,
          target: remotePeer,
          metrics: {multicastSend: speed},
          metadata: {streaming: true}
        })
      } else if (observerPeer === 'm') {
        let {speed, timestamp} = peerSpeeds[key]
        if (!timestamp || timestamp < now - 1500) speed = 0
        connections.push({
          source: observerPeer,
          target: remotePeer,
          metrics: {multicastReceive: speed},
          metadata: {streaming: true}
        })
      } else {
        let {uploadSpeed, downloadSpeed, timestamp} = peerSpeeds[key]
        if (!timestamp || timestamp < now - 1500) {
          uploadSpeed = 0
          downloadSpeed = 0
        }
        // console.log('Jim peerSpeeds', key, peerSpeeds[key])
        connections.push({
          source: observerPeer,
          target: remotePeer,
          metrics: {normal: uploadSpeed / scaleFactor},
          metadata: {streaming: true}
        })
        connections.push({
          source: remotePeer,
          target: observerPeer,
          metrics: {normal: downloadSpeed / scaleFactor},
          metadata: {streaming: true}
        })
      }
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
    // layout: 'ringCenter',
    //layout: 'ring',
    layout: layout,
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
   showLabels: true
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
  startBtn.disabled = false
})

setInterval(updateViz, 1000)

// var stats = Stats(document.getElementById('hypercore-stats'))

startBtn.addEventListener('click', () => {
  const experiment = experimentSelEl.value
  console.log('Running', experiment)
  statusEl.innerText = 'Running'
  startBtn.disabled = true
  addNodeBtn.disabled = false
  resetBtn.disabled = true
  scaleFactor = 3000
  const match = experiment.match(/.*-(\d+)/)
  if (!match) throw new Error('No match!')
  const numNodes = match[1]
  if (experiment.match(/multicast/)) {
    layout = 'ringMulticast'
    ensureNode('m')
  }
  for (let i = 2; i <= numNodes; i++) {
    peerSpeeds[`h${i}-h1`] = {
      uploadSpeed: 0,
      downloadSpeed: 0
    }
  }
  if (experiment.match(/multicast/)) {
    scaleFactor = 0.3
    peerSpeeds[`m-h1`] = {
      uploadSpeed: 0,
      downloadSpeed: 0
    }
  }

  // const stream = ess(window.location.origin + '/events/p2p-5')
  const stream = ess('/events/' + experiment)
  stream.on('data', function (data) {
    data = JSON.parse(data)
    switch (data.type) {
      case 'close':
        console.log('Finished')
        statusEl.innerText = 'Finished'
        startBtn.disabled = false
        resetBtn.disabled = false
        addNodeBtn.disabled = true
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
            length,
            timestamp: Date.now()
          }
        })
        return
      case 'multicast-send':
        {
          const {host, speed} = data
          peerSpeeds[`${host}-m`] = {
            speed,
            timestamp: Date.now()
          }
        }
        return
      case 'multicast-receive':
        {
          const {host, speed} = data
          peerSpeeds[`m-${host}`] = {
            speed,
            timestamp: Date.now()
          }
        }
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

addNodeBtn.addEventListener('click', () => {
  console.log('Adding...')
  statusEl.innerText = 'Adding...'
  const hNodes = nodes.filter(({name}) => name[0] === 'h')
  // console.log('Jim hNodes', hNodes.length)
  peerSpeeds[`h${hNodes.length + 1}-h1`] = {
    uploadSpeed: 0,
    downloadSpeed: 0
  }
  updateViz()

  fetch('/addNode', {method: 'POST'})
  .then(response => response.text())
  .then(text => {
    statusEl.innerText = text
  })
})

resetBtn.addEventListener('click', () => {
  console.log('Resetting')
  startBtn.disabled = true
  resetBtn.disabled = true
  addNodeBtn.disabled = true
  statusEl.innerText = 'Resetting'
  fetch('/reset', {method: 'POST'})
  .then(response => response.text())
  .then(text => {
    document.body.innerText = text
    // alert(text)
    setTimeout(() => location.reload(), 3000)
  })
})
