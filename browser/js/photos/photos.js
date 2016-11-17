app.config(function ($stateProvider) {
    $stateProvider.state('photos', {
        url: '/photos',
        templateUrl: 'js/photos/photos.html',
        controller: 'PhotoCtrl',
        resolve: {
            photos: (PhotosFactory, $stateParams) => {
                return PhotosFactory.fetchAll()
            }
        }
    });
});

app.config(function ($stateProvider) {
    $stateProvider.state('addphoto', {
        url: '/photos',
        templateUrl: 'js/photos/photos-add.html',
        controller: 'PhotoCtrl'
    });
});


app.config(function ($stateProvider) {
    $stateProvider.state('uploadPhotos', {
        url: '/uploadPhotos',
        templateUrl: 'js/photos/photos-upload.html',
        controller: 'UploadPhotoCtrl'
    });
});

