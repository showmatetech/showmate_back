const mongoose = require('mongoose')
const Schema = mongoose.Schema


const trackSchema = new Schema({
  trackId: {
    type: String,
    unique: true,
    required: true
  },
  acousticness: {
    type: Number
  },
  danceability: {
    type: Number
  },
  durationMs: {
    type: Number
  },
  energy: {
    type: Number
  },
  instrumentalness: {
    type: Number
  },
  key: {
    type: Number
  },
  liveness: {
    type: Number
  },
  loudness: {
    type: Number
  },
  mode: {
    type: Number
  },
  speechiness: {
    type: Number
  },
  tempo: {
    type: Number
  },
  timeSignature: {
    type: Number
  },
  valence: {
    type: Number
  }
}, { collection: 'tracks' })

trackSchema.index({ trackId: 1 }, {unique:true})
module.exports = mongoose.model('Track', trackSchema)
