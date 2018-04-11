var Stats = require('./hypercore-stats-ui')
var ess = require('event-source-stream')
var Vizceral = require('vizceral')
var speedometer = require('speedometer')

var uploadSpeed = speedometer()
var downloadSpeed = speedometer()

var viz = new Vizceral.default(document.getElementById('vizceral'))

function updateViz () {
  var upload = uploadSpeed() / 3000
  var download = downloadSpeed() / 3000
  console.log('Jim', upload, download)
  viz.updateData({
    name: 'dat',
    renderer: 'global',
    layout: 'ring',
    // maxVolume: 500,
    nodes: [
      {
        name: 'peer1',
        nodes: [{}]
      },
      {
        name: 'peer2',
        nodes: [{}]
      }
    ],
    connections: [
      {
        source: 'peer1',
        target: 'peer2',
        metrics: { normal: upload },
        metadata: { streaming: true }
      },
      {
        source: 'peer2',
        target: 'peer1',
        metrics: { normal: download },
        metadata: { streaming: true }
      }
    ]
  })
}

window.addEventListener('load', () => {
  updateViz()
  viz.setView()
  viz.animate()
})

setInterval(updateViz, 1000)

var stats = Stats(document.getElementById('hypercore-stats'))

ess('http://' + window.location.host + '/events')
  .on('data', function (data) {
    data = JSON.parse(data)
    switch (data.type) {
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
    }
  })
