const Signal = require('signals')
const Mat4 = require('pex-math/Mat4')

function DirectionalLight (opts) {
  const ctx = opts.ctx

  this.type = 'DirectionalLight'
  this.changed = new Signal()
  this.shadows = false
  this.color = [1, 1, 1, 1]
  this.direction = [1, -1, 0]
  this.bias = 0.1

  this._left = -10
  this._right = 10
  this._bottom = -10
  this._top = 10
  this._near = 2
  this._far = 40

  this._prevDirection = [0, 0, 0]

  this._colorMap = ctx.texture2D({ width: 1024, height: 1024 }) // FIXME: remove light color map
  this._shadowMap = ctx.texture2D({ width: 1024, height: 1024, format: ctx.PixelFormat.Depth })
  this._viewMatrix = Mat4.create()
  this._projectionMatrix = Mat4.create()

  this._shadowMapDrawCommand = {
    name: 'shadowMap',
    pass: ctx.pass({
      color: [ this._colorMap ],
      depth: this._shadowMap,
      clearColor: [0, 0, 0, 1],
      clearDepth: 1
    }),
    viewport: [0, 0, 1024, 1024] // TODO: viewport bug
    // colorMask: [0, 0, 0, 0] // TODO
  }

  this.set(opts)
}

DirectionalLight.prototype.init = function (entity) {
  this.entity = entity
}

DirectionalLight.prototype.set = function (opts) {
  Object.assign(this, opts)
  Object.keys(opts).forEach((prop) => this.changed.dispatch(prop))
}

module.exports = function (opts) {
  return new DirectionalLight(opts)
}