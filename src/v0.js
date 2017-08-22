import reglInit from 'regl'
import mat4 from 'gl-mat4'
import {normalize as normalizeQuat} from 'gl-quat'
import catmullClark from 'gl-catmull-clark'
import {evaluateFCurve} from 'fcurve'

const animProps = ['loc', 'rot', 'scale', 'shapes']

// Evaluate the animatable properties of a thing into matrices without creating new objects
function evalObjAnimation(state, obj, frame) {
  let objState = state[obj.id]
  if (!objState) {
    objState = state[obj.id] = {matrix: mat4.create()}
  }

  for (let prop of animProps) {
    const propAnim = obj.anim[prop]
    if (!propAnim) {
      continue
    }

    if (propAnim.type === 'static') {
      objState[prop] = propAnim.data
    } else if (propAnim.type === 'anim') {
      let propState = objState[prop]
      if (!propState) {
        propState = objState[prop] = []
      }
      propAnim.data.forEach((fcurve, idx) => {
        propState[idx] = evaluateFCurve(fcurve, frame)
      })
    }
  }

  // Blender-animated rotation quaternion values need to be normalized,
  // otherwise the quaternion may scale the geometry.
  normalizeQuat(objState.rot, objState.rot)

  mat4.fromRotationTranslation(objState.matrix, objState.rot, objState.loc)
  mat4.scale(objState.matrix, objState.matrix, objState.scale)
}

// Evaluate the animatable properties of everything in the scene
function evalAnimation(state, transforms, scene, frame) {
  // Scene objects are already ordered with parents preceding their children,
  // so we can iterate through scene.objs in order and apply parent transforms
  // as we go.
  for (const obj of scene.objs) {
    evalObjAnimation(state, obj, frame)

    const objMatrix = state[obj.id].matrix
    const transform = transforms[obj.id]
    if (transform) {
      mat4.multiply(objMatrix, objMatrix, transform)
    }
    if (obj.parent) {
      mat4.multiply(objMatrix, state[obj.parent].matrix, objMatrix)
    }
  }
}


export default function time(scene, reglContext) {
  Object.freeze(scene)  // Mutation of the scene would be a bug!

  const regl = reglInit(reglContext)

  const frag = `
    precision mediump float;
    uniform vec3 color;
    void main () {
      gl_FragColor = vec4(color, 1);
    }
  `

  function Mesh({id, positions, cells, mat: {color}, subsurf}) {
    this.id = id
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

  function MorphMesh({id, positions, cells, shapes, mat: {color}, subsurf}) {
    this.id = id
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

  const objs = {}
  const meshes = []
  for (const obj of scene.objs) {
    objs[obj.id] = obj
    if (obj.type === 'mesh') {
      if (obj.shapes) {
        meshes.push(new MorphMesh(obj))
      } else {
        meshes.push(new Mesh(obj))
      }
    }
  }

  const camera = objs[scene.camera]
  const projection = camera.perspective
  const projectionF = projection[5]
  const cameraPivot = objs[camera.parent]

  const bgColor = scene.bg.color.concat(1)
  const view = mat4.create()

  const animState = {}
  const animTransforms = {
    [cameraPivot.id]: mat4.create(),  // User camera pivot control
  }

  function renderFrame(x, y) {
    // Adjust projection to match screen aspect
    // This was determined by looking at the relationships of f and aspect in:
    // https://github.com/stackgl/gl-mat4/blob/c2e2de728fe7eba592f74cd02266100cc21ec89a/perspective.js
    const aspect = regl._gl.drawingBufferWidth / regl._gl.drawingBufferHeight
    if (aspect >= 1) {
      // Wide view: scale up Y of frustrum
      projection[0] = projectionF
      projection[5] = projectionF * aspect
    } else {
      // Tall view: scale up X of frustum
      projection[0] = projectionF / aspect
      projection[5] = projectionF
    }

    // Adjust camera pivot transform based on position
    const pivotMatrix = animTransforms[cameraPivot.id]
    mat4.identity(pivotMatrix)
    mat4.rotateX(pivotMatrix, pivotMatrix, .05 * Math.PI * (.5 - y))
    mat4.rotateZ(pivotMatrix, pivotMatrix, .05 * Math.PI * (.5 - x))

    // Evaluate object positions for frame
    const frame = scene.start + y * (scene.end - scene.start)
    evalAnimation(animState, animTransforms, scene, frame)

    // Convert camera matrix into view matrix
    mat4.invert(view, animState[scene.camera].matrix)

    regl.clear({
      color: bgColor,
      depth: 1
    })

    for (const mesh of meshes) {
      mesh.draw({
        pos: animState[mesh.id].matrix,
        view,
        projection,
        skWeight: animState[mesh.id].shapes && animState[mesh.id].shapes[0],
      })
    }

    regl.poll()
  }

  function run() {
    const body = document.body
    window._time = {scene}  // For debugging

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

  return {renderFrame, run}
}
