import fs from 'fs'
import glob from 'glob'
import webpack from 'webpack'
import path from 'path'

const entry = {}

const items = glob.sync('./art/*.blend')
let last = 1
items.forEach(itemPath => {
  const name = path.basename(itemPath).split('.')[0]
  entry[name] = itemPath
  last = Math.max(Number(name), last)
})

class IndexLatest {
  apply(compiler) {
    compiler.plugin('emit', function(compilation, callback) {
      // Copy the latest item to root index.html
      const lastHTML = compilation.assets[`${last}.html`]
      if (lastHTML) {
        compilation.assets[`index.html`] = lastHTML
      }
      callback()
    })
  }
}

export default {
  entry,

  output: {
    filename: '[name].js',
    path: path.join(__dirname, 'build'),
  },

  resolveLoader: {
    modules: [path.resolve(__dirname, 'src/loaders'), 'node_modules'],
  },

  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules\/(?!gl-catmull-clark)/,
        use: ['babel-loader'],
      },
      {
        test: /\.v0.blend$/,
        use: [{loader: 'time-loader', options: {last}}, 'blender-loader'],
      },
      {
        test: /\.less$/,
        use: ['style-loader', 'css-loader', 'less-loader'],
      },
    ],
  },

  plugins: [
    new webpack.optimize.CommonsChunkPlugin({
      name: "lib",
      filename: "lib.js",
    }),
    new IndexLatest(),
  ],

  devServer: {
    setup: app => {
      app.use((req, res, next) => {
        // Default to .html extension (simulate GitHub pages behavior)
        if (req.url !== '/' && !req.url.endsWith('.html') && !req.url.endsWith('.js')) {
          req.url += '.html'
        }
        next()
      })
    },
  },
}
