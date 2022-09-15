const mongoose = require('mongoose')
const Schema = mongoose.Schema

const artistsSchema = new Schema({
  score: {
    type: Number,
    required: true
  },
  artists: [{
    type: String
  }]
}, { _id : false })

const recommendedEventSchema = new Schema({
  eventId: {
    type: String,
    required: true
  },
  selected: {
    type: Boolean,
    default: false
  },
  info: {
    type: Object
  },
  artistInfo: {
    type: Object
  },
  trackInfo: {
    type: Object
  }
}, { _id : false })

const userSchema = new Schema({
  userId: {
    type: String,
    unique: true,
    required: true
  },
  email: {
    type: String,
    unique: true,
    required: true
  },
  country: {
    type: String
  },
  display_name: {
    type: String
  },
  uri: {
    type: String
  },
  access_token: {
    type: String
  },
  artists: [{
    type: artistsSchema
  }],
  events: [{
    type: String
  }],
  status: {
    type: String,
    enum : ['INITIAL_STATE', 'COLLECTING_DATA', 'AVAILABLE_RESULTS'],
    default: 'INITIAL_STATE'
  },
  processedPhases: {
    type: Number,
    default: 0
  },
  recommendedEvents: [{
    type: recommendedEventSchema
  }],
}, { collection: 'users' })

userSchema.index({ userId: 1 }, {unique:true})
module.exports = mongoose.model('User', userSchema)