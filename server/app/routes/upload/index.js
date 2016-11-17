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
let Promise = require("bluebird");


AWS.config.setPromisesDependency(require('bluebird'));




let bodyParser = require('body-parser');
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({
    extended: true
}));



let Photo = mongoose.model('Photo')
router.use(busboy());

let s3bucket = new AWS.S3({
    params: {
        Bucket: 'ztf'
    }
});


let asyncUpload = (params) => {
    let putObjectPromise = s3bucket.putObject(params).promise();
    putObjectPromise.then(function(data) {
        console.log('Success');
    }).catch(function(err) {
        console.log(err);
    });
    return putObjectPromise;
}





var putBatch = function putBatch(params) {
    let s3 = new AWS.S3({
        params: {
            Bucket: 'ztf'
        }
    });
    return s3.putObject(params).promise();
};









let addToDb = function(photo) {
    //******* Need to add album id somewhere*************
    return Photo.create(photo)
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

function uploadPromise(params) {
    let s3bucket = new AWS.S3({
        params: {
            Bucket: 'ztf'
        }
    });
    return s3bucket.upload(params).promise();
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
            console.log("thumbnail upload complete");
            return
        });


    });
}


router.post('/photo', function(req, res, next) {
    req.pipe(req.busboy);
    let title = '';
    let albumId;
    let length;
    let newPhoto = {}



    req.busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
        console.log("fieldname: ", fieldname);
        console.log("value: ", val);
        if (fieldname === 'qqfilename') {
            title = val;
        }

        if (fieldname === 'qqtotalfilesize') {
            console.log("setting size");
            length = val
        }


    });
    req.busboy.on('file', function(fieldname, file, fileName, encoding, mimetype) {
        let filename = uniqueFilename('upload-img') + '.jpg';
        filename = filename.replace(/\//g, '-');
        file.length = length;
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
                // createThumbnail(file, filename);
                newPhoto.src = s3Path + filename;
                newPhoto.thumbSrc = s3Path + 'thumbnail-' + filename;
                newPhoto.title = title;
                addToDb(newPhoto).then(function(err, data) {
                    if (err) {
                        err.message = "Error saving photo to DB"
                        err.status = 500;
                        return err
                    } else {
                        console.log("photo saved success");
                       
                        return
                    }
                })
                .then((photo, err) => {
                    if(err) {
                        console.log("last errr", err);
                        return err
                    }
                    else {
                        console.log("data", photo);
                         res.json({
                            "success": true
                        });
                        res.end();
                    }
                }).catch(err => {
                    res.sendStatus(500)
                    res.end();
                });



            }
        });

    });








})

module.exports = router;