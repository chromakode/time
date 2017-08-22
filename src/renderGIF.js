import path from 'path'
import fs from 'fs'
import {promisify} from 'util'
import {runLoaders as _runLoaders} from 'loader-runner'
import createGLContext from 'gl'
import sharp from 'sharp'
import time from './v0'
import GifEncoder from 'gif-encoder'

const runLoaders = promisify(_runLoaders)

const WIDTH = 1024
const HEIGHT = 1024
const SUPERSAMPLE = 4
const WIDTH_S = WIDTH * SUPERSAMPLE
const HEIGHT_S = HEIGHT * SUPERSAMPLE
const DURATION = 2.5 * 1000
const PAUSE = 500
const FPS = 30
const FRAMES = FPS * (DURATION / 1000)

if (process.argv.length !== 4) {
  console.log(`Usage: ${__filename} path-to.blend path-to.gif`)
  process.exit(1)
}
const blendPath = process.argv[2]
const blendName = path.basename(blendPath, '.blend')
const outPath = process.argv[3]

async function render() {
  let result
  try {
    result = await runLoaders({
      resource: blendPath,
      loaders: [path.resolve(__dirname, 'loaders/blender-loader')],
    })
  } catch (err) {
    console.error(err)
    process.exit(1)
  }

  const gl = createGLContext(WIDTH_S, HEIGHT_S)
  if (!gl) {
    console.error('Unable to create GL context')
    process.exit(1)
  }

  const blendData = JSON.parse(result.result[0])
  const timePiece = time(blendData, gl)

  const gif = new GifEncoder(WIDTH, HEIGHT, {highWaterMark: 1024 * 1024})
  gif.pipe(fs.createWriteStream(outPath))
  gif.setRepeat(0)
  gif.writeHeader()

  sharp.cache(false)  // Reduce memory usage

  const totalFrames = 2 * FRAMES - 1
  for (let i = 0; i < totalFrames; i++) {
    // Render frame
    const y = i < FRAMES ? i / FRAMES : 2 - i / FRAMES
    timePiece.renderFrame(.5, y)

    // Get frame data
    let pixels = new Uint8Array(WIDTH_S * HEIGHT_S * 4)
    gl.readPixels(0, 0, WIDTH_S, HEIGHT_S, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    // Resize and flip (otherwise gifs come out upside-down!?)
    let framePixels = await sharp(Buffer.from(pixels.buffer), {
        raw: {
          width: WIDTH_S,
          height: HEIGHT_S,
          channels: 4,
        }
    })
      .resize(WIDTH, HEIGHT)
      .flip()
      .toBuffer()

    // Add to GIF (slow!)
    gif.setDelay(i === 0 ? PAUSE : DURATION / FRAMES)
    gif.addFrame(framePixels)

    // This seems to help keep memory usage down.
    pixels = null
    framePixels = null

    console.log(`Rendered frame ${i + 1} / ${totalFrames}`)
  }

  gif.finish()
}

render()
