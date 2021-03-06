const Signal = require('signals')
const mat4 = require('pex-math/mat4')
const vec3 = require('pex-math/vec3')
const quat = require('pex-math/quat')
const ray = require('pex-geom/ray')
const interpolateAngle = require('interpolate-angle')
const clamp = require('pex-math/utils').clamp
const lerp = require('pex-math/utils').lerp
const toRadians = require('pex-math/utils').toRadians
const toDegrees = require('pex-math/utils').toDegrees
const latLonToXyz = require('latlon-to-xyz')
const xyzToLatLon = require('xyz-to-latlon')
const eventOffset = require('mouse-event-offset')

function Orbiter(opts) {
  this.type = 'Orbiter'
  this.enabled = true
  this.changed = new Signal()
  this.entity = null
  this.dirty = false

  const initialState = {
    target: [0, 0, 0],
    position: [0, 0, 5],
    matrix: mat4.create(),
    invViewMatrix: mat4.create(),
    dragging: false,
    lat: 0, // Y
    lon: 0, // XZ
    currentLat: 0,
    currentLon: 0,
    easing: 0.1,
    element: opts.element || document,
    width: 0,
    height: 0,
    clickPosWindow: [0, 0],
    dragPos: [0, 0, 0],
    dragPosWindow: [0, 0],
    distance: 1,
    currentDistance: 1,
    minDistance: 0.1,
    maxDistance: 10,
    minLat: -89.5,
    maxLat: 89.5,
    minLon: -Infinity,
    maxLon: Infinity,
    zoomSlowdown: 400,
    zoom: true,
    pan: true,
    drag: true,
    dragSlowdown: 4,
    clickTarget: [0, 0, 0],
    clickPosPlane: [0, 0, 0],
    dragPosPlane: [0, 0, 0],
    clickPosWorld: [0, 0, 0],
    dragPosWorld: [0, 0, 0],
    panPlane: null,
    autoUpdate: true
  }

  this.set(initialState)
  this.set(opts)
}

Orbiter.prototype.init = function(entity) {
  this.entity = entity
  this.setup()
}

Orbiter.prototype.set = function(opts) {
  Object.assign(this, opts)
  if (opts.target || opts.position) {
    const distance = vec3.distance(this.position, this.target)
    const latLon = xyzToLatLon(
      vec3.normalize(vec3.sub(vec3.copy(this.position), this.target))
    )
    this.lat = latLon[0]
    this.lon = latLon[1]
    this.currentLat = this.lat
    this.currentLon = this.lon
    this.distance = distance
    this.currentDistance = this.distance
    this.minDistance = opts.minDistance || distance / 10
    this.maxDistance = opts.maxDistance || distance * 10
    this.minLat = opts.minLat || -89.5
    this.maxLat = opts.maxLat || 89.5
    this.minLon = opts.minLon || -Infinity
    this.maxLon = opts.maxLon || Infinity
  }
  Object.keys(opts).forEach((prop) => this.changed.dispatch(prop))
}

Orbiter.prototype.update = function() {
  const camera = this.entity.getComponent('Camera')
  this.updateMatrix()
  const transformCmp = this.entity.transform
  const transformRotation = transformCmp.rotation
  quat.fromMat4(transformRotation, this.matrix)

  if (camera) {
    transformCmp.set({
      position: this.position,
      rotation: transformRotation
    })
    if (camera.projection === 'orthographic') {
      camera.set({ zoom: this.distance })
    }
  } else {
    transformCmp.set({
      rotation: transformRotation
    })
  }
}

Orbiter.prototype.updateWindowSize = function() {
  const width = this.element.clientWidth || this.element.innerWidth
  const height = this.element.clientHeight || this.element.innerHeight
  if (width !== this.width) {
    this.width = width
    this.height = height
  }
}

Orbiter.prototype.updateMatrix = function() {
  const camera = this.entity.getComponent('Camera')
  const position = this.position
  const target = this.target

  this.lat = clamp(this.lat, this.minLat, this.maxLat)
  this.lon = clamp(this.lon, this.minLon, this.maxLon) % 360

  this.currentLat = toDegrees(
    interpolateAngle(
      (toRadians(this.currentLat) + 2 * Math.PI) % (2 * Math.PI),
      (toRadians(this.lat) + 2 * Math.PI) % (2 * Math.PI),
      this.easing
    )
  )
  this.currentLon = toDegrees(
    interpolateAngle(
      (toRadians(this.currentLon) + 2 * Math.PI) % (2 * Math.PI),
      (toRadians(this.lon) + 2 * Math.PI) % (2 * Math.PI),
      this.easing
    )
  )
  this.currentDistance = lerp(this.currentDistance, this.distance, this.easing)

  // set new camera position according to the current
  // rotation at distance relative to target
  latLonToXyz(this.currentLat, this.currentLon, position)
  vec3.scale(position, this.currentDistance)
  vec3.add(position, target)
  mat4.identity(this.matrix)

  var up = [0, 1, 0]
  mat4.lookAt(this.matrix, position, target, up)

  if (camera) {
    mat4.invert(this.matrix)
  }
}

