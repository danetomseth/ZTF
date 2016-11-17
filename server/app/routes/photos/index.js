'use strict';
let router = require('express').Router();
let path = require('path');
let busboy = require('connect-busboy'); //middleware for form/file upload
let mongoose = require('mongoose');


// Upload Dependencies
let uniqueFilename = require('unique-filename');
let AWS = require('aws-sdk');
let sKey = require(path.join(__dirname, '../../../env')).AKID;
let im = require('imagemagick');
let s3Path = 'https://s3-us-west-2.amazonaws.com/ztf/';




let bodyParser = require('body-parser');
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({
    extended: true
}));



let Photo = mongoose.model('Photo')
router.use(busboy());



router.put('/updateAll', (req, res, next) => {
    Photo.find({})
    .then(photos => {
        photos.forEach(function(photo) {
            photo.updatePhoto().then(photo => {
                console.log("Updated!!!");
            })
        })
    })
})


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

router.get('/random/:limit', (req, res, next) => {
    let limit = Number(req.params.limit);
    Photo.findRandom().limit(limit).exec(function(err, photos) {
        if(err) {
            console.log('err fetching random photos', err);
            next(err)
        }
        else {
            res.send(photos)
        }
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
    let query = {
        "_id": req.body._id
    };
    let update = req.body;
    let options = {
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




let addToDb = function(photo) {
    //******* Need to add album id somewhere*************
    console.log("photo being created: ", photo);
    Photo.create(photo)
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
        let base64data = new Buffer(stdout, 'binary');
        let s3bucket = new AWS.S3({
            params: {
                Bucket: 'ztf'
            }
        });
        if (err) {
            err.message = "Error uploading Thumbnail"
            err.status = 500;
            throw err
        }
        let params = {
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
    let albumId;
    let newPhoto = {}


    req.busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
      if(fieldname === 'title') {
        title = val;
      }
    });
    req.busboy.on('file', function(fieldname, file, fileName, encoding, mimetype) {
        let filename = uniqueFilename('upload-img') + '.jpg';
        filename = filename.replace(/\//g, '-');
        let s3bucket = new AWS.S3({
            params: {
                Bucket: 'ztf'
            }
        });
        let params = {
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
                newPhoto.src = s3Path + filename;
                newPhoto.thumbSrc = s3Path + 'thumbnail-' + filename;
                newPhoto.title = title;
                addToDb(newPhoto);
                res.json(filename);
                res.end();
            }
        });

    });


})

module.exports = router;