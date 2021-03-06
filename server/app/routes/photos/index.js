'use strict';
var router = require('express').Router();
var path = require('path');
var busboy = require('connect-busboy'); //middleware for form/file upload
var mongoose = require('mongoose');


// Upload Dependencies
var uniqueFilename = require('unique-filename');
var AWS = require('aws-sdk');
var sKey = require(path.join(__dirname, '../../../env')).AKID;
var im = require('imagemagick');
var s3Path = 'https://s3-us-west-2.amazonaws.com/ztf/';




var bodyParser = require('body-parser');
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({
    extended: true
}));



var Photo = mongoose.model('Photo')
router.use(busboy());


router.post('/add', (req, res, next) => {
    Photo.create(req.body)
        .then((photo, err) => {
            if (err) {
                console.log('error saving photo', err);
                next(err);
            } else {
                res.send("Saved").status(202);
            }
        })
});


router.get('/', (req, res, next) => {
    Photo.find({})
        .then((photos) => {
            res.send(photos);
        })
});

router.get('/limit10', (req, res, next) => {
    Photo.find({})
        .limit(10)
        .then((photos) => {
            res.send(photos);
        })
});

router.get('/:album', (req, res, next) => {
    Photo.find({album: req.params.album})
        .then((photos) => {
            console.log(photos);
            res.send(photos);
        })
});

router.post('/update', (req, res, next) => {
    var query = {
        "_id": req.body._id
    };
    var update = req.body;
    var options = {
        new: true
    };
    Photo.findOneAndUpdate(query, update, options, function(err, photo) {
        if (err) {
            console.log('got an error');
            next(err);
        }
        res.sendStatus(200);
    });
});




var addToDb = function(path, title, albumId) {
    Photo.create({
        src: s3Path + path,
        thumbSrc: s3Path + 'thumbnail-' + path,
        title: title,
        album: albumId
    })
        .then(function(err, data) {
            if (err) {
                err.message = "Error saving photo to DB"
                err.status = 500;
                return err
            }
            console.log('photo', data);
            return;
        })
        .then(null, console.error.bind(console))
}

function createThumbnail(file, filename) {
    im.resize({
        srcPath: s3Path + filename,
        width: 800
    }, function(err, stdout, stderr) {
        if (err) throw err;
        var base64data = new Buffer(stdout, 'binary');
        var s3bucket = new AWS.S3({
            params: {
                Bucket: 'ztf'
            }
        });
        if (err) {
            err.message = "Error uploading Thumbnail"
            err.status = 500;
            throw err
        }
        var params = {
            Key: 'thumbnail-' + filename,
            Bucket: 'ztf',
            Body: base64data
        };
        s3bucket.upload(params, function() {
            return
        });


    });
}


router.post('/uploadAWS', function(req, res, next) {
    req.pipe(req.busboy);
    let title = '';
    let albumId = '';
    req.busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
      if(fieldname === 'title') {
        title = val;
        // console.log('title!!!');

      }
      else if(fieldname === 'album') {
        albumId = val;
        // console.log('album!!!');
      }
      else {
        // console.log('no match');
      }
    });
    req.busboy.on('file', function(fieldname, file, fileName, encoding, mimetype) {
        var filename = uniqueFilename('upload-img') + '.jpg';
        filename = filename.replace(/\//g, '-');
        var s3bucket = new AWS.S3({
            params: {
                Bucket: 'ztf'
            }
        });
        var params = {
            Key: filename,
            Bucket: 'ztf',
            ContentType: 'image/jpeg',
            Body: file
        };

        s3bucket.upload(params, function(err, data) {
            if (err) {
                console.log("Error uploading data: ", err);
            } else {
                createThumbnail(file, filename);
                addToDb(filename, title, albumId);
                res.json(filename);
                res.end();
            }
        });

    });


})

module.exports = router;