Orbiter.prototype.setup = function() {
  const orbiter = this

  function offset(e, target) {
    if (e.touches) return eventOffset(e.touches[0], target)
    else return eventOffset(e, target)
  }

  function down(x, y, shift) {
    const camera = orbiter.entity.getComponent('Camera')
    orbiter.dragging = true
    orbiter.dragPos[0] = x
    orbiter.dragPos[1] = y
    if (camera && shift && orbiter.pan) {
      orbiter.updateWindowSize()
      orbiter.clickPosWindow[0] = x
      orbiter.clickPosWindow[1] = y
      vec3.set(orbiter.clickTarget, orbiter.target)
      const targetInViewSpace = vec3.multMat4(
        vec3.copy(orbiter.clickTarget),
        camera.viewMatrix
      )
      orbiter.panPlane = [targetInViewSpace, [0, 0, 1]]
      ray.hitTestPlane(
        camera.getViewRay(
          orbiter.clickPosWindow[0],
          orbiter.clickPosWindow[1],
          orbiter.width,
          orbiter.height
        ),
        orbiter.panPlane[0],
        orbiter.panPlane[1],
        orbiter.clickPosPlane
      )
      ray.hitTestPlane(
        camera.getViewRay(
          orbiter.dragPosWindow[0],
          orbiter.dragPosWindow[1],
          orbiter.width,
          orbiter.height
        ),
        orbiter.panPlane[0],
        orbiter.panPlane[1],
        orbiter.dragPosPlane
      )
    } else {
      orbiter.panPlane = null
    }
  }

  function move(x, y, shift) {
    const camera = orbiter.entity.getComponent('Camera')
    if (!orbiter.dragging) {
      return
    }
    if (camera && shift && orbiter.panPlane) {
      orbiter.dragPosWindow[0] = x
      orbiter.dragPosWindow[1] = y
      ray.hitTestPlane(
        camera.getViewRay(
          orbiter.clickPosWindow[0],
          orbiter.clickPosWindow[1],
          orbiter.width,
          orbiter.height
        ),
        orbiter.panPlane[0],
        orbiter.panPlane[1],
        orbiter.clickPosPlane
      )
      ray.hitTestPlane(
        camera.getViewRay(
          orbiter.dragPosWindow[0],
          orbiter.dragPosWindow[1],
          orbiter.width,
          orbiter.height
        ),
        orbiter.panPlane[0],
        orbiter.panPlane[1],
        orbiter.dragPosPlane
      )
      mat4.set(orbiter.invViewMatrix, camera.viewMatrix)
      mat4.invert(orbiter.invViewMatrix)
      vec3.multMat4(
        vec3.set(orbiter.clickPosWorld, orbiter.clickPosPlane),
        orbiter.invViewMatrix
      )
      vec3.multMat4(
        vec3.set(orbiter.dragPosWorld, orbiter.dragPosPlane),
        orbiter.invViewMatrix
      )
      const diffWorld = vec3.sub(
        vec3.copy(orbiter.dragPosWorld),
        orbiter.clickPosWorld
      )
      const target = vec3.sub(vec3.copy(orbiter.clickTarget), diffWorld)
      orbiter.set({ target: target })
    } else if (orbiter.drag) {
      const dx = x - orbiter.dragPos[0]
      const dy = y - orbiter.dragPos[1]
      orbiter.dragPos[0] = x
      orbiter.dragPos[1] = y

      orbiter.lat += dy / orbiter.dragSlowdown
      orbiter.lon -= dx / orbiter.dragSlowdown
    }
  }

  function up() {
    orbiter.dragging = false
    orbiter.panPlane = null
  }

  function scroll(dy) {
    if (!orbiter.zoom) return

    orbiter.distance *= 1 + dy / orbiter.zoomSlowdown
    orbiter.distance = clamp(
      orbiter.distance,
      orbiter.minDistance,
      orbiter.maxDistance
    )
  }

  function onMouseDown(e) {
    if (!orbiter.enabled) return

    const pos = offset(e, orbiter.element)
    down(pos[0], pos[1], e.shiftKey || (e.touches && e.touches.length === 2))
  }

  function onMouseMove(e) {
    if (!orbiter.enabled) return

    const pos = offset(e, orbiter.element)
    move(pos[0], pos[1], e.shiftKey || (e.touches && e.touches.length === 2))
  }

  function onMouseUp() {
    if (!orbiter.enabled) return

    up()
  }

  function onWheel(e) {
    if (!orbiter.enabled) return

    scroll(e.deltaY)
    e.preventDefault()
  }

  function onTouchStart(e) {
    if (!orbiter.enabled) return

    e.preventDefault()
    onMouseDown(e)
  }

  function onTouchMove(e) {
    if (!orbiter.enabled) return

    e.preventDefault()
    onMouseMove(e)
  }

  this._onMouseDown = onMouseDown
  this._onTouchStart = onTouchStart
  this._onMouseMove = onMouseMove
  this._onTouchMove = onTouchMove
  this._onMouseUp = onMouseUp
  this._onWheel = onWheel

  this.element.addEventListener('mousedown', onMouseDown)
  this.element.addEventListener('wheel', onWheel)

  this.element.addEventListener('touchstart', onTouchStart)
  this.element.addEventListener('touchmove', onTouchMove, { passive: false })
  this.element.addEventListener('touchend', onMouseUp)

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

Orbiter.prototype.dispose = function() {
  this.element.removeEventListener('mousedown', this._onMouseDown)
  this.element.removeEventListener('wheel', this._onWheel)

  this.element.removeEventListener('touchstart', this._onTouchStart)
  this.element.removeEventListener('touchmove', this._onMouseMove)
  this.element.removeEventListener('touchend', this._onMouseUp)

  document.removeEventListener('mousemove', this._onMouseMove)
  document.removeEventListener('mouseup', this._onMouseUp)
}

module.exports = function createOrbiter(opts) {
  return new Orbiter(opts)
}
