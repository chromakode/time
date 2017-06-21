import reglInit from 'regl'
import mat4 from 'gl-mat4'
import {normalize as normalizeQuat} from 'gl-quat'
import catmullClark from 'gl-catmull-clark'
import {evaluateFCurve} from 'fcurve'

const animProps = ['loc', 'rot', 'scale', 'shapes']

function evalThingAnimation(state, thing, frame) {
  // Evaluate the animatable properties of a thing into matrices without creating new objects
  let thingState = state[thing.id]
  if (!thingState) {
    thingState = state[thing.id] = {matrix: mat4.create()}
  }

  for (let prop of animProps) {
    const propAnim = thing.anim[prop]
    if (!propAnim) {
      continue
    }

    if (propAnim.type === 'static') {
      thingState[prop] = propAnim.data
    } else if (propAnim.type === 'anim') {
      let propState = thingState[prop]
      if (!propState) {
        propState = thingState[prop] = []
      }
      propAnim.data.forEach((fcurve, idx) => {
        propState[idx] = evaluateFCurve(fcurve, frame)
      })
    }
  }

  // Blender-animated rotation quaternion values need to be normalized,
  // otherwise the quaternion may scale the geometry.
  normalizeQuat(thingState.rot, thingState.rot)

  mat4.fromRotationTranslation(thingState.matrix, thingState.rot, thingState.loc)
  mat4.scale(thingState.matrix, thingState.matrix, thingState.scale)
}

function evalAnimation(state, scene, frame) {
  // Evaluate the animatable properties of everything in the scene
  evalThingAnimation(state, scene.camera, frame)
  evalThingAnimation(state, scene.camera.pivot, frame)
  scene.objs.forEach(obj => { evalThingAnimation(state, obj, frame) })
}


export default function main(scene) {
  Object.freeze(scene)  // Mutation of the scene would be a bug!

  const regl = reglInit()

  const frag = `
    precision mediump float;
    uniform vec3 color;
    void main () {
      gl_FragColor = vec4(color, 1);
    }
  `

  function Mesh({positions, cells, mat: {color}, subsurf}) {
    if (subsurf) {
      let {positions: subsurfPositions, cells: subsurfCells} = catmullClark(positions, cells, subsurf, true)
      this.verts = regl.buffer(subsurfPositions)
      this.cells = regl.elements(subsurfCells)
    } else {
      this.verts = regl.buffer(positions)
      this.cells = regl.elements(cells)
    }
    this.color = color
  }
  Mesh.prototype.draw = regl({
    vert: `
    uniform mat4 projection, view, model;
    attribute vec3 vert;
    void main () {
      gl_Position = projection * view * model * vec4(vert, 1);
    }`,

    frag,

    uniforms: {
      color: regl.this('color'),
      model: regl.prop('pos'),
      projection: regl.prop('projection'),
      view: regl.prop('view'),
    },

    attributes: {
      vert: regl.this('verts'),
    },

    elements: regl.this('cells'),
  })

  function MorphMesh({positions, cells, shapes, mat: {color}, subsurf}) {
    if (subsurf) {
      let {positions: subsurfPositions, cells: subsurfCells} = catmullClark(positions, cells, subsurf, true)
      this.verts = regl.buffer(subsurfPositions)
      this.cells = regl.elements(subsurfCells)
    } else {
      this.verts = regl.buffer(positions)
      this.cells = regl.elements(cells)
    }
    this.skVerts = regl.buffer(catmullClark(shapes[0], cells, subsurf, true).positions)
    this.color = color
  }

  MorphMesh.prototype.draw = regl({
    vert: `
    uniform mat4 projection, view, model;
    uniform float skWeight;
    attribute vec3 vert, skVert;
    void main () {
      vec3 position = mix(vert, skVert, skWeight);
      gl_Position = projection * view * model * vec4(position, 1);
    }`,

    frag,

    uniforms: {
      color: regl.this('color'),
      model: regl.prop('pos'),
      projection: regl.prop('projection'),
      view: regl.prop('view'),
      skWeight: regl.prop('skWeight'),
    },

    attributes: {
      vert: regl.this('verts'),
      skVert: regl.this('skVerts'),
    },

    elements: regl.this('cells'),
  })

  const meshes = {}
  for (const obj of scene.objs) {
    if (obj.shapes) {
      meshes[obj.id] = new MorphMesh(obj)
    } else {
      meshes[obj.id] = new Mesh(obj)
    }
  }
  const projection = scene.camera.perspective
  const projectionF = projection[5]
  const bgColor = scene.bg.color.concat(1)
  const view = mat4.create()
  const animState = {}

  const body = document.body

  function renderFrame(x, y) {
    const frame = scene.start + y * (scene.end - scene.start)
    evalAnimation(animState, scene, frame)

    // Adjust projection to match screen aspect
    // This was determined by looking at the relationships of f and aspect in:
    // https://github.com/stackgl/gl-mat4/blob/c2e2de728fe7eba592f74cd02266100cc21ec89a/perspective.js
    const aspect = window.innerWidth / window.innerHeight
    if (aspect >= 1) {
      // Wide view: scale up Y of frustrum
      projection[0] = projectionF
      projection[5] = projectionF * aspect
    } else {
      // Tall view: scale up X of frustum
      projection[0] = projectionF / aspect
      projection[5] = projectionF
    }

    // Rotate pivot based on input
    mat4.identity(view)
    mat4.rotateX(view, view, .05 * Math.PI * (.5 - y))
    mat4.rotateZ(view, view, .05 * Math.PI * (.5 - x))
    mat4.multiply(view, view, animState[scene.camera.pivot.id].matrix)

    // Position camera relative to pivot
    mat4.multiply(view, view, animState[scene.camera.id].matrix)

    // Convert camera matrix into view matrix
    mat4.invert(view, view)

    regl.clear({
      color: bgColor,
      depth: 1
    })

    for (const obj of scene.objs) {
      meshes[obj.id].draw({
        pos: animState[obj.id].matrix,
        view,
        projection,
        skWeight: animState[obj.id].shapes && animState[obj.id].shapes[0],
      })
    }

    regl.poll()
  }

  function run() {
    let x = .5
    let y = .5

    window.addEventListener('resize', () => {
      renderFrame(x, y)
    })

    body.addEventListener('mousemove', ({clientX, clientY}) => {
      x = clientX / window.innerWidth
      y = clientY / window.innerHeight
      renderFrame(x, y)
    })

    let prevOrientation
    window.addEventListener('deviceorientation', ({beta, gamma}) => {
      if (prevOrientation) {
        x += (gamma - prevOrientation.gamma) / 60
        y += (beta - prevOrientation.beta) / 30
        x = Math.max(0, Math.min(1, x))
        y = Math.max(0, Math.min(1, y))
        renderFrame(x, y)
      }
      prevOrientation = {beta, gamma}
    })

    renderFrame(x, y)
  }

  run()
}
