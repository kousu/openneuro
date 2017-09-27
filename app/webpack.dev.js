const path = require('path')
const merge = require('webpack-merge')
const common = require('./webpack.common.js')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')

module.exports = merge(common, {
  devtool: 'inline-source-map',
  devServer: {
    contentBase: path.join(__dirname, 'dist'),
    compress: true,
    host: '0.0.0.0',
    port: 9876,
    disableHostCheck: true,
    historyApiFallback: true,
  },
  plugins: [
    new CopyWebpackPlugin([
      {
        from: './assets/papaya.js',
        to: './papaya.js',
      },
    ]),
    new ExtractTextPlugin('style.css'),
  ],
})
