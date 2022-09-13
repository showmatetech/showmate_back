const mongoose = require('mongoose')
const Schema = mongoose.Schema

const externalURLSchema = new Schema({
  spotify: {
    type: String
  }
}, { _id : false })

const imageSchema = new Schema({
  height: {
    type: Number
  },  
  url: {
    type: String
  },  
  width: {
    type: Number
  }
}, { _id : false })

const artistSchema = new Schema({
  artistId: {
    type: String,
    unique: true,
    required: true
  },
  uri: {
    type: String
  },
  popularity: {
    type: Number
  },
  name: {
    type: String
  },
  href: {
    type: String
  },
  genres: [{
    type: String
  }],
  externalUrls: {
    type: externalURLSchema
  },
  images: [{
    type: imageSchema
  }],
  relatedArtists: [{
    type: String
  }],
  topTracks: [{
    type: String
  }],
  songkickArtistId: {
    type: String
  }
}, { collection: 'artists' })

artistSchema.index({ artistId: 1 }, {unique:true})
module.exports = mongoose.model('Artist', artistSchema)
