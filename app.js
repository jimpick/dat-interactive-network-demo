var Stats = require('./hypercore-stats-ui')
var ess = require('event-source-stream')
var Vizceral = require('@jimpick/vizceral-dat')
var speedometer = require('speedometer')
var prettyHash = require('pretty-hash')

var uploadSpeed = speedometer()
var downloadSpeed = speedometer()
var peers = []
var updateTime = null

var viz = new Vizceral.default(document.getElementById('vizceral'))

function updateViz () {
  var upload = uploadSpeed() / 3000
  var download = downloadSpeed() / 3000
  // console.log('Jim', upload, download)
  const nodes = [
    {
      name: 'peer0',
      nodes: [{}]
    }
  ]
  const connections = []
  const fresh = Date.now() - updateTime < 1500
  peers.forEach(peer => {
    const name = prettyHash(peer.remoteId)
    nodes.push({ name, nodes: [{}] })
    connections.push({
      source: 'peer0',
      target: name,
      metrics: { normal: fresh ? peer.uploadSpeed / 3000 : 0 },
      metadata: { streaming: true }
    })
    connections.push({
      source: name,
      target: 'peer0',
      metrics: { normal: fresh ? peer.downloadSpeed / 3000 : 0 },
      metadata: { streaming: true }
    })
  })
  
  viz.updateData({
    name: 'dat',
    renderer: 'global',
    layout: 'ring',
    // maxVolume: 500,
    nodes,
    connections
  })
}

window.addEventListener('load', () => {
  updateViz()
  viz.setView()
  viz.animate()
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

var stats = Stats(document.getElementById('hypercore-stats'))

const stream = ess(window.location.origin + '/events')
  .on('data', function (data) {
    data = JSON.parse(data)
    switch (data.type) {
      case 'close': stream.destroy()
      case 'key': return stats.onkey(data)
      case 'peer-update': return stats.onpeerupdate(data)
      case 'feed': return stats.onfeed(data)
      case 'update': return stats.onupdate(data)
      case 'download':
        downloadSpeed(data.bytes)
        return stats.ondownload(data)
      case 'upload':
        uploadSpeed(data.bytes)
        return stats.onupload(data)
      case 'health':
        peers = data.peers
        updateTime = Date.now()
        return
    }
  })
