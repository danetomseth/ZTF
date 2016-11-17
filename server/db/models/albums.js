'use strict';
var mongoose = require('mongoose');

var _ = require('lodash');

var schema = new mongoose.Schema({
    title: {
        type: String
    },
    photos: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Photo'
    }],
    cover: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Photo'
    },
    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    private: {
        type: Boolean,
        default: 'false'
    },
    description: {
        type: String
    },
    date: {
    	type: Date, 
    	default: Date.now
    }
});


schema.pre('save', function (next) {

    if (!this.cover && this.photos.length) {
        console.log("adding cover from first photo: ");
        this.cover = this.photos[0]
    }

    next();

});


// schema.statics.addPhoto = function addPhoto (albumId, photoId) {
//     console.log("album**** ", albumId);

// }



schema.method('addPhoto', function (photoId) {
    console.log("in method", photoId);
    this.photos.push(photoId)
    return this.save();
});


mongoose.model('Album', schema);