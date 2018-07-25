var mn = require('mininet')({stdio: 'inherit', prefixStdio: true, defer: true})
var path = require('path')

var pending = []
var parentFilename = (module.parent && module.parent.filename) || '.'
var parentDirname = path.dirname(parentFilename)

delete require.cache[__filename]

const supervisor = {}

supervisor.mininet = mn
supervisor.hosts = mn.hosts
supervisor.switches = mn.switches
supervisor.basicTopology = require('./basicTopology')(mn)

supervisor.createSwitch = function () {
  return mn.createSwitch()
}

supervisor.createHost = function () {
  return mn.createHost()
}

supervisor.createController = function () {
  return mn.createController()
}

supervisor.start = function (fn) {
  if (!mn.started) {
    var old = global.__mininet__

    if (old && old.started && !old.stopped) {
      old.on('stop', start)
      old.stop()
    } else {
      start()
    }
  } else {
    ready()
  }

  function start () {
    global.__mininet__ = mn
    mn.on('start', ready)
    mn.start()
  }

  function ready () {
    var missing = pending.length
    if (!missing) return fn(startHost)

    pending.forEach(function (proc) {
      if (proc.killed) return process.nextTick(onclose)
      proc.on('close', onclose)
      proc.kill('SIGINT')

      function onclose () {
        if (!--missing) {
          pending = []
          fn(startHost)
        }
      }
    })
  }

  function startHost (host, src) {
    var hostFilename = require.resolve('mininet/host')

    if (typeof src === 'function') src = ';(' + src.toString() + ')()'

    var proc = host.spawnNode(`
      var EventEmitter = require('events').EventEmitter
      var host = require('${hostFilename}')
      var target = {}
      var ip = '${host.ip}'
      var mac = '${host.mac}'
      var __dirname = '${parentDirname}'
      var __filename = '${parentFilename}'

      global.supervisor = new Proxy({}, {
        get: function (target, name) {
          return function (...args) {
            host.send('supervisor', {name, args})
          }
        }
      })

      var handler =  
      vm.runInNewContext(
        ${JSON.stringify(src)},
        new Proxy(target, {
          get: function (target, name) {
            if (global.hasOwnProperty(name)) return global[name]
            if (target.hasOwnProperty(name)) return target[name]
            if (name !== 'tapenet' && !/^h\\d+$/.test(name)) return
            var e = target[name] = createEmitter(name)
            return e
          }
        }),
        {filename: '[${host.id}-test]'}
      )

      function createEmitter (id) {
        var e = new EventEmitter()
        e.id = id
        e.emit = function (...args) {
          EventEmitter.prototype.emit.apply(this, arguments)
          host.broadcast(id + ':emit', args)
          return true
        }
        host.on('message:' + id + ':emit', function (args) {
          EventEmitter.prototype.emit.apply(e, args)
        })
        return e
      }
    `)

    proc.on('message:supervisor', function (data) {
      console.log('Jim message:supervisor', data)
      // t[data.name].apply(t, data.args)
    })

    pending.push(proc)

    return proc
  }
}

module.exports = supervisor

