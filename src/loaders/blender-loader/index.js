import path from 'path'
import {spawn} from 'child_process'

function getBlendData(scriptPath, blendPath, cb) {
  const child = spawn('blender', ['-b', blendPath, '-P', scriptPath], {
    stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
  })

  const logs = []
  child.stderr.on('data', data => {
    logs.push(data.toString('utf8'))
  })

  const output = []
  child.stdio[3].on('data', data => {
    output.push(data.toString('utf8'))
  })

  child.on('close', code => {
    if (code !== 0) {
      return cb(new Error(`Blender exited with non-zero exit code: ${code}`))
    }
    if (output.length === 0) {
      const logText = logs.join('\n')
      return cb(new Error('No data from Blender:\n' + logText))
    }
    cb(null, output.join(''))
  })
}

function blenderLoader() {
  this.cacheable()
  const cb = this.async()

  const scriptPath = path.join(__dirname, 'export.py')
  this.addDependency(scriptPath)
  getBlendData(scriptPath, this.resourcePath, cb)
}

export default blenderLoader
