var Health = require('./hyperhealth')
var hyperdiscovery = require('hyperdiscovery')
var speedometer = require('speedometer')
var pump = require('pump')
var through2 = require('through2')
var prettyHash = require('pretty-hash')

module.exports = function (feed, wait, res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')

  var archive = feed.metadata ? feed : null

  if (archive) {
    feed = archive.metadata
  }

  var key = feed.key.toString('hex')

  send(res, {type: 'key', key: key})

  feed.ready(function () {
    if (wait) setTimeout(join, Number(wait) * 1000)
    else join()

    if (archive) track(feed, 'metadata')
    else track(feed, null)
  })

  send(res, {type: 'peer-update', peers: feed.peers.length})

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

  res.on('close', function () {
    feed.removeListener('peer-add', onpeeradd)
    feed.removeListener('peer-remove', onpeerremove)
  })

  function track (feed, name) {
    send(res, {type: 'feed', name: name, key: key, blocks: bitfield(feed), bytes: feed.byteLength})

    feed.on('update', onupdate)
    feed.on('append', onupdate)
    feed.on('download', ondownload)
    feed.on('upload', onupload)

    res.on('close', function () {
      feed.removeListener('update', onupdate)
      feed.removeListener('download', ondownload)
      feed.removeListener('upload', onupload)
    })

    function onupdate () {
      send(res, {type: 'update', name: name, key: key, blocks: bitfield(feed), bytes: feed.byteLength})
    }

    function ondownload (index, data) {
      send(res, {type: 'download', name: name, index: index, bytes: data.length})
    }

    function onupload (index, data) {
      send(res, {type: 'upload', name: name, index: index, bytes: data.length})
    }
  }

  function onpeeradd () {
    send(res, {type: 'peer-update', peers: feed.peers.length})
  }

  function onpeerremove () {
    send(res, {type: 'peer-update', peers: feed.peers.length})
  }

  function bitfield (feed) {
    var list = []
    for (var i = 0; i < feed.length; i++) {
      list.push(feed.has(i))
    }
    return list
  }

  function send (res, message) {
    res.write('data: ' + JSON.stringify(message) + '\n\n')
  }

  function join () {
    var target = archive ? archive : feed

    var peerSpeeds = {}
    const opts = {
      live: true,
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
      console.log('connected to', sw.connections.length, 'peers')
      peer.on('close', function () {
        console.log('peer disconnected')
      })
    })
    var health = Health(target)
    setInterval(getHealth, 1000)
    function getHealth () {
      var data = health.get()
      if (data.peers) {
        data.peers.forEach(peer => {
          const remoteId = peer.remoteId
          if (remoteId && peerSpeeds[remoteId]) {
            peer.downloadSpeed = peerSpeeds[remoteId].downloadSpeed()
            peer.uploadSpeed = peerSpeeds[remoteId].uploadSpeed()
          }
        })
      }
      // console.log('Jim', data)
      data.type = 'health'
      send(res, data)
    }
  }
}

