'use strict';
var router = require('express').Router();
var path = require('path');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({
    extended: true
}));
var Photo = mongoose.model('Photo');
var Album = mongoose.model('Album');



router.get('/', (req, res, next) => {
    Album.find({})
    .populate('photos cover')
        .then(album => {
            res.send(album);
        })
});

router.get('/:albumId', (req, res, next) => {
    Album.findById(req.params.albumId)
      .populate('photos cover')

    .then(album => {
        console.log('single album', album);
        res.send(album);
    });
});



router.get('/photos/:albumId', (req, res, next) => {
    console.log("fetching");
    Photo.find({
        album: req.params.albumId
    })
    .then(photos => {
        console.log('photos from album: ', photos);
        res.send(photos);
    });
})

router.get('/user/:userId', (req, res, next) => {
    Album.find({
        owner: req.params.userId
    })
      .populate('photos cover')

    .then(album => {
        console.log('user album', album);
        res.send(album);
    });
});



router.post('/', (req, res, next) => {
    Album.create(req.body)
        .then((album, err) => {
            if (err) {
                console.log("Error saving album");
                next(err);
            } else {
                res.send(album);
            }
        })
});

router.delete('/:album', (req, res, next) => {
    Album.remove({
        _id: req.params.album
    }, function(err) {
        if (!err) {
            console.log('deleted');
            res.sendStatus(200);
        } else {
            next(err);
        }
    });
});

router.post('/update', (req, res, next) => {
    var query = {
        "_id": req.body._id
    };
    var update = req.body;
    var options = {
        new: true
    };
    Album.findOneAndUpdate(query, update, options, function(err, album) {
        if (err) {
            console.log('got an error');
            next(err);
        }
        res.sendStatus(200);
    });
});


router.post('/addPhoto', (req, res, next) => {
    Album.findById(req.body.albumId)
    .then(album => {
        console.log("album found: ", album);
        return album.addPhoto(req.body.photoId);
    })
    .then(album => {
        console.log("success", album);
        res.sendStatus(200);
    })
    res.end();
});





module.exports = router;