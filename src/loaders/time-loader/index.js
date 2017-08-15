import path from 'path'

function timeLoader(blendDataText) {
  this.cacheable()
  const cb = this.async()

  const name = path.basename(this.resourcePath).split('.')[0]
  const idx = Number(name)

  const blendData = JSON.parse(blendDataText)
  blendData.idx = idx

  const code = `
    import main from '../src/loaders/time-loader/v0.js'
    import initUI from '../src/ui.js'
    initUI()
    main(${JSON.stringify(blendData)})
  `

  const prev = idx > 1 ? `<a id="prev" href="/${idx - 1}">previous</a>` : ''
  const next = idx < this.query.last ? `<a id="next" href="/${idx + 1}">next</a>` : ''
  const html = `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${blendData.title}</title>
      <link rel="icon" type="image/png" href="favicon.png" sizes="32x32">
      <style>body { overflow: hidden } nav { display: none }</style>
    </head>
    <body>
      <nav>
        ${next}
        ${prev}
      </nav>
      <script src="lib.js"></script>
      <script src="${name}.js"></script>
    </body>
    </html>
  `.replace(/>\s+</g, '><').trim()
  this.emitFile(`${name}.html`, html)

  cb(null, code)
}

export default timeLoader
