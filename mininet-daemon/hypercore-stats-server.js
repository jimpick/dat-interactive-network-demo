var events = require('events')
var util = require('util')
var Health = require('./hyperhealth')
var hyperdiscovery = require('hyperdiscovery')
var speedometer = require('speedometer')
var pump = require('pump')
var through2 = require('through2')
var prettyHash = require('pretty-hash')

module.exports = StatsServer

function StatsServer (feed, wait, emit) {
  if (!(this instanceof StatsServer)) return new StatsServer(feed, wait, emit)

  events.EventEmitter.call(this)
  self = this

  var archive = feed.metadata ? feed : null

  const streamIdToNameMap = {}

  if (archive) {
    feed = archive.metadata
  }

  var key = feed.key.toString('hex')

  send({type: 'key', key: key})

  feed.ready(function () {
    if (wait) setTimeout(join, Number(wait) * 1000)
    else join()

    if (archive) track(feed, 'metadata')
    else track(feed, null)
  })

  send({type: 'peer-update', peers: feed.peers.length})

  feed.on('peer-add', onpeeradd)
  feed.on('peer-remove', onpeerremove)

  if (archive) {
    if (archive.content) {
      track(archive.content, 'content')
    } else {
      archive.on('content', function () {
        track(archive.content, 'content')
      })
    }
  }

  /*
  res.on('close', function () {
    feed.removeListener('peer-add', onpeeradd)
    feed.removeListener('peer-remove', onpeerremove)
  })
  */

  function track (feed, name) {
    send({type: 'feed', name: name, key: key, blocks: bitfield(feed), bytes: feed.byteLength})

    feed.on('update', onupdate)
    // feed.on('append', onupdate)
    
    // Disable temporarily - should do dynamic tracing
    // feed.on('download', ondownload)
    // feed.on('upload', onupload)

    /*
    res.on('close', function () {
      feed.removeListener('update', onupdate)
      feed.removeListener('download', ondownload)
      feed.removeListener('upload', onupload)
    })
    */

    function onupdate () {
      send({type: 'update', name: name, key: key, blocks: bitfield(feed), bytes: feed.byteLength})
    }

    function ondownload (index, data) {
      send({type: 'download', name: name, index: index, bytes: data.length})
    }

    function onupload (index, data) {
      send({type: 'upload', name: name, index: index, bytes: data.length})
    }
  }

  function onpeeradd () {
    send({type: 'peer-update', peers: feed.peers.length})
  }

  function onpeerremove () {
    send({type: 'peer-update', peers: feed.peers.length})
  }

  function bitfield (feed) {
    var list = []
    for (var i = 0; i < feed.length; i++) {
      list.push(feed.has(i))
    }
    return list
  }

  function send (message) {
    // console.log('Jim send', message)
    emit('telemetry', message)
  }

  function join () {
    var target = archive ? archive : feed

    var peerSpeeds = {}
    const opts = {
      live: true,
      stream: () => {
        const stream = target.replicate()
        const hex = stream.id.toString('hex')
        if (!streamIdToNameMap[hex]) {
          streamIdToNameMap[hex] = target.id
          send({type: 'peerIdToHostMap', peerId: hex, host: target.id})
        }
        return stream
      },
      connect: function (local, remote) {
        function getRemoteId () {
          const remoteId = local.remoteId && local.remoteId.toString('hex')
          if (remoteId && !peerSpeeds[remoteId]) {
            peerSpeeds[remoteId] = {
              downloadSpeed: speedometer(),
              uploadSpeed: speedometer()
            }
          }
          return remoteId
        }
        pump(
          local,
          through2(function (chunk, enc, cb) {
            // console.log('Upload', prettyHash(local.id),
            //            prettyHash(local.remoteId), chunk.length)
            const remoteId = getRemoteId()
            if (remoteId) {
              peerSpeeds[remoteId].uploadSpeed(chunk.length)
            }
            this.push(chunk)
            cb()
          }),
          remote,
          through2(function (chunk, enc, cb) {
            // console.log('Download', prettyHash(local.id),
            //            prettyHash(local.remoteId), chunk.length)
            const remoteId = getRemoteId()
            if (remoteId) {
              peerSpeeds[remoteId].downloadSpeed(chunk.length)
            }
            this.push(chunk)
            cb()
          }),
          local
        )
      }
    }
    var sw = hyperdiscovery(target, opts)
    sw.on('connection', function (peer, info) {
      console.log('new connection', info.host, info.port,
                  info.initiator ? 'outgoing' : 'incoming')
      peer.on('close', function () {
        console.log('peer disconnected')
      })
    })
    self.on('close', () => {
      console.log('Closing statsServer swarm')
      sw.close()
    })
    var health = Health(target)
    setInterval(getHealth, 1000)
    function getHealth () {
      var data = health.get()
      if (!data) return
      if (data.peers) {
        data.peers.forEach(peer => {
          const remoteId = peer.remoteId
          if (remoteId && peerSpeeds[remoteId]) {
            peer.downloadSpeed = peerSpeeds[remoteId].downloadSpeed()
            peer.uploadSpeed = peerSpeeds[remoteId].uploadSpeed()
          }
        })
      }
      data.type = 'health'
      send(data)
    }
  }
}

StatsServer.prototype.close = function () {
  this.emit('close')
}

util.inherits(StatsServer, events.EventEmitter)
