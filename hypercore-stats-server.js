module.exports = function (feed, res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')

  var archive = feed.metadata ? feed : null

  if (archive) {
    feed = archive.metadata
  }

  var key = feed.key.toString('hex')

  send(res, {type: 'key', key: key})

  feed.ready(function () {
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
}
