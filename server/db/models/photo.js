'use strict';
var mongoose = require('mongoose');
var random = require('mongoose-random');
mongoose.Promise = require('bluebird');


var _ = require('lodash');

var schema = new mongoose.Schema({
    title: {
        type: String
    },
    src: {
        type: String
    },
    thumbSrc: {
        type: String
    },
    author: {
        type: String
    },
    album: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Album'
    },
    tags: {
        type: Array,
        default: ['none']
    },
    height: {
        type: Number,
        default: 200
    },
    date: {
    	type: Date, 
    	default: Date.now
    },
    updated: {
        type: Boolean,
        default: false
    }
});


schema.plugin(random, { path: 'r' });


schema.pre('save', function (next) {
    next();
  // ...
})




schema.method('updatePhoto', function () {
    console.log("in method");
    this.updated = true;
    return this.save();
});


// personSchema.virtual('name.full').get(function () {
//   return this.name.first + ' ' + this.name.last;
// });


// schema.statics.upload = function search (photo) {
//   return this.where('name', new RegExp(name, 'i')).exec(cb);
// }


mongoose.model('Photo', schema);