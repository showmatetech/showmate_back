const mongoose = require('mongoose')
const Schema = mongoose.Schema

const eventSchema = new Schema({
  eventId: {
    type: String,
    unique: true,
    required: true
  },
  artists:[{
    type: String
  }]
}, { collection: 'events' })

eventSchema.index({ eventId: 1 }, {unique:true})
module.exports = mongoose.model('Event', eventSchema)
