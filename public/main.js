'use strict';
window.app = angular.module('ZTF', ['fsaPreBuilt', 'bootstrapLightbox', 'ui.router', 'ui.bootstrap', 'ngAnimate', 'angularFileUpload', 'ngMaterial', 'akoenig.deckgrid']);

app.config(function ($urlRouterProvider, $locationProvider, $mdThemingProvider) {
    // This turns off hashbang urls (/#about) and changes it to something normal (/about)
    $locationProvider.html5Mode(true);
    // If we go to a URL that ui-router doesn't have registered, go to the "/" url.
    $urlRouterProvider.otherwise('/');
    var customPrimary = {
        '50': '#d8bf8c',
        '100': '#d1b579',
        '200': '#cbaa66',
        '300': '#c4a053',
        '400': '#bd9540',
        '500': '#aa863a',
        '600': '#977734',
        '700': '#84682d',
        '800': '#715927',
        '900': '#5e4a20',
        'A100': '#deca9f',
        'A200': '#e5d4b2',
        'A400': '#ebdfc5',
        'A700': '#4b3b1a'
    };

    $mdThemingProvider.theme('default').primaryPalette('blue').accentPalette('light-green').warnPalette('yellow');
});

// This app.run is for controlling access to specific states.
app.run(function ($rootScope, AuthService, $state) {

    // The given state requires an authenticated user.
    var destinationStateRequiresAuth = function destinationStateRequiresAuth(state) {
        return state.data && state.data.authenticate;
    };

    // $stateChangeStart is an event fired
    // whenever the process of changing a state begins.
    $rootScope.$on('$stateChangeStart', function (event, toState, toParams) {

        if (!destinationStateRequiresAuth(toState)) {
            // The destination state does not require authentication
            // Short circuit with return.
            return;
        }

        if (AuthService.isAuthenticated()) {
            // The user is authenticated.
            // Short circuit with return.
            return;
        }

        // Cancel navigating to new state.
        event.preventDefault();

        AuthService.getLoggedInUser().then(function (user) {
            // If a user is retrieved, then renavigate to the destination
            // (the second time, AuthService.isAuthenticated() will work)
            // otherwise, if no user is logged in, go to "login" state.
            //$rootScope.loggedInUser = user;
            // if (user) {
            //     $state.go(toState.name, toParams);
            // } else {
            //     $state.go('login');
            // }
        });
    });
});

app.controller("AdminCtrl", function ($scope, $state, AdminFactory, AlbumFactory, PhotosFactory) {
    $scope.addingPictures = false;

    AlbumFactory.fetchAll().then(function (albums) {
        console.log('fetched', albums);
        $scope.albums = albums;
        $scope.albumOne = $scope.albums[0];
    });

    PhotosFactory.fetchTen().then(function (photos) {
        $scope.photos = photos;
    });

    $scope.deleteAlbum = function (album) {
        AlbumFactory.deleteAlbum(album._id);
        var albumIndex = $scope.albums.indexOf(album);
        $scope.albums.splice(albumIndex, 1);
    };

    $scope.createAlbum = function () {
        var album = {
            title: $scope.newAlbum
        };
        AlbumFactory.createAlbum(album).then(function (album) {
            $scope.albums.push(album);
            $scope.newAlbum = "";
        });
    };

    $scope.addPhotos = function (album) {
        $scope.selectingPictures = true;
        $scope.currentAlbum = album;
        PhotosFactory.fetchAll().then(function (photos) {
            $scope.photos = photos;
        });
    };

    $scope.viewAlbum = function (album) {
        $state.go('singleAlbum', { albumId: album._id });
    };

    $scope.updateAlbum = function () {
        AlbumFactory.updateAlbum($scope.currentAlbum).then(function (res) {
            $state.reload();
        });
    };

    $scope.uploadPhotos = function () {
        $state.go('uploadPhotos');
    };

    $scope.addToAlbum = function (photo) {
        $scope.currentAlbum.photos.push(photo._id);
    };
});
app.factory("AdminFactory", function ($http) {
    return {};
});
app.config(function ($stateProvider) {
    $stateProvider.state('admin', {
        url: '/admin',
        templateUrl: 'js/admin/admin.html',
        controller: 'AlbumCtrl',
        data: {
            authenticate: true
        }
    });
});
(function () {

    'use strict';

    // Hope you didn't forget Angular! Duh-doy.
    if (!window.angular) throw new Error('I can\'t find Angular!');

    var app = angular.module('fsaPreBuilt', []);

    app.factory('Socket', function () {
        if (!window.io) throw new Error('socket.io not found!');
        return window.io(window.location.origin);
    });

    // AUTH_EVENTS is used throughout our app to
    // broadcast and listen from and to the $rootScope
    // for important events about authentication flow.
    app.constant('AUTH_EVENTS', {
        loginSuccess: 'auth-login-success',
        loginFailed: 'auth-login-failed',
        logoutSuccess: 'auth-logout-success',
        sessionTimeout: 'auth-session-timeout',
        notAuthenticated: 'auth-not-authenticated',
        notAuthorized: 'auth-not-authorized'
    });

    app.factory('AuthInterceptor', function ($rootScope, $q, AUTH_EVENTS) {
        var statusDict = {
            401: AUTH_EVENTS.notAuthenticated,
            403: AUTH_EVENTS.notAuthorized,
            419: AUTH_EVENTS.sessionTimeout,
            440: AUTH_EVENTS.sessionTimeout
        };
        return {
            responseError: function responseError(response) {
                $rootScope.$broadcast(statusDict[response.status], response);
                return $q.reject(response);
            }
        };
    });

    app.config(function ($httpProvider) {
        $httpProvider.interceptors.push(['$injector', function ($injector) {
            return $injector.get('AuthInterceptor');
        }]);
    });

    app.service('AuthService', function ($http, Session, $rootScope, AUTH_EVENTS, $q, $state) {
        function onSuccessfulLogin(response) {
            var data = response.data;
            Session.create(data.id, data.user);
            $rootScope.$broadcast(AUTH_EVENTS.loginSuccess);
            return data.user;
        }

        // Uses the session factory to see if an
        // authenticated user is currently registered.
        this.isAuthenticated = function () {
            return !!Session.user;
        };

        this.getLoggedInUser = function (fromServer) {

            // If an authenticated session exists, we
            // return the user attached to that session
            // with a promise. This ensures that we can
            // always interface with this method asynchronously.

            // Optionally, if true is given as the fromServer parameter,
            // then this cached value will not be used.

            if (this.isAuthenticated() && fromServer !== true) {
                return $q.when(Session.user);
            }

            // Make request GET /session.
            // If it returns a user, call onSuccessfulLogin with the response.
            // If it returns a 401 response, we catch it and instead resolve to null.
            return $http.get('/session').then(onSuccessfulLogin)['catch'](function () {
                return null;
            });
        };

        this.login = function (credentials) {
            return $http.post('/login', credentials).then(onSuccessfulLogin)['catch'](function () {
                return $q.reject({ message: 'Invalid login credentials.' });
            });
        };

        this.logout = function () {
            return $http.get('/logout').then(function () {
                Session.destroy();
                $rootScope.$broadcast(AUTH_EVENTS.logoutSuccess);
            });
        };
    });

    app.service('Session', function ($rootScope, AUTH_EVENTS) {

        var self = this;

        $rootScope.$on(AUTH_EVENTS.notAuthenticated, function () {
            self.destroy();
        });

        $rootScope.$on(AUTH_EVENTS.sessionTimeout, function () {
            self.destroy();
        });

        this.id = null;
        this.user = null;

        this.create = function (sessionId, user) {
            this.id = sessionId;
            this.user = user;
        };

        this.destroy = function () {
            this.id = null;
            this.user = null;
        };
    });
})();

app.config(function ($stateProvider) {
    $stateProvider.state('login', {
        url: '/login',
        templateUrl: 'js/auth/login.html',
        controller: 'LoginCtrl'
    });
});

app.controller('LoginCtrl', function ($scope, $state, AuthService, DialogFactory) {
    $scope.login = function () {
        var credentials = {
            email: $scope.email,
            password: $scope.password
        };
        AuthService.login(credentials).then(function (res) {
            $state.go('home');
        });
    };

    $scope.getUser = function () {
        AuthService.getLoggedInUser().then(function (user) {
            console.log('Login.js: logged in user', user);
        });
    };
});
app.controller('AlbumCtrl', function ($scope, $timeout, $state, AdminFactory, AlbumFactory, PhotosFactory, DialogFactory) {
    $scope.addingPictures = false;

    AlbumFactory.fetchAll().then(function (albums) {
        $scope.albums = albums;
        $scope.albumOne = $scope.albums[0];
    });

    PhotosFactory.fetchTen().then(function (photos) {
        $scope.photos = photos;
    });

    $scope.deleteAlbum = function (album) {
        AlbumFactory.deleteAlbum(album._id);
        var albumIndex = $scope.albums.indexOf(album);
        $scope.albums.splice(albumIndex, 1);
    };

    $scope.createAlbum = function () {
        var album = {
            title: $scope.newAlbum
        };
        AlbumFactory.createAlbum(album).then(function (album) {
            DialogFactory.display("Created");
        });
    };

    $scope.addPhotos = function (album) {
        $scope.selectingPictures = true;
        $scope.currentAlbum = album;
        PhotosFactory.fetchAll().then(function (photos) {
            $scope.photos = photos;
        });
    };

    $scope.viewAlbum = function (album) {};

    $scope.updateAlbum = function () {
        AlbumFactory.updateAlbum($scope.currentAlbum).then(function (res) {
            DialogFactory.display("Updated", 1500);
            $timeout(function () {
                $state.reload();
            }, 1000);
        });
    };

    $scope.viewAlbum = function (album) {
        $state.go('singleAlbum', { albumId: album._id });
    };

    $scope.addToAlbum = function (photo) {
        $scope.currentAlbum.photos.push(photo._id);
        DialogFactory.display("Added", 1000);
    };
});
app.factory('AlbumFactory', function ($http, $state, $timeout, DialogFactory) {
    var success = function success(text) {
        DialogFactory.display(text, 750);
    };
    return {
        createAlbum: function createAlbum(album) {
            return $http.post('/api/albums/', album).then(function (res) {
                success("created");
                console.log("res", res);
                return res.data;
            })['catch'](function (e) {
                console.error("error saving album", e);
            });
        },
        fetchAll: function fetchAll() {
            return $http.get('/api/albums/').then(function (res) {
                return res.data;
            });
        },
        updateAlbum: function updateAlbum(album) {
            return $http.post('/api/albums/update', album).then(function (res) {
                return res.data;
            });
        },
        fetchOne: function fetchOne(albumId) {
            return $http.get('/api/albums/' + albumId).then(function (res) {
                return res.data;
            });
        },
        findUserAlbums: function findUserAlbums(userId) {
            return $http.get('/api/albums/user/' + userId).then(function (res) {
                return res.data;
            });
        },
        addPhoto: function addPhoto(albumId, photoId) {
            var obj = {};
            obj.albumId = albumId;
            obj.photoId = photoId;
            return $http.post('/api/albums/addPhoto', obj).then(function (res) {
                return res.data;
            });
        },
        deleteAlbum: function deleteAlbum(albumId) {
            return $http['delete']('/api/albums/' + albumId);
        },
        fetchPhotosInAlbum: function fetchPhotosInAlbum(albumId) {
            return $http.get('/api/albums/photos/' + albumId).then(function (res) {
                console.log("res");
                return res.data;
            });
        }
    };
});
app.config(function ($stateProvider) {
    $stateProvider.state('album', {
        url: '/Album',
        templateUrl: 'js/album/album.html'

    });
});

app.config(function ($stateProvider) {
    $stateProvider.state('singleAlbum', {
        url: '/Album/:albumId',
        templateUrl: 'js/album/single-album.html',
        controller: 'SingleAlbumCtrl',
        resolve: {
            album: function album(AlbumFactory, $stateParams) {
                return AlbumFactory.fetchOne($stateParams.albumId);
            }
        }

    });
});

app.controller('AlbumsCtrl', function ($scope, $state, PhotosFactory, AlbumFactory, UserFactory, DialogFactory) {
    AlbumFactory.fetchAll().then(function (albums) {
        $scope.albums = albums;
        $scope.albumOne = $scope.albums[0];
    });

    $scope.viewAlbum = function (album) {
        $state.go('singleAlbum', { albumId: album._id });
    };

    $scope.followAlbum = function (album) {
        UserFactory.followAlbum(album);
    };

    $scope.createAlbum = function () {
        $state.go('newAlbum');
        // let album = {
        //     title: $scope.newAlbum
        // }
        // AlbumFactory.createAlbum(album).then(album => {
        //     DialogFactory.display("Created");
        // })
    };
});

app.config(function ($stateProvider) {
    $stateProvider.state('albums', {
        url: '/albums',
        templateUrl: 'js/album/albums.html',
        controller: 'AlbumsCtrl'
    });
});
app.config(function ($stateProvider) {
    $stateProvider.state('editAlbum', {
        url: '/editAlbum/:albumId',
        templateUrl: 'js/album/edit-album.html',
        controller: 'EditAlbumCtrl',
        resolve: {
            album: function album(AlbumFactory, $stateParams) {
                return AlbumFactory.fetchOne($stateParams.albumId);
            }
        }
    });
});

app.controller('EditAlbumCtrl', function ($scope, AlbumFactory, PhotosFactory, DialogFactory, album) {
    $scope.addingPictures = false;

    var setDate = function setDate() {
        album.date = new Date(album.date);
        $scope.album = album;
    };
    setDate();

    $scope.saveAlbum = function () {
        AlbumFactory.updateAlbum($scope.album).then(function (res) {
            $scope.album = res;
            $scope.selectingPictures = false;
            DialogFactory.display('Saved', 1000);
        });
    };

    $scope.addPhotos = function () {
        console.log('adding');
        PhotosFactory.fetchAll().then(function (photos) {
            console.log('photos', photos);
            $scope.selectingPictures = true;
            $scope.photos = photos;
        });
    };

    $scope.addToAlbum = function (photo) {
        console.log("added", photo);
        $scope.album.photos.push(photo._id);
        AlbumFactory.addPhoto(album._id, photo._id);
    };
});
app.controller('NewAlbumCtrl', function ($scope, $state, AlbumFactory, PhotosFactory, Session, DialogFactory, AuthService) {
    console.log('Session', Session);
    $scope.showPhotos = false;

    $scope.createAlbum = function () {
        if (Session.user) {
            $scope.album.owner = Session.user._id;
        }
        console.log($scope.album);

        AlbumFactory.createAlbum($scope.album);
    };

    $scope.addToAlbum = function (photo) {
        DialogFactory.display('Added', 750);
        $scope.album.photos.push(photo);
        $scope.album.cover = photo;
    };

    $scope.saveAlbum = function () {
        AlbumFactory.updateAlbum($scope.album).then(function (album) {
            $state.go('albums');
        });
    };
});
app.config(function ($stateProvider) {
    $stateProvider.state('newAlbum', {
        url: '/newAlbum',
        templateUrl: 'js/album/new-album.html',
        controller: 'NewAlbumCtrl'
    });
});

app.controller('SingleAlbumCtrl', function ($scope, $timeout, $state, album, AdminFactory, AlbumFactory, PhotosFactory) {
    $scope.album = album;
    $scope.selectingCover = false;
    $scope.changesMade = false;
    $scope.removePhotos = false;

    console.log("photos: ", album.photos);
    $scope.photos = album.photos;
    $scope.removeFromAlbum = function (photo) {
        var photoIndex = $scope.album.photos.indexOf(photo);
        $scope.album.photos.splice(photoIndex, 1);
    };

    $scope.deletePhotos = function () {
        $scope.removePhotos = true;
    };

    $scope.selectCover = function () {
        $timeout(function () {
            $scope.selectingCover = true;
            $scope.changesMade = true;
        }, 500);
    };

    $scope.addCover = function (photo) {
        $scope.album.cover = photo._id;
        $scope.selectingCover = false;
    };

    $scope.updateAlbum = function () {
        AlbumFactory.updateAlbum($scope.album).then(function (res) {
            $state.go('admin');
        });
    };

    $scope.fetchPhotos = function () {
        console.log("album: ", album);
        AlbumFactory.fetchPhotosInAlbum(album._id).then(function (album) {
            console.log("returned: ", album);
        });
    };
});
app.controller('CalendarCtrl', function ($scope, UserFactory, AuthService) {});
app.config(function ($stateProvider) {
    $stateProvider.state('calendar', {
        url: '/calendar',
        templateUrl: 'js/calendar/calendar.html',
        controller: 'CalendarCtrl'
    });
});
app.config(function ($stateProvider) {
    $stateProvider.state('layout', {
        url: '/layout',
        templateUrl: 'js/layout/layout.html',
        controller: 'LayoutCtrl',
        resolve: {
            albums: function albums(AlbumFactory, $stateParams) {
                return AlbumFactory.fetchAll();
            }
        }
    });
});

app.controller('LayoutCtrl', function ($scope, PhotosFactory, albums) {
    console.log("all albums", albums);
    $scope.albums = albums;
    $scope.getFiles = function () {
        console.log("getting Files");
        PhotosFactory.getFiles();
    };
});
app.controller('HomeCtrl', function ($scope, homePhotos, PhotosFactory) {
    $scope.updateAll = function () {
        PhotosFactory.updateAll();
    };

    $scope.getRandom = function () {};

    $scope.slidePhotos = homePhotos;

    $(document).ready(function () {

        $("#owl-demo").owlCarousel({

            autoPlay: 3000, //Set AutoPlay to 3 seconds

            items: 3

        });
    });
});
app.config(function ($stateProvider) {
    $stateProvider.state('home', {
        url: '/',
        templateUrl: '/js/home/home.html',
        controller: 'HomeCtrl',
        resolve: {
            homePhotos: function homePhotos(PhotosFactory) {
                return PhotosFactory.getRandom(10);
            }
        }

    });
});
app.controller('PhotoCtrl', function ($scope, $state, PhotosFactory, AlbumFactory, UserFactory, photos) {
    var albumArray = [];
    $scope.title = "Welcome";
    $scope.photosGot = false;
    $scope.uploadPage = function () {
        $state.go('addphoto');
    };

    // AlbumFactory.fetchAll()
    //     .then(albums => {
    //         $scope.albums = albums;
    //     })
    // PhotosFactory.fetchAll().then(photos => {
    //     $scope.photos = photos;
    // })
    console.log(photos);

    $scope.photos = photos;

    $scope.addPhotos = function () {
        for (var i = 1; i <= 44; i++) {
            var src = '/image/IMG_' + i + '.jpg';
            PhotosFactory.addPhoto(src);
        }
    };

    $scope.fetchAll = function () {
        PhotosFactory.fetchAll().then(function (photos) {
            $scope.photos = photos;
        });
    };

    $scope.createAlbum = function () {
        $scope.newAlbum = {
            title: $scope.albumName,
            photos: ['image/IMG_1.jpg']
        };
        PhotosFactory.createAlbum($scope.newAlbum);
    };

    $scope.getAlbums = function () {
        PhotosFactory.fetchAlbums().then(function (albums) {
            $scope.albums = albums;
        });
    };

    $scope.addToAlbum = function (photo) {
        albumArray.push(photo);
    };

    $scope.saveAlbum = function () {};

    $scope.followPhoto = function (photo) {
        UserFactory.followPhoto(photo);
    };
});
app.factory('PhotosFactory', function ($http) {
    return {
        addPhoto: function addPhoto(src) {
            var photo = {
                src: src,
                name: 'test'
            };
            $http.post('/api/photos/add', photo).then(function (res) {});
        },
        savePhoto: function savePhoto(photo) {
            $http.post('/api/photos/update', photo).then(function (res) {
                console.log(res.data);
            });
        },
        fetchAll: function fetchAll() {
            return $http.get('/api/photos').then(function (res) {
                return res.data;
            });
        },
        fetchTen: function fetchTen() {
            return $http.get('/api/photos/limit10').then(function (res) {
                return res.data;
            });
        },
        getFiles: function getFiles() {
            $http.get('/api/getFiles/albumA').then(function (res) {
                console.log("Returned: ", res.data);
            });
        },
        updateAll: function updateAll() {
            $http.put('/api/photos/updateAll').then(function (res) {
                console.log("res: ", res.data);
            });
        },
        getRandom: function getRandom(amount) {
            return $http.get('/api/photos/random/' + amount).then(function (res) {
                console.log("res: ", res.data);
                return res.data;
            });
        }
    };
});
app.controller('UploadPhotoCtrl', function ($scope, $state, PhotosFactory, AlbumFactory, FileUploader) {
    AlbumFactory.fetchAll().then(function (albums) {
        $scope.albums = albums;
    });

    $scope.createAlbum = function () {
        var album = {
            title: $scope.newAlbum
        };
        AlbumFactory.createAlbum(album).then(function (album) {
            $scope.albums.push(album);
            $scope.photoAlbum = album._id;
        });
    };

    var uploader = $scope.uploader = new FileUploader({
        url: '/api/photos/uploadAWS'
    });
    uploader.filters.push({
        name: 'imageFilter',
        fn: function fn(item, /*{File|FileLikeObject}*/options) {
            var type = '|' + item.type.slice(item.type.lastIndexOf('/') + 1) + '|';
            return '|jpg|png|jpeg|bmp|gif|'.indexOf(type) !== -1;
        }
    });
    var count = 1;
    uploader.onWhenAddingFileFailed = function (item, /*{File|FileLikeObject}*/filter, options) {
        console.info('onWhenAddingFileFailed', item, filter, options);
    };
    uploader.onAfterAddingFile = function (fileItem) {
        // console.info('onAfterAddingFile', fileItem);
        var photoInfo = {
            title: $scope.title + '-' + count,
            album: $scope.photoAlbum
        };
        fileItem.formData.push(photoInfo);
        count++;
        console.log('file', fileItem);
    };
    uploader.onAfterAddingAll = function (addedFileItems) {
        console.info('onAfterAddingAll', addedFileItems);
    };
    uploader.onBeforeUploadItem = function (item) {
        console.info('onBeforeUploadItem', item);
    };
    uploader.onProgressItem = function (fileItem, progress) {
        console.info('onProgressItem', fileItem, progress);
    };
    uploader.onProgressAll = function (progress) {
        console.info('onProgressAll', progress);
    };
    uploader.onSuccessItem = function (fileItem, response, status, headers) {
        console.info('onSuccessItem', fileItem, response, status, headers);
    };
    uploader.onErrorItem = function (fileItem, response, status, headers) {
        console.info('onErrorItem', fileItem, response, status, headers);
    };
    uploader.onCancelItem = function (fileItem, response, status, headers) {
        console.info('onCancelItem', fileItem, response, status, headers);
    };
    uploader.onCompleteItem = function (fileItem, response, status, headers) {
        console.info('onCompleteItem', fileItem, response, status, headers);
    };
    uploader.onCompleteAll = function () {
        console.info('onCompleteAll');
        // $scope.finish();
    };
});
app.config(function ($stateProvider) {
    $stateProvider.state('photos', {
        url: '/photos',
        templateUrl: 'js/photos/photos.html',
        controller: 'PhotoCtrl',
        resolve: {
            photos: function photos(PhotosFactory, $stateParams) {
                return PhotosFactory.fetchAll();
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

app.controller('SignupCtrl', function ($scope, $rootScope, UserFactory) {
    $scope.user = {};
    $scope.submit = function () {
        UserFactory.createUser($scope.user).then(function (user) {
            $rootScope.user = user;
        });
    };
});
app.config(function ($stateProvider) {
    $stateProvider.state('signup', {
        url: '/signup',
        templateUrl: 'js/signup/signup.html',
        controller: 'SignupCtrl'
    });
});
app.controller('UploadCtrl', function ($scope, $state, albums, PhotosFactory, AlbumFactory, FileUploader) {
    // AlbumFactory.fetchAll().then(albums => {
    //        $scope.albums = albums;
    //    })
    var albumCreated = false;
    var addToAlbum = undefined;
    console.log("albums: ", albums);
    $scope.newAlbum = false;
    $scope.photoAlbum = null;
    $scope.albums = albums;
    $scope.createAlbum = function () {
        var album = {
            title: $scope.newAlbumTitle
        };
        AlbumFactory.createAlbum(album).then(function (album) {
            $scope.albums.push(album);
            $scope.photoAlbum = album;
            albumCreated = album;
        });
    };
    $scope.checkAlbum = function () {
        if (albumCreated) {
            addToAlbum = albumCreated;
        } else {
            addToAlbum = $scope.photoAlbum;
        }
        console.log("photo album: ", addToAlbum);
    };
    // var galleryUploader = new qq.FineUploader({
    //         element: document.getElementById("fine-uploader-gallery"),
    //         template: 'qq-template-gallery',
    //         request: {
    //             endpoint: '/api/upload/photo'
    //         },
    //         thumbnails: {
    //             placeholders: {
    //                 waitingPath: '/assets/placeholders/waiting-generic.png',
    //                 notAvailablePath: '/assets/placeholders/not_available-generic.png'
    //             }
    //         },
    //         validation: {
    //             allowedExtensions: ['jpeg', 'jpg', 'gif', 'png']
    //         }
    //     });
});
app.config(function ($stateProvider) {
    $stateProvider.state('upload', {
        url: '/upload',
        templateUrl: 'js/upload/upload.html',
        controller: 'UploadCtrl',
        resolve: {
            albums: function albums(AlbumFactory) {
                return AlbumFactory.fetchAll().then(function (albums) {
                    return albums;
                });
            }
        }
    });
});

app.factory('DialogFactory', function ($http, $mdDialog, $timeout) {

    var showDialog = function showDialog(message) {
        var parentEl = angular.element(document.body);
        $mdDialog.show({
            parent: parentEl,
            template: '<md-dialog aria-label="List dialog" id="dialog">' + '  <md-dialog-content>' + message + '  </md-dialog-content>' + '</md-dialog>'
        });
    };

    return {
        display: function display(message, timeout) {
            showDialog(message);
            $timeout(function () {
                $mdDialog.hide();
            }, timeout);
        }
    };
});
app.factory('UserFactory', function ($http, $rootScope, DialogFactory) {
    return {
        currentUser: function currentUser() {
            var user = {
                name: 'Dane',
                picture: 'Something',
                albums: ['One', 'Two', 'Three']
            };
            return user;
            //send request for current logged-in user
        },
        createUser: function createUser(user) {
            return $http.post('/api/users/', user).then(function (res) {
                return res.data;
            });
        },
        getUser: function getUser() {
            var username = 'danetomseth';
            return $http.get('/api/users/' + username).then(function (res) {
                $rootScope.user = res.data;
                return res.data;
            });
        },

        //User settings
        // followAlbum: (albumId) => {
        // 	let body = {
        // 		albumId: albumId,
        // 		userId: $rootScope.user._id
        // 	}
        // 	$http.post('/api/users/album', body).then(res => {
        // 		if(res.status === 200) {
        // 			DialogFactory.display('Added To Albums', 1000)
        // 		}
        // 		else {
        // 			DialogFactory.display('Status not 200', 1000)
        // 		}
        // 	})
        // }
        followAlbum: function followAlbum(album) {
            var user = $rootScope.user;
            if (user.albums.indexOf() !== -1) {
                console.log('album already exists');
            }
            user.albums.push(album);

            $http.post('/api/users/update', user).then(function (res) {
                if (res.status === 200) {
                    DialogFactory.display('Added To Albums', 1000);
                } else {
                    DialogFactory.display('Status not 200', 1000);
                }
            });
        },
        followPhoto: function followPhoto(photo) {
            var user = $rootScope.user;
            if (user.photos.indexOf() !== -1) {
                console.log('Photo already exists');
            }
            user.photos.push(photo);

            $http.post('/api/users/update', user).then(function (res) {
                if (res.status === 200) {
                    DialogFactory.display('Added To Photos', 1000);
                } else {
                    DialogFactory.display('Status not 200', 1000);
                }
            });
        }
    };
});
app.directive('ztSetSize', function () {
    return {
        restrict: 'A',
        link: function link(scope, element, attr) {
            console.log("attributes: ", element[0].clientWidth);
            var width = element[0].clientWidth * 0.66 + 'px';
            element.css({
                height: width
            });
        }
    };
});
app.directive('albumCard', function ($rootScope, $state) {
    return {
        restrict: 'E',
        controller: 'AlbumsCtrl',
        scope: {
            album: '='
        },
        templateUrl: 'js/common/directives/albums/album-card.html',
        link: function link(scope) {
            scope.editAlbum = function () {
                $state.go('editAlbum', { albumId: scope.album._id });
            };

            scope.viewAlbum = function () {
                $state.go('singleAlbum', { albumId: scope.album._id });
            };

            scope.addToFavorites = function () {
                console.log("call user here");
            };
        }
    };
});
app.directive('selectAlbum', function ($rootScope) {
    return {
        restrict: 'E',
        controller: 'AlbumsCtrl',
        templateUrl: 'js/common/directives/albums/album.html',
        link: function link(scope) {}
    };
});
app.directive('userAlbums', function ($rootScope, $state) {
    return {
        restrict: 'E',
        templateUrl: 'js/common/directives/albums/user-albums.html',
        link: function link(scope) {
            scope.editAlbum = function () {
                $state.go('editAlbum', { albumId: scope.album._id });
            };

            scope.addToFavorites = function () {
                console.log("call user here");
            };
        }
    };
});
app.directive('banner', function ($rootScope, $state, Session, UserFactory, AlbumFactory, AuthService) {
    return {
        restrict: 'E',
        templateUrl: 'js/common/directives/banner/banner.html',
        link: function link(scope) {
            // UserFactory.getUser().then(user => {
            //     scope.user = user;
            //     return AlbumFactory.findUserAlbums(user._id)
            // }).then(albums => {
            //     scope.user.albums.push(albums);
            //     console.log(scope.user.albums);
            // })

            UserFactory.getUser().then(function (user) {
                scope.user = user;
                console.log(scope.user);

                return AlbumFactory.findUserAlbums(user._id);
            }).then(function (albums) {
                scope.userAlbums = albums;
                if (scope.user.albums.length) {
                    scope.userAlbums.push(scope.user.albums);
                }
                console.log(scope.userAlbums);
            });

            // AlbumFactory.findUserAlbums(Session.user._id)
            // .then(albums => {
            //     scope.userAlbums = albums;
            //     console.log(scope.userAlbums);
            // })

            AuthService.getLoggedInUser().then(function (user) {
                if (user) {
                    scope.user = user;
                } else {
                    scope.user = {
                        first: 'Guest',
                        last: ''
                    };
                }
            });
            scope.showAlbums = false;
            scope.showPictures = false;

            scope.addAlbums = function () {
                scope.showAlbums = true;
            };

            scope.addPictures = function () {
                scope.showPictures = true;
            };

            scope.viewAlbum = function (album) {
                $state.go('singleAlbum', {
                    albumId: album._id
                });
            };
        }
    };
});
app.directive('navbar', function ($rootScope, AuthService, AUTH_EVENTS, $state) {

    return {
        restrict: 'E',
        scope: {},
        templateUrl: 'js/common/directives/navbar/navbar.html',
        link: function link(scope) {

            $rootScope.$on('$stateChangeSuccess', function (event, toState, toParams, fromState, fromParams) {
                scope.currentPage = toState.name;
            });

            scope.items = [{
                label: 'Home',
                state: 'home'
            }, {
                label: 'Photos',
                state: 'photos'
            }, {
                label: 'Albums',
                state: 'albums'
            }, {
                label: 'Upload',
                state: 'upload'
            }, {
                label: 'New Album',
                state: 'newAlbum'
            }, {
                label: 'Admin',
                state: 'admin'
            }];

            scope.user = null;

            scope.isLoggedIn = function () {
                return AuthService.isAuthenticated();
            };

            scope.logout = function () {
                AuthService.logout().then(function () {
                    $state.go('home');
                });
            };

            var setUser = function setUser() {
                AuthService.getLoggedInUser().then(function (user) {
                    scope.user = user;
                });
            };

            var removeUser = function removeUser() {
                scope.user = null;
            };

            setUser();

            $rootScope.$on(AUTH_EVENTS.loginSuccess, setUser);
            $rootScope.$on(AUTH_EVENTS.logoutSuccess, removeUser);
            $rootScope.$on(AUTH_EVENTS.sessionTimeout, removeUser);
        }

    };
});

app.directive('newAlbumSelect', function ($rootScope) {
    return {
        restrict: 'E',
        controller: 'NewAlbumCtrl',
        templateUrl: 'js/common/directives/photo/new-album-select.html',
        link: function link(scope) {}
    };
});
app.directive('photoEdit', function (PhotosFactory) {
    return {
        restrict: 'E',
        templateUrl: 'js/common/directives/photo/photo-edit.html',
        link: function link(scope, elem, attr) {
            scope.savePhoto = function () {
                PhotosFactory.savePhoto(scope.photo);
            };
        }
    };
});
app.directive('photoGrid', function ($rootScope) {
    return {
        restrict: 'E',
        scope: {
            gridPhotos: '=photos'
        },
        controller: 'PhotoCtrl',
        templateUrl: 'js/common/directives/photo/photo-grid.html',
        link: function link(scope) {
            console.log(scope.gridPhotos);
        }
    };
});
app.directive('selectPictures', function ($rootScope) {
    return {
        restrict: 'E',
        controller: 'PhotoCtrl',
        templateUrl: 'js/common/directives/photo/select-photo.html',
        link: function link(scope) {}
    };
});
app.directive('singlePhoto', function ($rootScope, $state) {
    return {
        restrict: 'E',
        scope: {
            photo: '='
        },
        templateUrl: 'js/common/directives/photo/single-photo.html',
        link: function link(scope) {
            scope.viewPhoto = function () {
                console.log(scope.photo);
                // $state.go('editphoto', {photoId: scope.photo._id});
            };
        }
    };
});
app.directive('uploader', function () {
    return {
        restrict: 'E',
        templateUrl: 'js/common/directives/upload/upload.html',
        link: function link(scope, elem, attr) {
            var galleryUploader = new qq.FineUploader({
                element: document.getElementById("fine-uploader-gallery"),
                template: 'qq-template-gallery',
                request: {
                    endpoint: '/api/upload/photo'
                },
                thumbnails: {
                    placeholders: {
                        waitingPath: '/assets/placeholders/waiting-generic.png',
                        notAvailablePath: '/assets/placeholders/not_available-generic.png'
                    }
                },
                validation: {
                    allowedExtensions: ['jpeg', 'jpg', 'gif', 'png']
                }
            });
        }
    };
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImFkbWluL2FkbWluLWNvbnRyb2xsZXIuanMiLCJhZG1pbi9hZG1pbi1mYWN0b3J5LmpzIiwiYWRtaW4vYWRtaW4uanMiLCJhdXRoL2F1dGguanMiLCJhdXRoL2xvZ2luLmpzIiwiYWxidW0vYWxidW0tY29udHJvbGxlci5qcyIsImFsYnVtL2FsYnVtLWZhY3RvcnkuanMiLCJhbGJ1bS9hbGJ1bS5qcyIsImFsYnVtL2FsYnVtcy1jb250cm9sbGVyLmpzIiwiYWxidW0vYWxidW1zLmpzIiwiYWxidW0vZWRpdC1hbGJ1bS5qcyIsImFsYnVtL25ldy1hbGJ1bS1jb250cm9sbGVyLmpzIiwiYWxidW0vbmV3LWFsYnVtLmpzIiwiYWxidW0vc2luZ2xlLWFsYnVtLWNvbnRyb2xsZXIuanMiLCJjYWxlbmRhci9jYWxlbmRhci1jb250cm9sbGVyLmpzIiwiY2FsZW5kYXIvY2FsZW5kYXIuanMiLCJsYXlvdXQvbGF5b3V0LmpzIiwiaG9tZS9ob21lLmNvbnRyb2xsZXIuanMiLCJob21lL2hvbWUuanMiLCJwaG90b3MvcGhvdG9zLWNvbnRyb2xsZXIuanMiLCJwaG90b3MvcGhvdG9zLWZhY3RvcnkuanMiLCJwaG90b3MvcGhvdG9zLXVwbG9hZC1jb250cm9sbGVyLmpzIiwicGhvdG9zL3Bob3Rvcy5qcyIsInNpZ251cC9zaWdudXAtY29udHJvbGxlci5qcyIsInNpZ251cC9zaWdudXAuanMiLCJ1cGxvYWQvdXBsb2FkLmNvbnRyb2xsZXIuanMiLCJ1cGxvYWQvdXBsb2FkLmpzIiwiY29tbW9uL2RpYWxvZy9kaWFsb2ctZmFjdG9yeS5qcyIsImNvbW1vbi9mYWN0b3JpZXMvdXNlci1mYWN0b3J5LmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvc2V0U2l6ZS5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL2FsYnVtcy9hbGJ1bS1jYXJkLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvYWxidW1zL2FsYnVtLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvYWxidW1zL3VzZXItYWxidW1zLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvYmFubmVyL2Jhbm5lci5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL25hdmJhci9uYXZiYXIuanMiLCJjb21tb24vZGlyZWN0aXZlcy9waG90by9uZXctYWxidW0tc2VsZWN0LmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvcGhvdG8vcGhvdG8tZWRpdC5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL3Bob3RvL3Bob3RvLWdyaWQuanMiLCJjb21tb24vZGlyZWN0aXZlcy9waG90by9zZWxlY3QtcGhvdG8uanMiLCJjb21tb24vZGlyZWN0aXZlcy9waG90by9zaW5nbGUtcGhvdG8uanMiLCJjb21tb24vZGlyZWN0aXZlcy91cGxvYWQvdXBsb2FkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQUEsQ0FBQTtBQUNBLE1BQUEsQ0FBQSxHQUFBLEdBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLEVBQUEsQ0FBQSxhQUFBLEVBQUEsbUJBQUEsRUFBQSxXQUFBLEVBQUEsY0FBQSxFQUFBLFdBQUEsRUFBQSxtQkFBQSxFQUFBLFlBQUEsRUFBQSxrQkFBQSxDQUFBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsa0JBQUEsRUFBQSxpQkFBQSxFQUFBLGtCQUFBLEVBQUE7O0FBRUEscUJBQUEsQ0FBQSxTQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7O0FBRUEsc0JBQUEsQ0FBQSxTQUFBLENBQUEsR0FBQSxDQUFBLENBQUE7QUFDQSxRQUFBLGFBQUEsR0FBQTtBQUNBLFlBQUEsRUFBQSxTQUFBO0FBQ0EsYUFBQSxFQUFBLFNBQUE7QUFDQSxhQUFBLEVBQUEsU0FBQTtBQUNBLGFBQUEsRUFBQSxTQUFBO0FBQ0EsYUFBQSxFQUFBLFNBQUE7QUFDQSxhQUFBLEVBQUEsU0FBQTtBQUNBLGFBQUEsRUFBQSxTQUFBO0FBQ0EsYUFBQSxFQUFBLFNBQUE7QUFDQSxhQUFBLEVBQUEsU0FBQTtBQUNBLGFBQUEsRUFBQSxTQUFBO0FBQ0EsY0FBQSxFQUFBLFNBQUE7QUFDQSxjQUFBLEVBQUEsU0FBQTtBQUNBLGNBQUEsRUFBQSxTQUFBO0FBQ0EsY0FBQSxFQUFBLFNBQUE7S0FDQSxDQUFBOztBQUdBLHNCQUFBLENBQUEsS0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUNBLGNBQUEsQ0FBQSxNQUFBLENBQUEsQ0FDQSxhQUFBLENBQUEsYUFBQSxDQUFBLENBQ0EsV0FBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOzs7QUFHQSxHQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUE7OztBQUdBLFFBQUEsNEJBQUEsR0FBQSxTQUFBLDRCQUFBLENBQUEsS0FBQSxFQUFBO0FBQ0EsZUFBQSxLQUFBLENBQUEsSUFBQSxJQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBO0tBQ0EsQ0FBQTs7OztBQUlBLGNBQUEsQ0FBQSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUEsUUFBQSxFQUFBOztBQUVBLFlBQUEsQ0FBQSw0QkFBQSxDQUFBLE9BQUEsQ0FBQSxFQUFBOzs7QUFHQSxtQkFBQTtTQUNBOztBQUVBLFlBQUEsV0FBQSxDQUFBLGVBQUEsRUFBQSxFQUFBOzs7QUFHQSxtQkFBQTtTQUNBOzs7QUFHQSxhQUFBLENBQUEsY0FBQSxFQUFBLENBQUE7O0FBRUEsbUJBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7Ozs7Ozs7Ozs7U0FVQSxDQUFBLENBQUE7S0FFQSxDQUFBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDekVBLEdBQUEsQ0FBQSxVQUFBLENBQUEsV0FBQSxFQUFBLFVBQUEsTUFBQSxFQUFBLE1BQUEsRUFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBLGFBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxjQUFBLEdBQUEsS0FBQSxDQUFBOztBQUVBLGdCQUFBLENBQUEsUUFBQSxFQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsTUFBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLEdBQUEsQ0FBQSxTQUFBLEVBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsTUFBQSxHQUFBLE1BQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxRQUFBLEdBQUEsTUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTs7QUFFQSxpQkFBQSxDQUFBLFFBQUEsRUFBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLE1BQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxNQUFBLEdBQUEsTUFBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxXQUFBLEdBQUEsVUFBQSxLQUFBLEVBQUE7QUFDQSxvQkFBQSxDQUFBLFdBQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxDQUFBLENBQUE7QUFDQSxZQUFBLFVBQUEsR0FBQSxNQUFBLENBQUEsTUFBQSxDQUFBLE9BQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsRUFBQSxDQUFBLENBQUEsQ0FBQTtLQUNBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFdBQUEsR0FBQSxZQUFBO0FBQ0EsWUFBQSxLQUFBLEdBQUE7QUFDQSxpQkFBQSxFQUFBLE1BQUEsQ0FBQSxRQUFBO1NBQ0EsQ0FBQTtBQUNBLG9CQUFBLENBQUEsV0FBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsTUFBQSxDQUFBLElBQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsUUFBQSxHQUFBLEVBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFNBQUEsR0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxpQkFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxZQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EscUJBQUEsQ0FBQSxRQUFBLEVBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxNQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLE1BQUEsR0FBQSxNQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxTQUFBLEdBQUEsVUFBQSxLQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsRUFBQSxDQUFBLGFBQUEsRUFBQSxFQUFBLE9BQUEsRUFBQSxLQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtLQUNBLENBQUE7O0FBR0EsVUFBQSxDQUFBLFdBQUEsR0FBQSxZQUFBO0FBQ0Esb0JBQUEsQ0FBQSxXQUFBLENBQUEsTUFBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsTUFBQSxFQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxZQUFBLEdBQUEsWUFBQTtBQUNBLGNBQUEsQ0FBQSxFQUFBLENBQUEsY0FBQSxDQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxVQUFBLEdBQUEsVUFBQSxLQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxJQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTtBQzFEQSxHQUFBLENBQUEsT0FBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLFdBQUEsRUFFQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBO0FDSkEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGNBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxDQUFBLE9BQUEsRUFBQTtBQUNBLFdBQUEsRUFBQSxRQUFBO0FBQ0EsbUJBQUEsRUFBQSxxQkFBQTtBQUNBLGtCQUFBLEVBQUEsV0FBQTtBQUNBLFlBQUEsRUFBQTtBQUNBLHdCQUFBLEVBQUEsSUFBQTtTQUNBO0tBQ0EsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBO0FDVEEsQ0FBQSxZQUFBOztBQUVBLGdCQUFBLENBQUE7OztBQUdBLFFBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxFQUFBLE1BQUEsSUFBQSxLQUFBLENBQUEsd0JBQUEsQ0FBQSxDQUFBOztBQUVBLFFBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsYUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxPQUFBLENBQUEsUUFBQSxFQUFBLFlBQUE7QUFDQSxZQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsRUFBQSxNQUFBLElBQUEsS0FBQSxDQUFBLHNCQUFBLENBQUEsQ0FBQTtBQUNBLGVBQUEsTUFBQSxDQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBOzs7OztBQUtBLE9BQUEsQ0FBQSxRQUFBLENBQUEsYUFBQSxFQUFBO0FBQ0Esb0JBQUEsRUFBQSxvQkFBQTtBQUNBLG1CQUFBLEVBQUEsbUJBQUE7QUFDQSxxQkFBQSxFQUFBLHFCQUFBO0FBQ0Esc0JBQUEsRUFBQSxzQkFBQTtBQUNBLHdCQUFBLEVBQUEsd0JBQUE7QUFDQSxxQkFBQSxFQUFBLHFCQUFBO0tBQ0EsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxPQUFBLENBQUEsaUJBQUEsRUFBQSxVQUFBLFVBQUEsRUFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBO0FBQ0EsWUFBQSxVQUFBLEdBQUE7QUFDQSxlQUFBLEVBQUEsV0FBQSxDQUFBLGdCQUFBO0FBQ0EsZUFBQSxFQUFBLFdBQUEsQ0FBQSxhQUFBO0FBQ0EsZUFBQSxFQUFBLFdBQUEsQ0FBQSxjQUFBO0FBQ0EsZUFBQSxFQUFBLFdBQUEsQ0FBQSxjQUFBO1NBQ0EsQ0FBQTtBQUNBLGVBQUE7QUFDQSx5QkFBQSxFQUFBLHVCQUFBLFFBQUEsRUFBQTtBQUNBLDBCQUFBLENBQUEsVUFBQSxDQUFBLFVBQUEsQ0FBQSxRQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsUUFBQSxDQUFBLENBQUE7QUFDQSx1QkFBQSxFQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO2FBQ0E7U0FDQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxhQUFBLEVBQUE7QUFDQSxxQkFBQSxDQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsQ0FDQSxXQUFBLEVBQ0EsVUFBQSxTQUFBLEVBQUE7QUFDQSxtQkFBQSxTQUFBLENBQUEsR0FBQSxDQUFBLGlCQUFBLENBQUEsQ0FBQTtTQUNBLENBQ0EsQ0FBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxPQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUE7QUFDQSxpQkFBQSxpQkFBQSxDQUFBLFFBQUEsRUFBQTtBQUNBLGdCQUFBLElBQUEsR0FBQSxRQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsbUJBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEVBQUEsRUFBQSxJQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxzQkFBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLENBQUE7QUFDQSxtQkFBQSxJQUFBLENBQUEsSUFBQSxDQUFBO1NBQ0E7Ozs7QUFJQSxZQUFBLENBQUEsZUFBQSxHQUFBLFlBQUE7QUFDQSxtQkFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQTtTQUNBLENBQUE7O0FBRUEsWUFBQSxDQUFBLGVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTs7Ozs7Ozs7OztBQVVBLGdCQUFBLElBQUEsQ0FBQSxlQUFBLEVBQUEsSUFBQSxVQUFBLEtBQUEsSUFBQSxFQUFBO0FBQ0EsdUJBQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7YUFDQTs7Ozs7QUFLQSxtQkFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsdUJBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBRUEsQ0FBQTs7QUFFQSxZQUFBLENBQUEsS0FBQSxHQUFBLFVBQUEsV0FBQSxFQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxRQUFBLEVBQUEsV0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLGlCQUFBLENBQUEsU0FDQSxDQUFBLFlBQUE7QUFDQSx1QkFBQSxFQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsT0FBQSxFQUFBLDRCQUFBLEVBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0EsQ0FBQTs7QUFFQSxZQUFBLENBQUEsTUFBQSxHQUFBLFlBQUE7QUFDQSxtQkFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsdUJBQUEsQ0FBQSxPQUFBLEVBQUEsQ0FBQTtBQUNBLDBCQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBLENBQUE7S0FFQSxDQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLE9BQUEsQ0FBQSxTQUFBLEVBQUEsVUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBOztBQUVBLFlBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxrQkFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsZ0JBQUEsRUFBQSxZQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxPQUFBLEVBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTs7QUFFQSxrQkFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsY0FBQSxFQUFBLFlBQUE7QUFDQSxnQkFBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxFQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsWUFBQSxDQUFBLE1BQUEsR0FBQSxVQUFBLFNBQUEsRUFBQSxJQUFBLEVBQUE7QUFDQSxnQkFBQSxDQUFBLEVBQUEsR0FBQSxTQUFBLENBQUE7QUFDQSxnQkFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7U0FDQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxPQUFBLEdBQUEsWUFBQTtBQUNBLGdCQUFBLENBQUEsRUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLGdCQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtTQUNBLENBQUE7S0FFQSxDQUFBLENBQUE7Q0FFQSxDQUFBLEVBQUEsQ0FBQTs7QUNuSUEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGNBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxDQUFBLE9BQUEsRUFBQTtBQUNBLFdBQUEsRUFBQSxRQUFBO0FBQ0EsbUJBQUEsRUFBQSxvQkFBQTtBQUNBLGtCQUFBLEVBQUEsV0FBQTtLQUNBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxNQUFBLEVBQUEsV0FBQSxFQUFBLGFBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxLQUFBLEdBQUEsWUFBQTtBQUNBLFlBQUEsV0FBQSxHQUFBO0FBQ0EsaUJBQUEsRUFBQSxNQUFBLENBQUEsS0FBQTtBQUNBLG9CQUFBLEVBQUEsTUFBQSxDQUFBLFFBQUE7U0FDQSxDQUFBO0FBQ0EsbUJBQUEsQ0FBQSxLQUFBLENBQUEsV0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxPQUFBLEdBQUEsWUFBQTtBQUNBLG1CQUFBLENBQUEsZUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EsbUJBQUEsQ0FBQSxHQUFBLENBQUEsMEJBQUEsRUFBQSxJQUFBLENBQUEsQ0FBQTtTQUVBLENBQUEsQ0FBQTtLQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUN6QkEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsUUFBQSxFQUFBLE1BQUEsRUFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBLGFBQUEsRUFBQSxhQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsY0FBQSxHQUFBLEtBQUEsQ0FBQTs7QUFFQSxnQkFBQSxDQUFBLFFBQUEsRUFBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLE1BQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxNQUFBLEdBQUEsTUFBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLFFBQUEsR0FBQSxNQUFBLENBQUEsTUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBOztBQUVBLGlCQUFBLENBQUEsUUFBQSxFQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsTUFBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLE1BQUEsR0FBQSxNQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFdBQUEsR0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLG9CQUFBLENBQUEsV0FBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTtBQUNBLFlBQUEsVUFBQSxHQUFBLE1BQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxFQUFBLENBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTs7QUFFQSxVQUFBLENBQUEsV0FBQSxHQUFBLFlBQUE7QUFDQSxZQUFBLEtBQUEsR0FBQTtBQUNBLGlCQUFBLEVBQUEsTUFBQSxDQUFBLFFBQUE7U0FDQSxDQUFBO0FBQ0Esb0JBQUEsQ0FBQSxXQUFBLENBQUEsS0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsS0FBQSxFQUFBO0FBQ0EseUJBQUEsQ0FBQSxPQUFBLENBQUEsU0FBQSxDQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxTQUFBLEdBQUEsVUFBQSxLQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsaUJBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsWUFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLHFCQUFBLENBQUEsUUFBQSxFQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsTUFBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxNQUFBLEdBQUEsTUFBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTs7QUFFQSxVQUFBLENBQUEsU0FBQSxHQUFBLFVBQUEsS0FBQSxFQUFBLEVBRUEsQ0FBQTs7QUFHQSxVQUFBLENBQUEsV0FBQSxHQUFBLFlBQUE7QUFDQSxvQkFBQSxDQUFBLFdBQUEsQ0FBQSxNQUFBLENBQUEsWUFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EseUJBQUEsQ0FBQSxPQUFBLENBQUEsU0FBQSxFQUFBLElBQUEsQ0FBQSxDQUFBO0FBQ0Esb0JBQUEsQ0FBQSxZQUFBO0FBQ0Esc0JBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQTthQUNBLEVBQUEsSUFBQSxDQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxTQUFBLEdBQUEsVUFBQSxLQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsRUFBQSxDQUFBLGFBQUEsRUFBQSxFQUFBLE9BQUEsRUFBQSxLQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtLQUNBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLElBQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxDQUFBLENBQUE7QUFDQSxxQkFBQSxDQUFBLE9BQUEsQ0FBQSxPQUFBLEVBQUEsSUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBO0NBSUEsQ0FBQSxDQUFBO0FDL0RBLEdBQUEsQ0FBQSxPQUFBLENBQUEsY0FBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE1BQUEsRUFBQSxRQUFBLEVBQUEsYUFBQSxFQUFBO0FBQ0EsUUFBQSxPQUFBLEdBQUEsU0FBQSxPQUFBLENBQUEsSUFBQSxFQUFBO0FBQ0EscUJBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxFQUFBLEdBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtBQUNBLFdBQUE7QUFDQSxtQkFBQSxFQUFBLHFCQUFBLEtBQUEsRUFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsY0FBQSxFQUFBLEtBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLHVCQUFBLENBQUEsU0FBQSxDQUFBLENBQUE7QUFDQSx1QkFBQSxDQUFBLEdBQUEsQ0FBQSxLQUFBLEVBQUEsR0FBQSxDQUFBLENBQUE7QUFDQSx1QkFBQSxHQUFBLENBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQSxTQUNBLENBQUEsVUFBQSxDQUFBLEVBQUE7QUFDQSx1QkFBQSxDQUFBLEtBQUEsQ0FBQSxvQkFBQSxFQUFBLENBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBRUE7QUFDQSxnQkFBQSxFQUFBLG9CQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxjQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSx1QkFBQSxHQUFBLENBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7QUFDQSxtQkFBQSxFQUFBLHFCQUFBLEtBQUEsRUFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsb0JBQUEsRUFBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSx1QkFBQSxHQUFBLENBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7QUFDQSxnQkFBQSxFQUFBLGtCQUFBLE9BQUEsRUFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsY0FBQSxHQUFBLE9BQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLHVCQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtBQUNBLHNCQUFBLEVBQUEsd0JBQUEsTUFBQSxFQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxtQkFBQSxHQUFBLE1BQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLHVCQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtBQUNBLGdCQUFBLEVBQUEsa0JBQUEsT0FBQSxFQUFBLE9BQUEsRUFBQTtBQUNBLGdCQUFBLEdBQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxlQUFBLENBQUEsT0FBQSxHQUFBLE9BQUEsQ0FBQTtBQUNBLGVBQUEsQ0FBQSxPQUFBLEdBQUEsT0FBQSxDQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxzQkFBQSxFQUFBLEdBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLHVCQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtBQUNBLG1CQUFBLEVBQUEscUJBQUEsT0FBQSxFQUFBO0FBQ0EsbUJBQUEsS0FBQSxVQUFBLENBQUEsY0FBQSxHQUFBLE9BQUEsQ0FBQSxDQUFBO1NBQ0E7QUFDQSwwQkFBQSxFQUFBLDRCQUFBLE9BQUEsRUFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEscUJBQUEsR0FBQSxPQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSx1QkFBQSxDQUFBLEdBQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQTtBQUNBLHVCQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtLQUNBLENBQUE7Q0FFQSxDQUFBLENBQUE7QUMzREEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGNBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxDQUFBLE9BQUEsRUFBQTtBQUNBLFdBQUEsRUFBQSxRQUFBO0FBQ0EsbUJBQUEsRUFBQSxxQkFBQTs7S0FFQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBR0EsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGNBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxDQUFBLGFBQUEsRUFBQTtBQUNBLFdBQUEsRUFBQSxpQkFBQTtBQUNBLG1CQUFBLEVBQUEsNEJBQUE7QUFDQSxrQkFBQSxFQUFBLGlCQUFBO0FBQ0EsZUFBQSxFQUFBO0FBQ0EsaUJBQUEsRUFBQSxlQUFBLFlBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSx1QkFBQSxZQUFBLENBQUEsUUFBQSxDQUFBLFlBQUEsQ0FBQSxPQUFBLENBQUEsQ0FBQTthQUNBO1NBQ0E7O0tBRUEsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQ3JCQSxHQUFBLENBQUEsVUFBQSxDQUFBLFlBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxNQUFBLEVBQUEsYUFBQSxFQUFBLFlBQUEsRUFBQSxXQUFBLEVBQUEsYUFBQSxFQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxRQUFBLEVBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxNQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsTUFBQSxHQUFBLE1BQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxRQUFBLEdBQUEsTUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTs7QUFFQSxVQUFBLENBQUEsU0FBQSxHQUFBLFVBQUEsS0FBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLEVBQUEsQ0FBQSxhQUFBLEVBQUEsRUFBQSxPQUFBLEVBQUEsS0FBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxXQUFBLEdBQUEsVUFBQSxLQUFBLEVBQUE7QUFDQSxtQkFBQSxDQUFBLFdBQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQTtLQUNBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFdBQUEsR0FBQSxZQUFBO0FBQ0EsY0FBQSxDQUFBLEVBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQTs7Ozs7OztLQU9BLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDekJBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsU0FBQTtBQUNBLG1CQUFBLEVBQUEsc0JBQUE7QUFDQSxrQkFBQSxFQUFBLFlBQUE7S0FDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUNOQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLENBQUEsV0FBQSxFQUFBO0FBQ0EsV0FBQSxFQUFBLHFCQUFBO0FBQ0EsbUJBQUEsRUFBQSwwQkFBQTtBQUNBLGtCQUFBLEVBQUEsZUFBQTtBQUNBLGVBQUEsRUFBQTtBQUNBLGlCQUFBLEVBQUEsZUFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsdUJBQUEsWUFBQSxDQUFBLFFBQUEsQ0FBQSxZQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7YUFDQTtTQUNBO0tBQ0EsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQUdBLEdBQUEsQ0FBQSxVQUFBLENBQUEsZUFBQSxFQUFBLFVBQUEsTUFBQSxFQUFBLFlBQUEsRUFBQSxhQUFBLEVBQUEsYUFBQSxFQUFBLEtBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxjQUFBLEdBQUEsS0FBQSxDQUFBOztBQUVBLFFBQUEsT0FBQSxHQUFBLFNBQUEsT0FBQSxHQUFBO0FBQ0EsYUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLElBQUEsQ0FBQSxLQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsS0FBQSxHQUFBLEtBQUEsQ0FBQTtLQUNBLENBQUE7QUFDQSxXQUFBLEVBQUEsQ0FBQTs7QUFFQSxVQUFBLENBQUEsU0FBQSxHQUFBLFlBQUE7QUFDQSxvQkFBQSxDQUFBLFdBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLEdBQUEsR0FBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxpQkFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLHlCQUFBLENBQUEsT0FBQSxDQUFBLE9BQUEsRUFBQSxJQUFBLENBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFNBQUEsR0FBQSxZQUFBO0FBQ0EsZUFBQSxDQUFBLEdBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTtBQUNBLHFCQUFBLENBQUEsUUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsTUFBQSxFQUFBO0FBQ0EsbUJBQUEsQ0FBQSxHQUFBLENBQUEsUUFBQSxFQUFBLE1BQUEsQ0FBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxpQkFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsTUFBQSxHQUFBLE1BQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLGVBQUEsQ0FBQSxHQUFBLENBQUEsT0FBQSxFQUFBLEtBQUEsQ0FBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLEtBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTtBQUNBLG9CQUFBLENBQUEsUUFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLEVBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTtBQzlDQSxHQUFBLENBQUEsVUFBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxNQUFBLEVBQUEsWUFBQSxFQUFBLGFBQUEsRUFBQSxPQUFBLEVBQUEsYUFBQSxFQUFBLFdBQUEsRUFBQTtBQUNBLFdBQUEsQ0FBQSxHQUFBLENBQUEsU0FBQSxFQUFBLE9BQUEsQ0FBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLFVBQUEsR0FBQSxLQUFBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFdBQUEsR0FBQSxZQUFBO0FBQ0EsWUFBQSxPQUFBLENBQUEsSUFBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLENBQUEsS0FBQSxHQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxDQUFBO1NBQ0E7QUFDQSxlQUFBLENBQUEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQTs7QUFFQSxvQkFBQSxDQUFBLFdBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQUE7S0FDQSxDQUFBOztBQUlBLFVBQUEsQ0FBQSxVQUFBLEdBQUEsVUFBQSxLQUFBLEVBQUE7QUFDQSxxQkFBQSxDQUFBLE9BQUEsQ0FBQSxPQUFBLEVBQUEsR0FBQSxDQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsS0FBQSxDQUFBLE1BQUEsQ0FBQSxJQUFBLENBQUEsS0FBQSxDQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsS0FBQSxDQUFBLEtBQUEsR0FBQSxLQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxTQUFBLEdBQUEsWUFBQTtBQUNBLG9CQUFBLENBQUEsV0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxLQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEVBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUMxQkEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGNBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsRUFBQTtBQUNBLFdBQUEsRUFBQSxXQUFBO0FBQ0EsbUJBQUEsRUFBQSx5QkFBQTtBQUNBLGtCQUFBLEVBQUEsY0FBQTtLQUNBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUNOQSxHQUFBLENBQUEsVUFBQSxDQUFBLGlCQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsUUFBQSxFQUFBLE1BQUEsRUFBQSxLQUFBLEVBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQSxhQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsS0FBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxjQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLFdBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsWUFBQSxHQUFBLEtBQUEsQ0FBQTs7QUFHQSxXQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsRUFBQSxLQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsTUFBQSxHQUFBLEtBQUEsQ0FBQSxNQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsZUFBQSxHQUFBLFVBQUEsS0FBQSxFQUFBO0FBQ0EsWUFBQSxVQUFBLEdBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLEtBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsRUFBQSxDQUFBLENBQUEsQ0FBQTtLQUNBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFlBQUEsR0FBQSxZQUFBO0FBQ0EsY0FBQSxDQUFBLFlBQUEsR0FBQSxJQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxXQUFBLEdBQUEsWUFBQTtBQUNBLGdCQUFBLENBQUEsWUFBQTtBQUNBLGtCQUFBLENBQUEsY0FBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsV0FBQSxHQUFBLElBQUEsQ0FBQTtTQUNBLEVBQUEsR0FBQSxDQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxRQUFBLEdBQUEsVUFBQSxLQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsS0FBQSxDQUFBLEtBQUEsR0FBQSxLQUFBLENBQUEsR0FBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLGNBQUEsR0FBQSxLQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxXQUFBLEdBQUEsWUFBQTtBQUNBLG9CQUFBLENBQUEsV0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEVBQUEsQ0FBQSxPQUFBLENBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7O0FBR0EsVUFBQSxDQUFBLFdBQUEsR0FBQSxZQUFBO0FBQ0EsZUFBQSxDQUFBLEdBQUEsQ0FBQSxTQUFBLEVBQUEsS0FBQSxDQUFBLENBQUE7QUFDQSxvQkFBQSxDQUFBLGtCQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLG1CQUFBLENBQUEsR0FBQSxDQUFBLFlBQUEsRUFBQSxLQUFBLENBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUM1Q0EsR0FBQSxDQUFBLFVBQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsV0FBQSxFQUFBLFdBQUEsRUFBQSxFQUVBLENBQUEsQ0FBQTtBQ0ZBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsV0FBQTtBQUNBLG1CQUFBLEVBQUEsMkJBQUE7QUFDQSxrQkFBQSxFQUFBLGNBQUE7S0FDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUNOQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsV0FBQSxFQUFBLFNBQUE7QUFDQSxtQkFBQSxFQUFBLHVCQUFBO0FBQ0Esa0JBQUEsRUFBQSxZQUFBO0FBQ0EsZUFBQSxFQUFBO0FBQ0Esa0JBQUEsRUFBQSxnQkFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsdUJBQUEsWUFBQSxDQUFBLFFBQUEsRUFBQSxDQUFBO2FBQ0E7U0FDQTtLQUNBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUFHQSxHQUFBLENBQUEsVUFBQSxDQUFBLFlBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxhQUFBLEVBQUEsTUFBQSxFQUFBO0FBQ0EsV0FBQSxDQUFBLEdBQUEsQ0FBQSxZQUFBLEVBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsTUFBQSxHQUFBLE1BQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxRQUFBLEdBQUEsWUFBQTtBQUNBLGVBQUEsQ0FBQSxHQUFBLENBQUEsZUFBQSxDQUFBLENBQUE7QUFDQSxxQkFBQSxDQUFBLFFBQUEsRUFBQSxDQUFBO0tBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTtBQ3JCQSxHQUFBLENBQUEsVUFBQSxDQUFBLFVBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxVQUFBLEVBQUEsYUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLFNBQUEsR0FBQSxZQUFBO0FBQ0EscUJBQUEsQ0FBQSxTQUFBLEVBQUEsQ0FBQTtLQUNBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFNBQUEsR0FBQSxZQUFBLEVBQ0EsQ0FBQTs7QUFFQSxVQUFBLENBQUEsV0FBQSxHQUFBLFVBQUEsQ0FBQTs7QUFHQSxLQUFBLENBQUEsUUFBQSxDQUFBLENBQUEsS0FBQSxDQUFBLFlBQUE7O0FBRUEsU0FBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBLFdBQUEsQ0FBQTs7QUFFQSxvQkFBQSxFQUFBLElBQUE7O0FBRUEsaUJBQUEsRUFBQSxDQUFBOztTQUVBLENBQUEsQ0FBQTtLQUVBLENBQUEsQ0FBQTtDQUdBLENBQUEsQ0FBQTtBQ3hCQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLENBQUEsTUFBQSxFQUFBO0FBQ0EsV0FBQSxFQUFBLEdBQUE7QUFDQSxtQkFBQSxFQUFBLG9CQUFBO0FBQ0Esa0JBQUEsRUFBQSxVQUFBO0FBQ0EsZUFBQSxFQUFBO0FBQ0Esc0JBQUEsRUFBQSxvQkFBQSxhQUFBLEVBQUE7QUFDQSx1QkFBQSxhQUFBLENBQUEsU0FBQSxDQUFBLEVBQUEsQ0FBQSxDQUFBO2FBQ0E7U0FDQTs7S0FFQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUNaQSxHQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxNQUFBLEVBQUEsYUFBQSxFQUFBLFlBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBO0FBQ0EsUUFBQSxVQUFBLEdBQUEsRUFBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLEtBQUEsR0FBQSxTQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsU0FBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxVQUFBLEdBQUEsWUFBQTtBQUNBLGNBQUEsQ0FBQSxFQUFBLENBQUEsVUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBOzs7Ozs7Ozs7QUFTQSxXQUFBLENBQUEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxNQUFBLEdBQUEsTUFBQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxTQUFBLEdBQUEsWUFBQTtBQUNBLGFBQUEsSUFBQSxDQUFBLEdBQUEsQ0FBQSxFQUFBLENBQUEsSUFBQSxFQUFBLEVBQUEsQ0FBQSxFQUFBLEVBQUE7QUFDQSxnQkFBQSxHQUFBLEdBQUEsYUFBQSxHQUFBLENBQUEsR0FBQSxNQUFBLENBQUE7QUFDQSx5QkFBQSxDQUFBLFFBQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTtTQUNBO0tBQ0EsQ0FBQTs7QUFFQSxVQUFBLENBQUEsUUFBQSxHQUFBLFlBQUE7QUFDQSxxQkFBQSxDQUFBLFFBQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLE1BQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsTUFBQSxHQUFBLE1BQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7O0FBR0EsVUFBQSxDQUFBLFdBQUEsR0FBQSxZQUFBO0FBQ0EsY0FBQSxDQUFBLFFBQUEsR0FBQTtBQUNBLGlCQUFBLEVBQUEsTUFBQSxDQUFBLFNBQUE7QUFDQSxrQkFBQSxFQUFBLENBQUEsaUJBQUEsQ0FBQTtTQUNBLENBQUE7QUFDQSxxQkFBQSxDQUFBLFdBQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxTQUFBLEdBQUEsWUFBQTtBQUNBLHFCQUFBLENBQUEsV0FBQSxFQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsTUFBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxNQUFBLEdBQUEsTUFBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTs7QUFFQSxVQUFBLENBQUEsVUFBQSxHQUFBLFVBQUEsS0FBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxJQUFBLENBQUEsS0FBQSxDQUFBLENBQUE7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxTQUFBLEdBQUEsWUFBQSxFQUNBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFdBQUEsR0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLG1CQUFBLENBQUEsV0FBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtDQU9BLENBQUEsQ0FBQTtBQ2hFQSxHQUFBLENBQUEsT0FBQSxDQUFBLGVBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLFdBQUE7QUFDQSxnQkFBQSxFQUFBLGtCQUFBLEdBQUEsRUFBQTtBQUNBLGdCQUFBLEtBQUEsR0FBQTtBQUNBLG1CQUFBLEVBQUEsR0FBQTtBQUNBLG9CQUFBLEVBQUEsTUFBQTthQUNBLENBQUE7QUFDQSxpQkFBQSxDQUFBLElBQUEsQ0FBQSxpQkFBQSxFQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQSxFQUNBLENBQUEsQ0FBQTtTQUNBO0FBQ0EsaUJBQUEsRUFBQSxtQkFBQSxLQUFBLEVBQUE7QUFDQSxpQkFBQSxDQUFBLElBQUEsQ0FBQSxvQkFBQSxFQUFBLEtBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLHVCQUFBLENBQUEsR0FBQSxDQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBO0FBQ0EsZ0JBQUEsRUFBQSxvQkFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsYUFBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsdUJBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBO0FBQ0EsZ0JBQUEsRUFBQSxvQkFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEscUJBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLHVCQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtBQUNBLGdCQUFBLEVBQUEsb0JBQUE7QUFDQSxpQkFBQSxDQUFBLEdBQUEsQ0FBQSxzQkFBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsdUJBQUEsQ0FBQSxHQUFBLENBQUEsWUFBQSxFQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBO0FBQ0EsaUJBQUEsRUFBQSxxQkFBQTtBQUNBLGlCQUFBLENBQUEsR0FBQSxDQUFBLHVCQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSx1QkFBQSxDQUFBLEdBQUEsQ0FBQSxPQUFBLEVBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7QUFDQSxpQkFBQSxFQUFBLG1CQUFBLE1BQUEsRUFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEscUJBQUEsR0FBQSxNQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSx1QkFBQSxDQUFBLEdBQUEsQ0FBQSxPQUFBLEVBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0FBQ0EsdUJBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBO0tBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTtBQzlDQSxHQUFBLENBQUEsVUFBQSxDQUFBLGlCQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsTUFBQSxFQUFBLGFBQUEsRUFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxRQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxNQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsTUFBQSxHQUFBLE1BQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTs7QUFFQSxVQUFBLENBQUEsV0FBQSxHQUFBLFlBQUE7QUFDQSxZQUFBLEtBQUEsR0FBQTtBQUNBLGlCQUFBLEVBQUEsTUFBQSxDQUFBLFFBQUE7U0FDQSxDQUFBO0FBQ0Esb0JBQUEsQ0FBQSxXQUFBLENBQUEsS0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsS0FBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxVQUFBLEdBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7O0FBR0EsUUFBQSxRQUFBLEdBQUEsTUFBQSxDQUFBLFFBQUEsR0FBQSxJQUFBLFlBQUEsQ0FBQTtBQUNBLFdBQUEsRUFBQSx1QkFBQTtLQUNBLENBQUEsQ0FBQTtBQUNBLFlBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsWUFBQSxFQUFBLGFBQUE7QUFDQSxVQUFBLEVBQUEsWUFBQSxJQUFBLDJCQUFBLE9BQUEsRUFBQTtBQUNBLGdCQUFBLElBQUEsR0FBQSxHQUFBLEdBQUEsSUFBQSxDQUFBLElBQUEsQ0FBQSxLQUFBLENBQUEsSUFBQSxDQUFBLElBQUEsQ0FBQSxXQUFBLENBQUEsR0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBLEdBQUEsR0FBQSxDQUFBO0FBQ0EsbUJBQUEsd0JBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBLENBQUE7U0FDQTtLQUNBLENBQUEsQ0FBQTtBQUNBLFFBQUEsS0FBQSxHQUFBLENBQUEsQ0FBQTtBQUNBLFlBQUEsQ0FBQSxzQkFBQSxHQUFBLFVBQUEsSUFBQSwyQkFBQSxNQUFBLEVBQUEsT0FBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLElBQUEsQ0FBQSx3QkFBQSxFQUFBLElBQUEsRUFBQSxNQUFBLEVBQUEsT0FBQSxDQUFBLENBQUE7S0FDQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLGlCQUFBLEdBQUEsVUFBQSxRQUFBLEVBQUE7O0FBRUEsWUFBQSxTQUFBLEdBQUE7QUFDQSxpQkFBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLEdBQUEsR0FBQSxHQUFBLEtBQUE7QUFDQSxpQkFBQSxFQUFBLE1BQUEsQ0FBQSxVQUFBO1NBQ0EsQ0FBQTtBQUNBLGdCQUFBLENBQUEsUUFBQSxDQUFBLElBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQTtBQUNBLGFBQUEsRUFBQSxDQUFBO0FBQ0EsZUFBQSxDQUFBLEdBQUEsQ0FBQSxNQUFBLEVBQUEsUUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLGdCQUFBLEdBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsSUFBQSxDQUFBLGtCQUFBLEVBQUEsY0FBQSxDQUFBLENBQUE7S0FDQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLGtCQUFBLEdBQUEsVUFBQSxJQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsSUFBQSxDQUFBLG9CQUFBLEVBQUEsSUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLGNBQUEsR0FBQSxVQUFBLFFBQUEsRUFBQSxRQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsSUFBQSxDQUFBLGdCQUFBLEVBQUEsUUFBQSxFQUFBLFFBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtBQUNBLFlBQUEsQ0FBQSxhQUFBLEdBQUEsVUFBQSxRQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsSUFBQSxDQUFBLGVBQUEsRUFBQSxRQUFBLENBQUEsQ0FBQTtLQUNBLENBQUE7QUFDQSxZQUFBLENBQUEsYUFBQSxHQUFBLFVBQUEsUUFBQSxFQUFBLFFBQUEsRUFBQSxNQUFBLEVBQUEsT0FBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLElBQUEsQ0FBQSxlQUFBLEVBQUEsUUFBQSxFQUFBLFFBQUEsRUFBQSxNQUFBLEVBQUEsT0FBQSxDQUFBLENBQUE7S0FDQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLFdBQUEsR0FBQSxVQUFBLFFBQUEsRUFBQSxRQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsRUFBQTtBQUNBLGVBQUEsQ0FBQSxJQUFBLENBQUEsYUFBQSxFQUFBLFFBQUEsRUFBQSxRQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtBQUNBLFlBQUEsQ0FBQSxZQUFBLEdBQUEsVUFBQSxRQUFBLEVBQUEsUUFBQSxFQUFBLE1BQUEsRUFBQSxPQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsSUFBQSxDQUFBLGNBQUEsRUFBQSxRQUFBLEVBQUEsUUFBQSxFQUFBLE1BQUEsRUFBQSxPQUFBLENBQUEsQ0FBQTtLQUNBLENBQUE7QUFDQSxZQUFBLENBQUEsY0FBQSxHQUFBLFVBQUEsUUFBQSxFQUFBLFFBQUEsRUFBQSxNQUFBLEVBQUEsT0FBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLElBQUEsQ0FBQSxnQkFBQSxFQUFBLFFBQUEsRUFBQSxRQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtBQUNBLFlBQUEsQ0FBQSxhQUFBLEdBQUEsWUFBQTtBQUNBLGVBQUEsQ0FBQSxJQUFBLENBQUEsZUFBQSxDQUFBLENBQUE7O0tBRUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTtBQ3BFQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsV0FBQSxFQUFBLFNBQUE7QUFDQSxtQkFBQSxFQUFBLHVCQUFBO0FBQ0Esa0JBQUEsRUFBQSxXQUFBO0FBQ0EsZUFBQSxFQUFBO0FBQ0Esa0JBQUEsRUFBQSxnQkFBQSxhQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsdUJBQUEsYUFBQSxDQUFBLFFBQUEsRUFBQSxDQUFBO2FBQ0E7U0FDQTtLQUNBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxFQUFBO0FBQ0EsV0FBQSxFQUFBLFNBQUE7QUFDQSxtQkFBQSxFQUFBLDJCQUFBO0FBQ0Esa0JBQUEsRUFBQSxXQUFBO0tBQ0EsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQUdBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEtBQUEsQ0FBQSxjQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsZUFBQTtBQUNBLG1CQUFBLEVBQUEsOEJBQUE7QUFDQSxrQkFBQSxFQUFBLGlCQUFBO0tBQ0EsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQzVCQSxHQUFBLENBQUEsVUFBQSxDQUFBLFlBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLElBQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsTUFBQSxHQUFBLFlBQUE7QUFDQSxtQkFBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0Esc0JBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTtBQ1JBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsU0FBQTtBQUNBLG1CQUFBLEVBQUEsdUJBQUE7QUFDQSxrQkFBQSxFQUFBLFlBQUE7S0FDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUNOQSxHQUFBLENBQUEsVUFBQSxDQUFBLFlBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxNQUFBLEVBQUEsTUFBQSxFQUFBLGFBQUEsRUFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBOzs7O0FBSUEsUUFBQSxZQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsUUFBQSxVQUFBLFlBQUEsQ0FBQTtBQUNBLFdBQUEsQ0FBQSxHQUFBLENBQUEsVUFBQSxFQUFBLE1BQUEsQ0FBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLFFBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsVUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxNQUFBLEdBQUEsTUFBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLFdBQUEsR0FBQSxZQUFBO0FBQ0EsWUFBQSxLQUFBLEdBQUE7QUFDQSxpQkFBQSxFQUFBLE1BQUEsQ0FBQSxhQUFBO1NBQ0EsQ0FBQTtBQUNBLG9CQUFBLENBQUEsV0FBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsTUFBQSxDQUFBLElBQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsVUFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLHdCQUFBLEdBQUEsS0FBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxVQUFBLEdBQUEsWUFBQTtBQUNBLFlBQUEsWUFBQSxFQUFBO0FBQ0Esc0JBQUEsR0FBQSxZQUFBLENBQUE7U0FDQSxNQUNBO0FBQ0Esc0JBQUEsR0FBQSxNQUFBLENBQUEsVUFBQSxDQUFBO1NBQ0E7QUFDQSxlQUFBLENBQUEsR0FBQSxDQUFBLGVBQUEsRUFBQSxVQUFBLENBQUEsQ0FBQTtLQUNBLENBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBbUJBLENBQUEsQ0FBQTtBQy9DQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsV0FBQSxFQUFBLFNBQUE7QUFDQSxtQkFBQSxFQUFBLHVCQUFBO0FBQ0Esa0JBQUEsRUFBQSxZQUFBO0FBQ0EsZUFBQSxFQUFBO0FBQ0Esa0JBQUEsRUFBQSxnQkFBQSxZQUFBLEVBQUE7QUFDQSx1QkFBQSxZQUFBLENBQUEsUUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsTUFBQSxFQUFBO0FBQ0EsMkJBQUEsTUFBQSxDQUFBO2lCQUNBLENBQUEsQ0FBQTthQUNBO1NBQ0E7S0FDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FDYkEsR0FBQSxDQUFBLE9BQUEsQ0FBQSxlQUFBLEVBQUEsVUFBQSxLQUFBLEVBQUEsU0FBQSxFQUFBLFFBQUEsRUFBQTs7QUFHQSxRQUFBLFVBQUEsR0FBQSxTQUFBLFVBQUEsQ0FBQSxPQUFBLEVBQUE7QUFDQSxZQUFBLFFBQUEsR0FBQSxPQUFBLENBQUEsT0FBQSxDQUFBLFFBQUEsQ0FBQSxJQUFBLENBQUEsQ0FBQTtBQUNBLGlCQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0Esa0JBQUEsRUFBQSxRQUFBO0FBQ0Esb0JBQUEsRUFDQSxrREFBQSxHQUNBLHVCQUFBLEdBQ0EsT0FBQSxHQUNBLHdCQUFBLEdBQ0EsY0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7O0FBR0EsV0FBQTtBQUNBLGVBQUEsRUFBQSxpQkFBQSxPQUFBLEVBQUEsT0FBQSxFQUFBO0FBQ0Esc0JBQUEsQ0FBQSxPQUFBLENBQUEsQ0FBQTtBQUNBLG9CQUFBLENBQUEsWUFBQTtBQUNBLHlCQUFBLENBQUEsSUFBQSxFQUFBLENBQUE7YUFDQSxFQUFBLE9BQUEsQ0FBQSxDQUFBO1NBQ0E7S0FDQSxDQUFBO0NBSUEsQ0FBQSxDQUFBO0FDNUJBLEdBQUEsQ0FBQSxPQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLFVBQUEsRUFBQSxhQUFBLEVBQUE7QUFDQSxXQUFBO0FBQ0EsbUJBQUEsRUFBQSx1QkFBQTtBQUNBLGdCQUFBLElBQUEsR0FBQTtBQUNBLG9CQUFBLEVBQUEsTUFBQTtBQUNBLHVCQUFBLEVBQUEsV0FBQTtBQUNBLHNCQUFBLEVBQUEsQ0FBQSxLQUFBLEVBQUEsS0FBQSxFQUFBLE9BQUEsQ0FBQTthQUNBLENBQUE7QUFDQSxtQkFBQSxJQUFBLENBQUE7O1NBRUE7QUFDQSxrQkFBQSxFQUFBLG9CQUFBLElBQUEsRUFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsYUFBQSxFQUFBLElBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLHVCQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtBQUNBLGVBQUEsRUFBQSxtQkFBQTtBQUNBLGdCQUFBLFFBQUEsR0FBQSxhQUFBLENBQUE7QUFDQSxtQkFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLGFBQUEsR0FBQSxRQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSwwQkFBQSxDQUFBLElBQUEsR0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsdUJBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBOzs7Ozs7Ozs7Ozs7Ozs7OztBQWlCQSxtQkFBQSxFQUFBLHFCQUFBLEtBQUEsRUFBQTtBQUNBLGdCQUFBLElBQUEsR0FBQSxVQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsZ0JBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxPQUFBLEVBQUEsS0FBQSxDQUFBLENBQUEsRUFBQTtBQUNBLHVCQUFBLENBQUEsR0FBQSxDQUFBLHNCQUFBLENBQUEsQ0FBQTthQUNBO0FBQ0EsZ0JBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBOztBQUVBLGlCQUFBLENBQUEsSUFBQSxDQUFBLG1CQUFBLEVBQUEsSUFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0Esb0JBQUEsR0FBQSxDQUFBLE1BQUEsS0FBQSxHQUFBLEVBQUE7QUFDQSxpQ0FBQSxDQUFBLE9BQUEsQ0FBQSxpQkFBQSxFQUFBLElBQUEsQ0FBQSxDQUFBO2lCQUNBLE1BQ0E7QUFDQSxpQ0FBQSxDQUFBLE9BQUEsQ0FBQSxnQkFBQSxFQUFBLElBQUEsQ0FBQSxDQUFBO2lCQUNBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7QUFDQSxtQkFBQSxFQUFBLHFCQUFBLEtBQUEsRUFBQTtBQUNBLGdCQUFBLElBQUEsR0FBQSxVQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsZ0JBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxPQUFBLEVBQUEsS0FBQSxDQUFBLENBQUEsRUFBQTtBQUNBLHVCQUFBLENBQUEsR0FBQSxDQUFBLHNCQUFBLENBQUEsQ0FBQTthQUNBO0FBQ0EsZ0JBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBOztBQUVBLGlCQUFBLENBQUEsSUFBQSxDQUFBLG1CQUFBLEVBQUEsSUFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0Esb0JBQUEsR0FBQSxDQUFBLE1BQUEsS0FBQSxHQUFBLEVBQUE7QUFDQSxpQ0FBQSxDQUFBLE9BQUEsQ0FBQSxpQkFBQSxFQUFBLElBQUEsQ0FBQSxDQUFBO2lCQUNBLE1BQ0E7QUFDQSxpQ0FBQSxDQUFBLE9BQUEsQ0FBQSxnQkFBQSxFQUFBLElBQUEsQ0FBQSxDQUFBO2lCQUNBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7S0FDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBO0FDeEVBLEdBQUEsQ0FBQSxTQUFBLENBQUEsV0FBQSxFQUFBLFlBQUE7QUFDQSxXQUFBO0FBQ0EsZ0JBQUEsRUFBQSxHQUFBO0FBQ0EsWUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxJQUFBLEVBQUE7QUFDQSxtQkFBQSxDQUFBLEdBQUEsQ0FBQSxjQUFBLEVBQUEsT0FBQSxDQUFBLENBQUEsQ0FBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBO0FBQ0EsZ0JBQUEsS0FBQSxHQUFBLE9BQUEsQ0FBQSxDQUFBLENBQUEsQ0FBQSxXQUFBLEdBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLG1CQUFBLENBQUEsR0FBQSxDQUFBO0FBQ0Esc0JBQUEsRUFBQSxLQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7S0FDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBO0FDWEEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxXQUFBLEVBQUEsVUFBQSxVQUFBLEVBQUEsTUFBQSxFQUFBO0FBQ0EsV0FBQTtBQUNBLGdCQUFBLEVBQUEsR0FBQTtBQUNBLGtCQUFBLEVBQUEsWUFBQTtBQUNBLGFBQUEsRUFBQTtBQUNBLGlCQUFBLEVBQUEsR0FBQTtTQUNBO0FBQ0EsbUJBQUEsRUFBQSw2Q0FBQTtBQUNBLFlBQUEsRUFBQSxjQUFBLEtBQUEsRUFBQTtBQUNBLGlCQUFBLENBQUEsU0FBQSxHQUFBLFlBQUE7QUFDQSxzQkFBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxPQUFBLEVBQUEsS0FBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQTs7QUFFQSxpQkFBQSxDQUFBLFNBQUEsR0FBQSxZQUFBO0FBQ0Esc0JBQUEsQ0FBQSxFQUFBLENBQUEsYUFBQSxFQUFBLEVBQUEsT0FBQSxFQUFBLEtBQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTthQUNBLENBQUE7O0FBRUEsaUJBQUEsQ0FBQSxjQUFBLEdBQUEsWUFBQTtBQUNBLHVCQUFBLENBQUEsR0FBQSxDQUFBLGdCQUFBLENBQUEsQ0FBQTthQUNBLENBQUE7U0FDQTtLQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUN0QkEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxhQUFBLEVBQUEsVUFBQSxVQUFBLEVBQUE7QUFDQSxXQUFBO0FBQ0EsZ0JBQUEsRUFBQSxHQUFBO0FBQ0Esa0JBQUEsRUFBQSxZQUFBO0FBQ0EsbUJBQUEsRUFBQSx3Q0FBQTtBQUNBLFlBQUEsRUFBQSxjQUFBLEtBQUEsRUFBQSxFQUVBO0tBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTtBQ1RBLEdBQUEsQ0FBQSxTQUFBLENBQUEsWUFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLE1BQUEsRUFBQTtBQUNBLFdBQUE7QUFDQSxnQkFBQSxFQUFBLEdBQUE7QUFDQSxtQkFBQSxFQUFBLDhDQUFBO0FBQ0EsWUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBO0FBQ0EsaUJBQUEsQ0FBQSxTQUFBLEdBQUEsWUFBQTtBQUNBLHNCQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE9BQUEsRUFBQSxLQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7YUFDQSxDQUFBOztBQUVBLGlCQUFBLENBQUEsY0FBQSxHQUFBLFlBQUE7QUFDQSx1QkFBQSxDQUFBLEdBQUEsQ0FBQSxnQkFBQSxDQUFBLENBQUE7YUFDQSxDQUFBO1NBQ0E7S0FDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBO0FDZEEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxRQUFBLEVBQUEsVUFBQSxVQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsRUFBQSxXQUFBLEVBQUEsWUFBQSxFQUFBLFdBQUEsRUFBQTtBQUNBLFdBQUE7QUFDQSxnQkFBQSxFQUFBLEdBQUE7QUFDQSxtQkFBQSxFQUFBLHlDQUFBO0FBQ0EsWUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBOzs7Ozs7Ozs7QUFTQSx1QkFBQSxDQUFBLE9BQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLHFCQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLHVCQUFBLENBQUEsR0FBQSxDQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsQ0FBQTs7QUFFQSx1QkFBQSxZQUFBLENBQUEsY0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxNQUFBLEVBQUE7QUFDQSxxQkFBQSxDQUFBLFVBQUEsR0FBQSxNQUFBLENBQUE7QUFDQSxvQkFBQSxLQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEVBQUE7QUFDQSx5QkFBQSxDQUFBLFVBQUEsQ0FBQSxJQUFBLENBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtpQkFDQTtBQUNBLHVCQUFBLENBQUEsR0FBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTs7Ozs7Ozs7QUFRQSx1QkFBQSxDQUFBLGVBQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLG9CQUFBLElBQUEsRUFBQTtBQUNBLHlCQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtpQkFDQSxNQUNBO0FBQ0EseUJBQUEsQ0FBQSxJQUFBLEdBQUE7QUFDQSw2QkFBQSxFQUFBLE9BQUE7QUFDQSw0QkFBQSxFQUFBLEVBQUE7cUJBQ0EsQ0FBQTtpQkFDQTthQUNBLENBQUEsQ0FBQTtBQUNBLGlCQUFBLENBQUEsVUFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLGlCQUFBLENBQUEsWUFBQSxHQUFBLEtBQUEsQ0FBQTs7QUFFQSxpQkFBQSxDQUFBLFNBQUEsR0FBQSxZQUFBO0FBQ0EscUJBQUEsQ0FBQSxVQUFBLEdBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQTs7QUFFQSxpQkFBQSxDQUFBLFdBQUEsR0FBQSxZQUFBO0FBQ0EscUJBQUEsQ0FBQSxZQUFBLEdBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQTs7QUFFQSxpQkFBQSxDQUFBLFNBQUEsR0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLHNCQUFBLENBQUEsRUFBQSxDQUFBLGFBQUEsRUFBQTtBQUNBLDJCQUFBLEVBQUEsS0FBQSxDQUFBLEdBQUE7aUJBQ0EsQ0FBQSxDQUFBO2FBQ0EsQ0FBQTtTQUVBO0tBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTtBQy9EQSxHQUFBLENBQUEsU0FBQSxDQUFBLFFBQUEsRUFBQSxVQUFBLFVBQUEsRUFBQSxXQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsRUFBQTs7QUFFQSxXQUFBO0FBQ0EsZ0JBQUEsRUFBQSxHQUFBO0FBQ0EsYUFBQSxFQUFBLEVBQUE7QUFDQSxtQkFBQSxFQUFBLHlDQUFBO0FBQ0EsWUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBOztBQUVBLHNCQUFBLENBQUEsR0FBQSxDQUFBLHFCQUFBLEVBQ0EsVUFBQSxLQUFBLEVBQUEsT0FBQSxFQUFBLFFBQUEsRUFBQSxTQUFBLEVBQUEsVUFBQSxFQUFBO0FBQ0EscUJBQUEsQ0FBQSxXQUFBLEdBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQTthQUNBLENBQ0EsQ0FBQTs7QUFFQSxpQkFBQSxDQUFBLEtBQUEsR0FBQSxDQUFBO0FBQ0EscUJBQUEsRUFBQSxNQUFBO0FBQ0EscUJBQUEsRUFBQSxNQUFBO2FBQ0EsRUFBQTtBQUNBLHFCQUFBLEVBQUEsUUFBQTtBQUNBLHFCQUFBLEVBQUEsUUFBQTthQUNBLEVBQUE7QUFDQSxxQkFBQSxFQUFBLFFBQUE7QUFDQSxxQkFBQSxFQUFBLFFBQUE7YUFDQSxFQUFBO0FBQ0EscUJBQUEsRUFBQSxRQUFBO0FBQ0EscUJBQUEsRUFBQSxRQUFBO2FBQ0EsRUFBQTtBQUNBLHFCQUFBLEVBQUEsV0FBQTtBQUNBLHFCQUFBLEVBQUEsVUFBQTthQUNBLEVBRUE7QUFDQSxxQkFBQSxFQUFBLE9BQUE7QUFDQSxxQkFBQSxFQUFBLE9BQUE7YUFDQSxDQUNBLENBQUE7O0FBRUEsaUJBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLGlCQUFBLENBQUEsVUFBQSxHQUFBLFlBQUE7QUFDQSx1QkFBQSxXQUFBLENBQUEsZUFBQSxFQUFBLENBQUE7YUFDQSxDQUFBOztBQUVBLGlCQUFBLENBQUEsTUFBQSxHQUFBLFlBQUE7QUFDQSwyQkFBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsMEJBQUEsQ0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7aUJBQ0EsQ0FBQSxDQUFBO2FBQ0EsQ0FBQTs7QUFJQSxnQkFBQSxPQUFBLEdBQUEsU0FBQSxPQUFBLEdBQUE7QUFDQSwyQkFBQSxDQUFBLGVBQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLHlCQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtpQkFDQSxDQUFBLENBQUE7YUFDQSxDQUFBOztBQUVBLGdCQUFBLFVBQUEsR0FBQSxTQUFBLFVBQUEsR0FBQTtBQUNBLHFCQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTthQUNBLENBQUE7O0FBRUEsbUJBQUEsRUFBQSxDQUFBOztBQUVBLHNCQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLEVBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxzQkFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsQ0FBQSxDQUFBO0FBQ0Esc0JBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLENBQUEsQ0FBQTtTQUVBOztLQUVBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDdkVBLEdBQUEsQ0FBQSxTQUFBLENBQUEsZ0JBQUEsRUFBQSxVQUFBLFVBQUEsRUFBQTtBQUNBLFdBQUE7QUFDQSxnQkFBQSxFQUFBLEdBQUE7QUFDQSxrQkFBQSxFQUFBLGNBQUE7QUFDQSxtQkFBQSxFQUFBLGtEQUFBO0FBQ0EsWUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBLEVBQ0E7S0FDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBO0FDUkEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxXQUFBLEVBQUEsVUFBQSxhQUFBLEVBQUE7QUFDQSxXQUFBO0FBQ0EsZ0JBQUEsRUFBQSxHQUFBO0FBQ0EsbUJBQUEsRUFBQSw0Q0FBQTtBQUNBLFlBQUEsRUFBQSxjQUFBLEtBQUEsRUFBQSxJQUFBLEVBQUEsSUFBQSxFQUFBO0FBQ0EsaUJBQUEsQ0FBQSxTQUFBLEdBQUEsWUFBQTtBQUNBLDZCQUFBLENBQUEsU0FBQSxDQUFBLEtBQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQTthQUNBLENBQUE7U0FDQTtLQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUNWQSxHQUFBLENBQUEsU0FBQSxDQUFBLFdBQUEsRUFBQSxVQUFBLFVBQUEsRUFBQTtBQUNBLFdBQUE7QUFDQSxnQkFBQSxFQUFBLEdBQUE7QUFDQSxhQUFBLEVBQUE7QUFDQSxzQkFBQSxFQUFBLFNBQUE7U0FDQTtBQUNBLGtCQUFBLEVBQUEsV0FBQTtBQUNBLG1CQUFBLEVBQUEsNENBQUE7QUFDQSxZQUFBLEVBQUEsY0FBQSxLQUFBLEVBQUE7QUFDQSxtQkFBQSxDQUFBLEdBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUE7U0FDQTtLQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUNaQSxHQUFBLENBQUEsU0FBQSxDQUFBLGdCQUFBLEVBQUEsVUFBQSxVQUFBLEVBQUE7QUFDQSxXQUFBO0FBQ0EsZ0JBQUEsRUFBQSxHQUFBO0FBQ0Esa0JBQUEsRUFBQSxXQUFBO0FBQ0EsbUJBQUEsRUFBQSw4Q0FBQTtBQUNBLFlBQUEsRUFBQSxjQUFBLEtBQUEsRUFBQSxFQUNBO0tBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTtBQ1JBLEdBQUEsQ0FBQSxTQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLE1BQUEsRUFBQTtBQUNBLFdBQUE7QUFDQSxnQkFBQSxFQUFBLEdBQUE7QUFDQSxhQUFBLEVBQUE7QUFDQSxpQkFBQSxFQUFBLEdBQUE7U0FDQTtBQUNBLG1CQUFBLEVBQUEsOENBQUE7QUFDQSxZQUFBLEVBQUEsY0FBQSxLQUFBLEVBQUE7QUFDQSxpQkFBQSxDQUFBLFNBQUEsR0FBQSxZQUFBO0FBQ0EsdUJBQUEsQ0FBQSxHQUFBLENBQUEsS0FBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBOzthQUVBLENBQUE7U0FHQTtLQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUNoQkEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxVQUFBLEVBQUEsWUFBQTtBQUNBLFdBQUE7QUFDQSxnQkFBQSxFQUFBLEdBQUE7QUFDQSxtQkFBQSxFQUFBLHlDQUFBO0FBQ0EsWUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBLElBQUEsRUFBQSxJQUFBLEVBQUE7QUFDQSxnQkFBQSxlQUFBLEdBQUEsSUFBQSxFQUFBLENBQUEsWUFBQSxDQUFBO0FBQ0EsdUJBQUEsRUFBQSxRQUFBLENBQUEsY0FBQSxDQUFBLHVCQUFBLENBQUE7QUFDQSx3QkFBQSxFQUFBLHFCQUFBO0FBQ0EsdUJBQUEsRUFBQTtBQUNBLDRCQUFBLEVBQUEsbUJBQUE7aUJBQ0E7QUFDQSwwQkFBQSxFQUFBO0FBQ0EsZ0NBQUEsRUFBQTtBQUNBLG1DQUFBLEVBQUEsMENBQUE7QUFDQSx3Q0FBQSxFQUFBLGdEQUFBO3FCQUNBO2lCQUNBO0FBQ0EsMEJBQUEsRUFBQTtBQUNBLHFDQUFBLEVBQUEsQ0FBQSxNQUFBLEVBQUEsS0FBQSxFQUFBLEtBQUEsRUFBQSxLQUFBLENBQUE7aUJBQ0E7YUFDQSxDQUFBLENBQUE7U0FDQTtLQUNBLENBQUE7Q0FDQSxDQUFBLENBQUEiLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcbndpbmRvdy5hcHAgPSBhbmd1bGFyLm1vZHVsZSgnWlRGJywgWydmc2FQcmVCdWlsdCcsJ2Jvb3RzdHJhcExpZ2h0Ym94JywgJ3VpLnJvdXRlcicsICd1aS5ib290c3RyYXAnLCAnbmdBbmltYXRlJywgJ2FuZ3VsYXJGaWxlVXBsb2FkJywgJ25nTWF0ZXJpYWwnLCAnYWtvZW5pZy5kZWNrZ3JpZCddKTtcblxuYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHVybFJvdXRlclByb3ZpZGVyLCAkbG9jYXRpb25Qcm92aWRlciwgJG1kVGhlbWluZ1Byb3ZpZGVyKSB7XG4gICAgLy8gVGhpcyB0dXJucyBvZmYgaGFzaGJhbmcgdXJscyAoLyNhYm91dCkgYW5kIGNoYW5nZXMgaXQgdG8gc29tZXRoaW5nIG5vcm1hbCAoL2Fib3V0KVxuICAgICRsb2NhdGlvblByb3ZpZGVyLmh0bWw1TW9kZSh0cnVlKTtcbiAgICAvLyBJZiB3ZSBnbyB0byBhIFVSTCB0aGF0IHVpLXJvdXRlciBkb2Vzbid0IGhhdmUgcmVnaXN0ZXJlZCwgZ28gdG8gdGhlIFwiL1wiIHVybC5cbiAgICAkdXJsUm91dGVyUHJvdmlkZXIub3RoZXJ3aXNlKCcvJyk7XG4gICAgIHZhciBjdXN0b21QcmltYXJ5ID0ge1xuICAgICAgICAnNTAnOiAnI2Q4YmY4YycsXG4gICAgICAgICcxMDAnOiAnI2QxYjU3OScsXG4gICAgICAgICcyMDAnOiAnI2NiYWE2NicsXG4gICAgICAgICczMDAnOiAnI2M0YTA1MycsXG4gICAgICAgICc0MDAnOiAnI2JkOTU0MCcsXG4gICAgICAgICc1MDAnOiAnI2FhODYzYScsXG4gICAgICAgICc2MDAnOiAnIzk3NzczNCcsXG4gICAgICAgICc3MDAnOiAnIzg0NjgyZCcsXG4gICAgICAgICc4MDAnOiAnIzcxNTkyNycsXG4gICAgICAgICc5MDAnOiAnIzVlNGEyMCcsXG4gICAgICAgICdBMTAwJzogJyNkZWNhOWYnLFxuICAgICAgICAnQTIwMCc6ICcjZTVkNGIyJyxcbiAgICAgICAgJ0E0MDAnOiAnI2ViZGZjNScsXG4gICAgICAgICdBNzAwJzogJyM0YjNiMWEnXG4gICAgfTtcbiAgXG5cbiAgICRtZFRoZW1pbmdQcm92aWRlci50aGVtZSgnZGVmYXVsdCcpXG4gICAgICAgLnByaW1hcnlQYWxldHRlKCdibHVlJylcbiAgICAgICAuYWNjZW50UGFsZXR0ZSgnbGlnaHQtZ3JlZW4nKVxuICAgICAgIC53YXJuUGFsZXR0ZSgneWVsbG93Jylcbn0pO1xuXG4vLyBUaGlzIGFwcC5ydW4gaXMgZm9yIGNvbnRyb2xsaW5nIGFjY2VzcyB0byBzcGVjaWZpYyBzdGF0ZXMuXG5hcHAucnVuKGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgJHN0YXRlKSB7XG5cbiAgICAvLyBUaGUgZ2l2ZW4gc3RhdGUgcmVxdWlyZXMgYW4gYXV0aGVudGljYXRlZCB1c2VyLlxuICAgIHZhciBkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoID0gZnVuY3Rpb24gKHN0YXRlKSB7XG4gICAgICAgIHJldHVybiBzdGF0ZS5kYXRhICYmIHN0YXRlLmRhdGEuYXV0aGVudGljYXRlO1xuICAgIH07XG5cbiAgICAvLyAkc3RhdGVDaGFuZ2VTdGFydCBpcyBhbiBldmVudCBmaXJlZFxuICAgIC8vIHdoZW5ldmVyIHRoZSBwcm9jZXNzIG9mIGNoYW5naW5nIGEgc3RhdGUgYmVnaW5zLlxuICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VTdGFydCcsIGZ1bmN0aW9uIChldmVudCwgdG9TdGF0ZSwgdG9QYXJhbXMpIHtcblxuICAgICAgICBpZiAoIWRlc3RpbmF0aW9uU3RhdGVSZXF1aXJlc0F1dGgodG9TdGF0ZSkpIHtcbiAgICAgICAgICAgIC8vIFRoZSBkZXN0aW5hdGlvbiBzdGF0ZSBkb2VzIG5vdCByZXF1aXJlIGF1dGhlbnRpY2F0aW9uXG4gICAgICAgICAgICAvLyBTaG9ydCBjaXJjdWl0IHdpdGggcmV0dXJuLlxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKEF1dGhTZXJ2aWNlLmlzQXV0aGVudGljYXRlZCgpKSB7XG4gICAgICAgICAgICAvLyBUaGUgdXNlciBpcyBhdXRoZW50aWNhdGVkLlxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhbmNlbCBuYXZpZ2F0aW5nIHRvIG5ldyBzdGF0ZS5cbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAvLyBJZiBhIHVzZXIgaXMgcmV0cmlldmVkLCB0aGVuIHJlbmF2aWdhdGUgdG8gdGhlIGRlc3RpbmF0aW9uXG4gICAgICAgICAgICAvLyAodGhlIHNlY29uZCB0aW1lLCBBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSB3aWxsIHdvcmspXG4gICAgICAgICAgICAvLyBvdGhlcndpc2UsIGlmIG5vIHVzZXIgaXMgbG9nZ2VkIGluLCBnbyB0byBcImxvZ2luXCIgc3RhdGUuXG4gICAgICAgICAgICAvLyRyb290U2NvcGUubG9nZ2VkSW5Vc2VyID0gdXNlcjtcbiAgICAgICAgICAgIC8vIGlmICh1c2VyKSB7XG4gICAgICAgICAgICAvLyAgICAgJHN0YXRlLmdvKHRvU3RhdGUubmFtZSwgdG9QYXJhbXMpO1xuICAgICAgICAgICAgLy8gfSBlbHNlIHtcbiAgICAgICAgICAgIC8vICAgICAkc3RhdGUuZ28oJ2xvZ2luJyk7XG4gICAgICAgICAgICAvLyB9XG4gICAgICAgIH0pO1xuXG4gICAgfSk7XG5cbn0pO1xuIiwiYXBwLmNvbnRyb2xsZXIoXCJBZG1pbkN0cmxcIiwgKCRzY29wZSwgJHN0YXRlLCBBZG1pbkZhY3RvcnksIEFsYnVtRmFjdG9yeSwgUGhvdG9zRmFjdG9yeSkgPT4ge1xuICAgICRzY29wZS5hZGRpbmdQaWN0dXJlcyA9IGZhbHNlO1xuXG4gICAgQWxidW1GYWN0b3J5LmZldGNoQWxsKClcbiAgICAgICAgLnRoZW4oYWxidW1zID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdmZXRjaGVkJywgYWxidW1zKTtcbiAgICAgICAgICAgICRzY29wZS5hbGJ1bXMgPSBhbGJ1bXM7XG4gICAgICAgICAgICAkc2NvcGUuYWxidW1PbmUgPSAkc2NvcGUuYWxidW1zWzBdO1xuICAgICAgICB9KTtcblxuICAgIFBob3Rvc0ZhY3RvcnkuZmV0Y2hUZW4oKVxuICAgICAgICAudGhlbihwaG90b3MgPT4ge1xuICAgICAgICAgICAgJHNjb3BlLnBob3RvcyA9IHBob3RvcztcbiAgICAgICAgfSk7XG5cbiAgICAkc2NvcGUuZGVsZXRlQWxidW0gPSAoYWxidW0pID0+IHtcbiAgICAgICAgQWxidW1GYWN0b3J5LmRlbGV0ZUFsYnVtKGFsYnVtLl9pZCk7XG4gICAgICAgIGxldCBhbGJ1bUluZGV4ID0gJHNjb3BlLmFsYnVtcy5pbmRleE9mKGFsYnVtKTtcbiAgICAgICAgJHNjb3BlLmFsYnVtcy5zcGxpY2UoYWxidW1JbmRleCwgMSk7XG4gICAgfVxuXG4gICAgJHNjb3BlLmNyZWF0ZUFsYnVtID0gKCkgPT4ge1xuICAgICAgICBsZXQgYWxidW0gPSB7XG4gICAgICAgICAgICB0aXRsZTogJHNjb3BlLm5ld0FsYnVtXG4gICAgICAgIH1cbiAgICAgICAgQWxidW1GYWN0b3J5LmNyZWF0ZUFsYnVtKGFsYnVtKS50aGVuKGFsYnVtID0+IHtcbiAgICAgICAgICAgICRzY29wZS5hbGJ1bXMucHVzaChhbGJ1bSk7XG4gICAgICAgICAgICAkc2NvcGUubmV3QWxidW0gPSBcIlwiO1xuICAgICAgICB9KVxuICAgIH1cblxuICAgICRzY29wZS5hZGRQaG90b3MgPSAoYWxidW0pID0+IHtcbiAgICAgICAgJHNjb3BlLnNlbGVjdGluZ1BpY3R1cmVzID0gdHJ1ZTtcbiAgICAgICAgJHNjb3BlLmN1cnJlbnRBbGJ1bSA9IGFsYnVtO1xuICAgICAgICBQaG90b3NGYWN0b3J5LmZldGNoQWxsKClcbiAgICAgICAgICAgIC50aGVuKHBob3RvcyA9PiB7XG4gICAgICAgICAgICAgICAgJHNjb3BlLnBob3RvcyA9IHBob3RvcztcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgICRzY29wZS52aWV3QWxidW0gPSAoYWxidW0pID0+IHtcbiAgICBcdCRzdGF0ZS5nbygnc2luZ2xlQWxidW0nLCB7YWxidW1JZDogYWxidW0uX2lkfSlcbiAgICB9XG5cblxuICAgICRzY29wZS51cGRhdGVBbGJ1bSA9ICgpID0+IHtcbiAgICAgICAgQWxidW1GYWN0b3J5LnVwZGF0ZUFsYnVtKCRzY29wZS5jdXJyZW50QWxidW0pLnRoZW4ocmVzID0+IHtcbiAgICAgICAgXHQkc3RhdGUucmVsb2FkKCk7XG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgJHNjb3BlLnVwbG9hZFBob3RvcyA9ICgpID0+IHtcbiAgICAgICAgJHN0YXRlLmdvKCd1cGxvYWRQaG90b3MnKTtcbiAgICB9XG5cbiAgICAkc2NvcGUuYWRkVG9BbGJ1bSA9IChwaG90bykgPT4ge1xuICAgICAgICAkc2NvcGUuY3VycmVudEFsYnVtLnBob3Rvcy5wdXNoKHBob3RvLl9pZCk7XG4gICAgfVxufSkiLCJhcHAuZmFjdG9yeShcIkFkbWluRmFjdG9yeVwiLCAoJGh0dHApID0+IHtcblx0cmV0dXJuIHtcblx0XHRcblx0fVxufSk7IiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnYWRtaW4nLCB7XG4gICAgICAgIHVybDogJy9hZG1pbicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvYWRtaW4vYWRtaW4uaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdBbGJ1bUN0cmwnLFxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICBhdXRoZW50aWNhdGU6IHRydWVcbiAgICAgICAgfVxuICAgIH0pO1xufSk7IiwiKGZ1bmN0aW9uICgpIHtcblxuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vIEhvcGUgeW91IGRpZG4ndCBmb3JnZXQgQW5ndWxhciEgRHVoLWRveS5cbiAgICBpZiAoIXdpbmRvdy5hbmd1bGFyKSB0aHJvdyBuZXcgRXJyb3IoJ0kgY2FuXFwndCBmaW5kIEFuZ3VsYXIhJyk7XG5cbiAgICB2YXIgYXBwID0gYW5ndWxhci5tb2R1bGUoJ2ZzYVByZUJ1aWx0JywgW10pO1xuXG4gICAgYXBwLmZhY3RvcnkoJ1NvY2tldCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF3aW5kb3cuaW8pIHRocm93IG5ldyBFcnJvcignc29ja2V0LmlvIG5vdCBmb3VuZCEnKTtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5pbyh3aW5kb3cubG9jYXRpb24ub3JpZ2luKTtcbiAgICB9KTtcblxuICAgIC8vIEFVVEhfRVZFTlRTIGlzIHVzZWQgdGhyb3VnaG91dCBvdXIgYXBwIHRvXG4gICAgLy8gYnJvYWRjYXN0IGFuZCBsaXN0ZW4gZnJvbSBhbmQgdG8gdGhlICRyb290U2NvcGVcbiAgICAvLyBmb3IgaW1wb3J0YW50IGV2ZW50cyBhYm91dCBhdXRoZW50aWNhdGlvbiBmbG93LlxuICAgIGFwcC5jb25zdGFudCgnQVVUSF9FVkVOVFMnLCB7XG4gICAgICAgIGxvZ2luU3VjY2VzczogJ2F1dGgtbG9naW4tc3VjY2VzcycsXG4gICAgICAgIGxvZ2luRmFpbGVkOiAnYXV0aC1sb2dpbi1mYWlsZWQnLFxuICAgICAgICBsb2dvdXRTdWNjZXNzOiAnYXV0aC1sb2dvdXQtc3VjY2VzcycsXG4gICAgICAgIHNlc3Npb25UaW1lb3V0OiAnYXV0aC1zZXNzaW9uLXRpbWVvdXQnLFxuICAgICAgICBub3RBdXRoZW50aWNhdGVkOiAnYXV0aC1ub3QtYXV0aGVudGljYXRlZCcsXG4gICAgICAgIG5vdEF1dGhvcml6ZWQ6ICdhdXRoLW5vdC1hdXRob3JpemVkJ1xuICAgIH0pO1xuXG4gICAgYXBwLmZhY3RvcnkoJ0F1dGhJbnRlcmNlcHRvcicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCAkcSwgQVVUSF9FVkVOVFMpIHtcbiAgICAgICAgdmFyIHN0YXR1c0RpY3QgPSB7XG4gICAgICAgICAgICA0MDE6IEFVVEhfRVZFTlRTLm5vdEF1dGhlbnRpY2F0ZWQsXG4gICAgICAgICAgICA0MDM6IEFVVEhfRVZFTlRTLm5vdEF1dGhvcml6ZWQsXG4gICAgICAgICAgICA0MTk6IEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LFxuICAgICAgICAgICAgNDQwOiBBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVzcG9uc2VFcnJvcjogZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KHN0YXR1c0RpY3RbcmVzcG9uc2Uuc3RhdHVzXSwgcmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgIHJldHVybiAkcS5yZWplY3QocmVzcG9uc2UpXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfSk7XG5cbiAgICBhcHAuY29uZmlnKGZ1bmN0aW9uICgkaHR0cFByb3ZpZGVyKSB7XG4gICAgICAgICRodHRwUHJvdmlkZXIuaW50ZXJjZXB0b3JzLnB1c2goW1xuICAgICAgICAgICAgJyRpbmplY3RvcicsXG4gICAgICAgICAgICBmdW5jdGlvbiAoJGluamVjdG9yKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRpbmplY3Rvci5nZXQoJ0F1dGhJbnRlcmNlcHRvcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICBdKTtcbiAgICB9KTtcblxuICAgIGFwcC5zZXJ2aWNlKCdBdXRoU2VydmljZScsIGZ1bmN0aW9uICgkaHR0cCwgU2Vzc2lvbiwgJHJvb3RTY29wZSwgQVVUSF9FVkVOVFMsICRxLCAkc3RhdGUpIHtcbiAgICAgICAgZnVuY3Rpb24gb25TdWNjZXNzZnVsTG9naW4ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gcmVzcG9uc2UuZGF0YTtcbiAgICAgICAgICAgIFNlc3Npb24uY3JlYXRlKGRhdGEuaWQsIGRhdGEudXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoQVVUSF9FVkVOVFMubG9naW5TdWNjZXNzKTtcbiAgICAgICAgICAgIHJldHVybiBkYXRhLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVc2VzIHRoZSBzZXNzaW9uIGZhY3RvcnkgdG8gc2VlIGlmIGFuXG4gICAgICAgIC8vIGF1dGhlbnRpY2F0ZWQgdXNlciBpcyBjdXJyZW50bHkgcmVnaXN0ZXJlZC5cbiAgICAgICAgdGhpcy5pc0F1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gISFTZXNzaW9uLnVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5nZXRMb2dnZWRJblVzZXIgPSBmdW5jdGlvbiAoZnJvbVNlcnZlcikge1xuXG4gICAgICAgICAgICAvLyBJZiBhbiBhdXRoZW50aWNhdGVkIHNlc3Npb24gZXhpc3RzLCB3ZVxuICAgICAgICAgICAgLy8gcmV0dXJuIHRoZSB1c2VyIGF0dGFjaGVkIHRvIHRoYXQgc2Vzc2lvblxuICAgICAgICAgICAgLy8gd2l0aCBhIHByb21pc2UuIFRoaXMgZW5zdXJlcyB0aGF0IHdlIGNhblxuICAgICAgICAgICAgLy8gYWx3YXlzIGludGVyZmFjZSB3aXRoIHRoaXMgbWV0aG9kIGFzeW5jaHJvbm91c2x5LlxuXG4gICAgICAgICAgICAvLyBPcHRpb25hbGx5LCBpZiB0cnVlIGlzIGdpdmVuIGFzIHRoZSBmcm9tU2VydmVyIHBhcmFtZXRlcixcbiAgICAgICAgICAgIC8vIHRoZW4gdGhpcyBjYWNoZWQgdmFsdWUgd2lsbCBub3QgYmUgdXNlZC5cblxuICAgICAgICAgICAgaWYgKHRoaXMuaXNBdXRoZW50aWNhdGVkKCkgJiYgZnJvbVNlcnZlciAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAkcS53aGVuKFNlc3Npb24udXNlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE1ha2UgcmVxdWVzdCBHRVQgL3Nlc3Npb24uXG4gICAgICAgICAgICAvLyBJZiBpdCByZXR1cm5zIGEgdXNlciwgY2FsbCBvblN1Y2Nlc3NmdWxMb2dpbiB3aXRoIHRoZSByZXNwb25zZS5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSA0MDEgcmVzcG9uc2UsIHdlIGNhdGNoIGl0IGFuZCBpbnN0ZWFkIHJlc29sdmUgdG8gbnVsbC5cbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9zZXNzaW9uJykudGhlbihvblN1Y2Nlc3NmdWxMb2dpbikuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmxvZ2luID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIGxvZ2luIGNyZWRlbnRpYWxzLicgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KCcvbG9nb3V0JykudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgU2Vzc2lvbi5kZXN0cm95KCk7XG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEFVVEhfRVZFTlRTLmxvZ291dFN1Y2Nlc3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICB9KTtcblxuICAgIGFwcC5zZXJ2aWNlKCdTZXNzaW9uJywgZnVuY3Rpb24gKCRyb290U2NvcGUsIEFVVEhfRVZFTlRTKSB7XG5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLm5vdEF1dGhlbnRpY2F0ZWQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi5kZXN0cm95KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuaWQgPSBudWxsO1xuICAgICAgICB0aGlzLnVzZXIgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuY3JlYXRlID0gZnVuY3Rpb24gKHNlc3Npb25JZCwgdXNlcikge1xuICAgICAgICAgICAgdGhpcy5pZCA9IHNlc3Npb25JZDtcbiAgICAgICAgICAgIHRoaXMudXNlciA9IHVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5pZCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSBudWxsO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbn0pKCk7XG4iLCJhcHAuY29uZmlnKCgkc3RhdGVQcm92aWRlcikgPT4ge1xuXHQkc3RhdGVQcm92aWRlci5zdGF0ZSgnbG9naW4nLHtcblx0XHR1cmw6ICcvbG9naW4nLFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvYXV0aC9sb2dpbi5odG1sJyxcblx0XHRjb250cm9sbGVyOiAnTG9naW5DdHJsJ1xuXHR9KVxufSk7XG5cbmFwcC5jb250cm9sbGVyKCdMb2dpbkN0cmwnLCAoJHNjb3BlLCAkc3RhdGUsIEF1dGhTZXJ2aWNlLCBEaWFsb2dGYWN0b3J5KSA9PiB7XG5cdCRzY29wZS5sb2dpbiA9ICgpID0+IHtcblx0XHRsZXQgY3JlZGVudGlhbHMgPSB7XG5cdFx0XHRlbWFpbDogJHNjb3BlLmVtYWlsLFxuXHRcdFx0cGFzc3dvcmQ6ICRzY29wZS5wYXNzd29yZFxuXHRcdH1cblx0XHRBdXRoU2VydmljZS5sb2dpbihjcmVkZW50aWFscykudGhlbigocmVzKSA9PiB7XG5cdFx0XHQkc3RhdGUuZ28oJ2hvbWUnKTtcblx0XHR9KTtcblx0fVxuXG5cdCRzY29wZS5nZXRVc2VyID0gKCkgPT4ge1xuXHRcdEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpLnRoZW4odXNlciA9PiB7XG5cdFx0XHRjb25zb2xlLmxvZygnTG9naW4uanM6IGxvZ2dlZCBpbiB1c2VyJywgdXNlcik7XG5cdFx0XHRcblx0XHR9KVxuXHR9XG59KSIsImFwcC5jb250cm9sbGVyKCdBbGJ1bUN0cmwnLCAoJHNjb3BlLCAkdGltZW91dCwgJHN0YXRlLCBBZG1pbkZhY3RvcnksIEFsYnVtRmFjdG9yeSwgUGhvdG9zRmFjdG9yeSwgRGlhbG9nRmFjdG9yeSkgPT4ge1xuICAgICRzY29wZS5hZGRpbmdQaWN0dXJlcyA9IGZhbHNlO1xuXG4gICAgQWxidW1GYWN0b3J5LmZldGNoQWxsKClcbiAgICAgICAgLnRoZW4oYWxidW1zID0+IHtcbiAgICAgICAgICAgICRzY29wZS5hbGJ1bXMgPSBhbGJ1bXM7XG4gICAgICAgICAgICAkc2NvcGUuYWxidW1PbmUgPSAkc2NvcGUuYWxidW1zWzBdO1xuICAgICAgICB9KTtcblxuICAgIFBob3Rvc0ZhY3RvcnkuZmV0Y2hUZW4oKVxuICAgICAgICAudGhlbihwaG90b3MgPT4ge1xuICAgICAgICAgICAgJHNjb3BlLnBob3RvcyA9IHBob3RvcztcbiAgICAgICAgfSk7XG5cbiAgICAkc2NvcGUuZGVsZXRlQWxidW0gPSAoYWxidW0pID0+IHtcbiAgICAgICAgQWxidW1GYWN0b3J5LmRlbGV0ZUFsYnVtKGFsYnVtLl9pZCk7XG4gICAgICAgIGxldCBhbGJ1bUluZGV4ID0gJHNjb3BlLmFsYnVtcy5pbmRleE9mKGFsYnVtKTtcbiAgICAgICAgJHNjb3BlLmFsYnVtcy5zcGxpY2UoYWxidW1JbmRleCwgMSk7XG4gICAgfVxuXG4gICAgJHNjb3BlLmNyZWF0ZUFsYnVtID0gKCkgPT4ge1xuICAgICAgICBsZXQgYWxidW0gPSB7XG4gICAgICAgICAgICB0aXRsZTogJHNjb3BlLm5ld0FsYnVtXG4gICAgICAgIH1cbiAgICAgICAgQWxidW1GYWN0b3J5LmNyZWF0ZUFsYnVtKGFsYnVtKS50aGVuKGFsYnVtID0+IHtcbiAgICAgICAgICAgIERpYWxvZ0ZhY3RvcnkuZGlzcGxheShcIkNyZWF0ZWRcIik7XG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgJHNjb3BlLmFkZFBob3RvcyA9IChhbGJ1bSkgPT4ge1xuICAgICAgICAkc2NvcGUuc2VsZWN0aW5nUGljdHVyZXMgPSB0cnVlO1xuICAgICAgICAkc2NvcGUuY3VycmVudEFsYnVtID0gYWxidW07XG4gICAgICAgIFBob3Rvc0ZhY3RvcnkuZmV0Y2hBbGwoKVxuICAgICAgICAgICAgLnRoZW4ocGhvdG9zID0+IHtcbiAgICAgICAgICAgICAgICAkc2NvcGUucGhvdG9zID0gcGhvdG9zO1xuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgJHNjb3BlLnZpZXdBbGJ1bSA9IChhbGJ1bSkgPT4ge1xuXG4gICAgfVxuXG5cbiAgICAkc2NvcGUudXBkYXRlQWxidW0gPSAoKSA9PiB7XG4gICAgICAgIEFsYnVtRmFjdG9yeS51cGRhdGVBbGJ1bSgkc2NvcGUuY3VycmVudEFsYnVtKS50aGVuKHJlcyA9PiB7XG4gICAgICAgICAgICBEaWFsb2dGYWN0b3J5LmRpc3BsYXkoXCJVcGRhdGVkXCIsIDE1MDApO1xuICAgICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgJHN0YXRlLnJlbG9hZCgpO1xuICAgICAgICAgICAgfSwgMTAwMCk7XG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgJHNjb3BlLnZpZXdBbGJ1bSA9IChhbGJ1bSkgPT4ge1xuICAgICAgICAkc3RhdGUuZ28oJ3NpbmdsZUFsYnVtJywge2FsYnVtSWQ6IGFsYnVtLl9pZH0pXG4gICAgfVxuXG4gICAgJHNjb3BlLmFkZFRvQWxidW0gPSAocGhvdG8pID0+IHtcbiAgICAgICAgJHNjb3BlLmN1cnJlbnRBbGJ1bS5waG90b3MucHVzaChwaG90by5faWQpO1xuICAgICAgICBEaWFsb2dGYWN0b3J5LmRpc3BsYXkoXCJBZGRlZFwiLCAxMDAwKTtcbiAgICB9XG5cblxuXG59KSIsImFwcC5mYWN0b3J5KCdBbGJ1bUZhY3RvcnknLCBmdW5jdGlvbigkaHR0cCwgJHN0YXRlLCAkdGltZW91dCwgRGlhbG9nRmFjdG9yeSkge1xuICAgIGxldCBzdWNjZXNzID0gKHRleHQpID0+IHtcbiAgICAgICAgRGlhbG9nRmFjdG9yeS5kaXNwbGF5KHRleHQsIDc1MCk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIGNyZWF0ZUFsYnVtOiAoYWxidW0pID0+IHtcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCcvYXBpL2FsYnVtcy8nLCBhbGJ1bSkudGhlbihyZXMgPT4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3MoXCJjcmVhdGVkXCIpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwicmVzXCIsIHJlcyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlcy5kYXRhO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiZXJyb3Igc2F2aW5nIGFsYnVtXCIsIGUpO1xuICAgICAgICAgICAgfSlcblxuICAgICAgICB9LFxuICAgICAgICBmZXRjaEFsbDogKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL2FwaS9hbGJ1bXMvJylcbiAgICAgICAgICAgIC50aGVuKHJlcyA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlcy5kYXRhO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgfSxcbiAgICAgICAgdXBkYXRlQWxidW06IChhbGJ1bSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLnBvc3QoJy9hcGkvYWxidW1zL3VwZGF0ZScsIGFsYnVtKVxuICAgICAgICAgICAgLnRoZW4ocmVzID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzLmRhdGE7XG4gICAgICAgICAgICB9KVxuICAgICAgICB9LFxuICAgICAgICBmZXRjaE9uZTogKGFsYnVtSWQpID0+IHtcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9hcGkvYWxidW1zLycrIGFsYnVtSWQpXG4gICAgICAgICAgICAudGhlbihyZXMgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXMuZGF0YVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIGZpbmRVc2VyQWxidW1zOiAodXNlcklkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KCcvYXBpL2FsYnVtcy91c2VyLycgKyB1c2VySWQpLnRoZW4ocmVzID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzLmRhdGE7XG4gICAgICAgICAgICB9KVxuICAgICAgICB9LFxuICAgICAgICBhZGRQaG90bzogKGFsYnVtSWQsIHBob3RvSWQpID0+IHtcbiAgICAgICAgICAgIGxldCBvYmogPSB7fTtcbiAgICAgICAgICAgIG9iai5hbGJ1bUlkID0gYWxidW1JZDtcbiAgICAgICAgICAgIG9iai5waG90b0lkID0gcGhvdG9JZDtcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCcvYXBpL2FsYnVtcy9hZGRQaG90bycsIG9iailcbiAgICAgICAgICAgIC50aGVuKHJlcyA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlcy5kYXRhXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgZGVsZXRlQWxidW06IChhbGJ1bUlkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAuZGVsZXRlKCcvYXBpL2FsYnVtcy8nKyBhbGJ1bUlkKVxuICAgICAgICB9LCBcbiAgICAgICAgZmV0Y2hQaG90b3NJbkFsYnVtOiAoYWxidW1JZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL2FwaS9hbGJ1bXMvcGhvdG9zLycgKyBhbGJ1bUlkKS50aGVuKHJlcyA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJyZXNcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlcy5kYXRhXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxufSkiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdhbGJ1bScsIHtcbiAgICAgICAgdXJsOiAnL0FsYnVtJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9hbGJ1bS9hbGJ1bS5odG1sJ1xuXG4gICAgfSk7XG59KTtcblxuXG5hcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdzaW5nbGVBbGJ1bScsIHtcbiAgICAgICAgdXJsOiAnL0FsYnVtLzphbGJ1bUlkJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9hbGJ1bS9zaW5nbGUtYWxidW0uaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdTaW5nbGVBbGJ1bUN0cmwnLFxuICAgICAgICByZXNvbHZlOiB7XG4gICAgICAgIFx0YWxidW06IChBbGJ1bUZhY3RvcnksICRzdGF0ZVBhcmFtcykgPT4ge1xuICAgICAgICBcdFx0cmV0dXJuIEFsYnVtRmFjdG9yeS5mZXRjaE9uZSgkc3RhdGVQYXJhbXMuYWxidW1JZClcbiAgICAgICAgXHR9XG4gICAgICAgIH1cbiAgICAgIFxuICAgIH0pO1xufSk7XG4iLCJhcHAuY29udHJvbGxlcignQWxidW1zQ3RybCcsICgkc2NvcGUsICRzdGF0ZSwgUGhvdG9zRmFjdG9yeSwgQWxidW1GYWN0b3J5LCBVc2VyRmFjdG9yeSwgRGlhbG9nRmFjdG9yeSkgPT4ge1xuXHRBbGJ1bUZhY3RvcnkuZmV0Y2hBbGwoKVxuICAgICAgICAudGhlbihhbGJ1bXMgPT4ge1xuICAgICAgICAgICAgJHNjb3BlLmFsYnVtcyA9IGFsYnVtcztcbiAgICAgICAgICAgICRzY29wZS5hbGJ1bU9uZSA9ICRzY29wZS5hbGJ1bXNbMF07XG4gICAgICAgIH0pO1xuXG4gICAgJHNjb3BlLnZpZXdBbGJ1bSA9IChhbGJ1bSkgPT4ge1xuICAgICAgICAkc3RhdGUuZ28oJ3NpbmdsZUFsYnVtJywge2FsYnVtSWQ6IGFsYnVtLl9pZH0pXG4gICAgfVxuXG4gICAgJHNjb3BlLmZvbGxvd0FsYnVtID0gKGFsYnVtKSA9PiB7XG4gICAgXHRVc2VyRmFjdG9yeS5mb2xsb3dBbGJ1bShhbGJ1bSlcbiAgICB9XG5cbiAgICAkc2NvcGUuY3JlYXRlQWxidW0gPSAoKSA9PiB7XG4gICAgICAgICRzdGF0ZS5nbygnbmV3QWxidW0nKTtcbiAgICAgICAgLy8gbGV0IGFsYnVtID0ge1xuICAgICAgICAvLyAgICAgdGl0bGU6ICRzY29wZS5uZXdBbGJ1bVxuICAgICAgICAvLyB9XG4gICAgICAgIC8vIEFsYnVtRmFjdG9yeS5jcmVhdGVBbGJ1bShhbGJ1bSkudGhlbihhbGJ1bSA9PiB7XG4gICAgICAgIC8vICAgICBEaWFsb2dGYWN0b3J5LmRpc3BsYXkoXCJDcmVhdGVkXCIpO1xuICAgICAgICAvLyB9KVxuICAgIH1cblxufSk7IiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnYWxidW1zJywge1xuICAgICAgICB1cmw6ICcvYWxidW1zJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9hbGJ1bS9hbGJ1bXMuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdBbGJ1bXNDdHJsJ1xuICAgIH0pO1xufSk7IiwiYXBwLmNvbmZpZygoJHN0YXRlUHJvdmlkZXIpID0+IHtcblx0JHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2VkaXRBbGJ1bScsIHtcblx0XHR1cmw6ICcvZWRpdEFsYnVtLzphbGJ1bUlkJyxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL2FsYnVtL2VkaXQtYWxidW0uaHRtbCcsXG5cdFx0Y29udHJvbGxlcjogJ0VkaXRBbGJ1bUN0cmwnLFxuXHRcdHJlc29sdmU6IHtcblx0XHRcdGFsYnVtOiAoQWxidW1GYWN0b3J5LCAkc3RhdGVQYXJhbXMpID0+IHtcblx0XHRcdFx0cmV0dXJuIEFsYnVtRmFjdG9yeS5mZXRjaE9uZSgkc3RhdGVQYXJhbXMuYWxidW1JZClcblx0XHRcdH1cblx0XHR9XG5cdH0pXG59KTtcblxuXG5hcHAuY29udHJvbGxlcignRWRpdEFsYnVtQ3RybCcsICgkc2NvcGUsIEFsYnVtRmFjdG9yeSwgUGhvdG9zRmFjdG9yeSwgRGlhbG9nRmFjdG9yeSwgYWxidW0pID0+IHtcblx0JHNjb3BlLmFkZGluZ1BpY3R1cmVzID0gZmFsc2U7XG5cblx0bGV0IHNldERhdGUgPSAoKSA9PiB7XG5cdFx0YWxidW0uZGF0ZSA9IG5ldyBEYXRlKGFsYnVtLmRhdGUpO1xuXHRcdCRzY29wZS5hbGJ1bSA9IGFsYnVtO1xuXHR9XG5cdHNldERhdGUoKTtcblxuXHQkc2NvcGUuc2F2ZUFsYnVtID0oKSA9PiB7XG5cdFx0QWxidW1GYWN0b3J5LnVwZGF0ZUFsYnVtKCRzY29wZS5hbGJ1bSlcblx0XHQudGhlbihyZXMgPT4ge1xuXHRcdFx0JHNjb3BlLmFsYnVtID0gcmVzO1xuXHRcdFx0JHNjb3BlLnNlbGVjdGluZ1BpY3R1cmVzID0gZmFsc2U7XG5cdFx0XHREaWFsb2dGYWN0b3J5LmRpc3BsYXkoJ1NhdmVkJywgMTAwMCk7XG5cdFx0fSlcblx0fVxuXG5cdCRzY29wZS5hZGRQaG90b3MgPSAoKSA9PiB7XG5cdFx0Y29uc29sZS5sb2coJ2FkZGluZycpO1xuXHRcdFBob3Rvc0ZhY3RvcnkuZmV0Y2hBbGwoKS50aGVuKHBob3RvcyA9PiB7XG5cdFx0XHRjb25zb2xlLmxvZygncGhvdG9zJywgcGhvdG9zKTtcblx0XHRcdCRzY29wZS5zZWxlY3RpbmdQaWN0dXJlcyA9IHRydWU7XG5cdFx0XHQkc2NvcGUucGhvdG9zID0gcGhvdG9zO1xuXHRcdH0pXG5cdH1cblxuXHQkc2NvcGUuYWRkVG9BbGJ1bSA9IChwaG90bykgPT4ge1xuXHRcdGNvbnNvbGUubG9nKFwiYWRkZWRcIiwgcGhvdG8pO1xuICAgICAgICAkc2NvcGUuYWxidW0ucGhvdG9zLnB1c2gocGhvdG8uX2lkKTtcbiAgICAgICAgQWxidW1GYWN0b3J5LmFkZFBob3RvKGFsYnVtLl9pZCwgcGhvdG8uX2lkKVxuICAgIH1cbn0pIiwiYXBwLmNvbnRyb2xsZXIoJ05ld0FsYnVtQ3RybCcsICgkc2NvcGUsICRzdGF0ZSwgQWxidW1GYWN0b3J5LCBQaG90b3NGYWN0b3J5LCBTZXNzaW9uLCBEaWFsb2dGYWN0b3J5LCBBdXRoU2VydmljZSkgPT4ge1xuXHRjb25zb2xlLmxvZygnU2Vzc2lvbicsIFNlc3Npb24pO1xuXHQkc2NvcGUuc2hvd1Bob3RvcyA9IGZhbHNlO1xuXG5cdCRzY29wZS5jcmVhdGVBbGJ1bSA9ICgpID0+IHtcbiAgICAgICAgaWYoU2Vzc2lvbi51c2VyKSB7XG5cdFx0ICAkc2NvcGUuYWxidW0ub3duZXIgPSBTZXNzaW9uLnVzZXIuX2lkO1xuICAgICAgICB9XG5cdFx0Y29uc29sZS5sb2coJHNjb3BlLmFsYnVtKTtcblxuICAgICAgICBBbGJ1bUZhY3RvcnkuY3JlYXRlQWxidW0oJHNjb3BlLmFsYnVtKVxuICAgIH1cblxuXG5cbiAgICAkc2NvcGUuYWRkVG9BbGJ1bSA9IChwaG90bykgPT4ge1xuICAgIFx0RGlhbG9nRmFjdG9yeS5kaXNwbGF5KCdBZGRlZCcsIDc1MCk7XG4gICAgICAgICRzY29wZS5hbGJ1bS5waG90b3MucHVzaChwaG90byk7XG4gICAgICAgICRzY29wZS5hbGJ1bS5jb3ZlciA9IHBob3RvO1xuICAgIH1cblxuICAgICRzY29wZS5zYXZlQWxidW0gPSAoKSA9PiB7XG4gICAgXHRBbGJ1bUZhY3RvcnkudXBkYXRlQWxidW0oJHNjb3BlLmFsYnVtKS50aGVuKGFsYnVtID0+IHtcbiAgICBcdFx0JHN0YXRlLmdvKCdhbGJ1bXMnKTtcbiAgICBcdH0pXG4gICAgfVxufSk7IiwiYXBwLmNvbmZpZygoJHN0YXRlUHJvdmlkZXIpID0+IHtcblx0JHN0YXRlUHJvdmlkZXIuc3RhdGUoJ25ld0FsYnVtJywge1xuXHRcdHVybDogJy9uZXdBbGJ1bScsXG5cdFx0dGVtcGxhdGVVcmw6ICdqcy9hbGJ1bS9uZXctYWxidW0uaHRtbCcsXG5cdFx0Y29udHJvbGxlcjogJ05ld0FsYnVtQ3RybCdcblx0fSlcbn0pO1xuXG4iLCJhcHAuY29udHJvbGxlcignU2luZ2xlQWxidW1DdHJsJywgKCRzY29wZSwgJHRpbWVvdXQsICRzdGF0ZSwgYWxidW0sIEFkbWluRmFjdG9yeSwgQWxidW1GYWN0b3J5LCBQaG90b3NGYWN0b3J5KSA9PiB7XG5cdCRzY29wZS5hbGJ1bSA9IGFsYnVtO1xuXHQkc2NvcGUuc2VsZWN0aW5nQ292ZXIgPSBmYWxzZTtcblx0JHNjb3BlLmNoYW5nZXNNYWRlID0gZmFsc2U7XG5cdCRzY29wZS5yZW1vdmVQaG90b3MgPSBmYWxzZTtcblxuXG5cdGNvbnNvbGUubG9nKFwicGhvdG9zOiBcIiwgYWxidW0ucGhvdG9zKTtcblx0JHNjb3BlLnBob3RvcyA9IGFsYnVtLnBob3Rvcztcblx0JHNjb3BlLnJlbW92ZUZyb21BbGJ1bSA9IChwaG90bykgPT4ge1xuXHRcdGxldCBwaG90b0luZGV4ID0gJHNjb3BlLmFsYnVtLnBob3Rvcy5pbmRleE9mKHBob3RvKTtcblx0XHQkc2NvcGUuYWxidW0ucGhvdG9zLnNwbGljZShwaG90b0luZGV4LCAxKTtcblx0fVxuXG5cdCRzY29wZS5kZWxldGVQaG90b3MgPSAoKSA9PiB7XG5cdFx0JHNjb3BlLnJlbW92ZVBob3RvcyA9IHRydWU7XG5cdH1cblxuXHQkc2NvcGUuc2VsZWN0Q292ZXIgPSAoKSA9PiB7XG5cdFx0JHRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0JHNjb3BlLnNlbGVjdGluZ0NvdmVyID0gdHJ1ZTtcblx0XHRcdCRzY29wZS5jaGFuZ2VzTWFkZSA9IHRydWU7XG5cdFx0fSwgNTAwKTtcblx0fVxuXG5cdCRzY29wZS5hZGRDb3ZlciA9IChwaG90bykgPT4ge1xuICAgICAgICAkc2NvcGUuYWxidW0uY292ZXIgPSBwaG90by5faWQ7XG4gICAgICAgICRzY29wZS5zZWxlY3RpbmdDb3ZlciA9IGZhbHNlO1xuICAgIH1cblxuXHQkc2NvcGUudXBkYXRlQWxidW0gPSAoKSA9PiB7XG4gICAgICAgIEFsYnVtRmFjdG9yeS51cGRhdGVBbGJ1bSgkc2NvcGUuYWxidW0pLnRoZW4ocmVzID0+IHtcbiAgICAgICAgICAgICRzdGF0ZS5nbygnYWRtaW4nKTtcbiAgICAgICAgfSlcbiAgICB9XG5cblxuICAgICRzY29wZS5mZXRjaFBob3RvcyA9ICgpID0+IHtcbiAgICBcdGNvbnNvbGUubG9nKFwiYWxidW06IFwiLCBhbGJ1bSk7XG4gICAgXHRBbGJ1bUZhY3RvcnkuZmV0Y2hQaG90b3NJbkFsYnVtKGFsYnVtLl9pZClcbiAgICBcdC50aGVuKGFsYnVtID0+IHtcbiAgICBcdFx0Y29uc29sZS5sb2coXCJyZXR1cm5lZDogXCIsIGFsYnVtKTtcbiAgICBcdH0pXG4gICAgfVxufSk7IiwiYXBwLmNvbnRyb2xsZXIoJ0NhbGVuZGFyQ3RybCcsICgkc2NvcGUsIFVzZXJGYWN0b3J5LCBBdXRoU2VydmljZSkgPT4ge1xuXG59KTsiLCJhcHAuY29uZmlnKCgkc3RhdGVQcm92aWRlcikgPT4ge1xuXHQkc3RhdGVQcm92aWRlci5zdGF0ZSgnY2FsZW5kYXInLCB7XG5cdFx0dXJsOiAnL2NhbGVuZGFyJyxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL2NhbGVuZGFyL2NhbGVuZGFyLmh0bWwnLFxuXHRcdGNvbnRyb2xsZXI6ICdDYWxlbmRhckN0cmwnXG5cdH0pXG59KTsiLCJhcHAuY29uZmlnKCgkc3RhdGVQcm92aWRlcikgPT4ge1xuXHQkc3RhdGVQcm92aWRlci5zdGF0ZSgnbGF5b3V0Jywge1xuXHRcdHVybDogJy9sYXlvdXQnLFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvbGF5b3V0L2xheW91dC5odG1sJyxcblx0XHRjb250cm9sbGVyOiAnTGF5b3V0Q3RybCcsXG5cdFx0cmVzb2x2ZToge1xuICAgICAgICBcdGFsYnVtczogKEFsYnVtRmFjdG9yeSwgJHN0YXRlUGFyYW1zKSA9PiB7XG4gICAgICAgIFx0XHRyZXR1cm4gQWxidW1GYWN0b3J5LmZldGNoQWxsKClcbiAgICAgICAgXHR9XG4gICAgICAgIH1cblx0fSlcbn0pO1xuXG5cbmFwcC5jb250cm9sbGVyKCdMYXlvdXRDdHJsJywgZnVuY3Rpb24oJHNjb3BlLCBQaG90b3NGYWN0b3J5LCBhbGJ1bXMpIHtcblx0Y29uc29sZS5sb2coXCJhbGwgYWxidW1zXCIsIGFsYnVtcyk7XG5cdCRzY29wZS5hbGJ1bXMgPSBhbGJ1bXM7XG5cdCRzY29wZS5nZXRGaWxlcyA9ICgpID0+IHtcblx0XHRjb25zb2xlLmxvZyhcImdldHRpbmcgRmlsZXNcIik7XG5cdFx0UGhvdG9zRmFjdG9yeS5nZXRGaWxlcygpO1xuXHR9XG59KTsiLCJhcHAuY29udHJvbGxlcignSG9tZUN0cmwnLCBmdW5jdGlvbigkc2NvcGUsIGhvbWVQaG90b3MsIFBob3Rvc0ZhY3RvcnkpIHtcbiAgICAkc2NvcGUudXBkYXRlQWxsID0gKCkgPT4ge1xuICAgICAgICBQaG90b3NGYWN0b3J5LnVwZGF0ZUFsbCgpXG4gICAgfVxuXG4gICAgJHNjb3BlLmdldFJhbmRvbSA9ICgpID0+IHtcbiAgICB9XG5cbiAgICAkc2NvcGUuc2xpZGVQaG90b3MgPSBob21lUGhvdG9zO1xuXG5cbiAgICAkKGRvY3VtZW50KS5yZWFkeShmdW5jdGlvbigpIHtcblxuICAgICAgICQoXCIjb3dsLWRlbW9cIikub3dsQ2Fyb3VzZWwoe1xuXG4gICAgICAgICAgICBhdXRvUGxheTogMzAwMCwgLy9TZXQgQXV0b1BsYXkgdG8gMyBzZWNvbmRzXG5cbiAgICAgICAgICAgIGl0ZW1zOiAzLFxuXG4gICAgICAgIH0pO1xuXG4gICAgfSk7XG5cblxufSkiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdob21lJywge1xuICAgICAgICB1cmw6ICcvJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICcvanMvaG9tZS9ob21lLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnSG9tZUN0cmwnLCBcbiAgICAgICAgcmVzb2x2ZToge1xuICAgICAgICBcdGhvbWVQaG90b3M6IChQaG90b3NGYWN0b3J5KSA9PiB7XG4gICAgICAgIFx0XHRyZXR1cm4gUGhvdG9zRmFjdG9yeS5nZXRSYW5kb20oMTApXG4gICAgICAgIFx0fVxuICAgICAgICB9XG4gICAgICAgIFxuICAgIH0pO1xufSk7IiwiYXBwLmNvbnRyb2xsZXIoJ1Bob3RvQ3RybCcsICgkc2NvcGUsICRzdGF0ZSwgUGhvdG9zRmFjdG9yeSwgQWxidW1GYWN0b3J5LCBVc2VyRmFjdG9yeSwgcGhvdG9zKSA9PiB7XG4gICAgbGV0IGFsYnVtQXJyYXkgPSBbXTtcbiAgICAkc2NvcGUudGl0bGUgPSBcIldlbGNvbWVcIjtcbiAgICAkc2NvcGUucGhvdG9zR290ID0gZmFsc2U7XG4gICAgJHNjb3BlLnVwbG9hZFBhZ2UgPSAoKSA9PiB7XG4gICAgICAgICRzdGF0ZS5nbygnYWRkcGhvdG8nKTtcbiAgICB9XG5cbiAgICAvLyBBbGJ1bUZhY3RvcnkuZmV0Y2hBbGwoKVxuICAgIC8vICAgICAudGhlbihhbGJ1bXMgPT4ge1xuICAgIC8vICAgICAgICAgJHNjb3BlLmFsYnVtcyA9IGFsYnVtcztcbiAgICAvLyAgICAgfSlcbiAgICAvLyBQaG90b3NGYWN0b3J5LmZldGNoQWxsKCkudGhlbihwaG90b3MgPT4ge1xuICAgIC8vICAgICAkc2NvcGUucGhvdG9zID0gcGhvdG9zO1xuICAgIC8vIH0pXG4gICAgY29uc29sZS5sb2cocGhvdG9zKTtcblxuICAgICRzY29wZS5waG90b3MgPSBwaG90b3NcblxuICAgICRzY29wZS5hZGRQaG90b3MgPSAoKSA9PiB7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDw9IDQ0OyBpKyspIHtcbiAgICAgICAgICAgIGxldCBzcmMgPSAnL2ltYWdlL0lNR18nICsgaSArICcuanBnJztcbiAgICAgICAgICAgIFBob3Rvc0ZhY3RvcnkuYWRkUGhvdG8oc3JjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgICRzY29wZS5mZXRjaEFsbCA9ICgpID0+IHtcbiAgICAgICAgUGhvdG9zRmFjdG9yeS5mZXRjaEFsbCgpLnRoZW4ocGhvdG9zID0+IHtcbiAgICAgICAgICAgICRzY29wZS5waG90b3MgPSBwaG90b3M7XG4gICAgICAgIH0pXG4gICAgfVxuXG5cbiAgICAkc2NvcGUuY3JlYXRlQWxidW0gPSAoKSA9PiB7XG4gICAgICAgICRzY29wZS5uZXdBbGJ1bSA9IHtcbiAgICAgICAgICAgIHRpdGxlOiAkc2NvcGUuYWxidW1OYW1lLFxuICAgICAgICAgICAgcGhvdG9zOiBbJ2ltYWdlL0lNR18xLmpwZyddXG4gICAgICAgIH1cbiAgICAgICAgUGhvdG9zRmFjdG9yeS5jcmVhdGVBbGJ1bSgkc2NvcGUubmV3QWxidW0pO1xuICAgIH1cblxuICAgICRzY29wZS5nZXRBbGJ1bXMgPSAoKSA9PiB7XG4gICAgICAgIFBob3Rvc0ZhY3RvcnkuZmV0Y2hBbGJ1bXMoKVxuICAgICAgICAgICAgLnRoZW4oYWxidW1zID0+IHtcbiAgICAgICAgICAgICAgICAkc2NvcGUuYWxidW1zID0gYWxidW1zO1xuICAgICAgICAgICAgfSlcbiAgICB9XG5cbiAgICAkc2NvcGUuYWRkVG9BbGJ1bSA9IChwaG90bykgPT4ge1xuICAgICAgICBhbGJ1bUFycmF5LnB1c2gocGhvdG8pO1xuICAgIH1cblxuICAgICRzY29wZS5zYXZlQWxidW0gPSAoKSA9PiB7XG4gICAgfVxuXG4gICAgJHNjb3BlLmZvbGxvd1Bob3RvID0gKHBob3RvKSA9PiB7XG4gICAgICAgIFVzZXJGYWN0b3J5LmZvbGxvd1Bob3RvKHBob3RvKVxuICAgIH1cblxuICAgXG5cblxuXG5cbn0pOyIsImFwcC5mYWN0b3J5KCdQaG90b3NGYWN0b3J5JywgKCRodHRwKSA9PiB7XG5cdHJldHVybiB7XG5cdFx0YWRkUGhvdG86IChzcmMpID0+IHtcblx0XHRcdGxldCBwaG90byA9IHtcblx0XHRcdFx0c3JjOiBzcmMsXG5cdFx0XHRcdG5hbWU6ICd0ZXN0J1xuXHRcdFx0fVxuXHRcdFx0JGh0dHAucG9zdCgnL2FwaS9waG90b3MvYWRkJywgcGhvdG8pXG5cdFx0XHQudGhlbihyZXMgPT4ge1xuXHRcdFx0fSlcblx0XHR9LFxuXHRcdHNhdmVQaG90bzogKHBob3RvKSA9PiB7XG5cdFx0XHQkaHR0cC5wb3N0KCcvYXBpL3Bob3Rvcy91cGRhdGUnLCBwaG90bykudGhlbihyZXMgPT4ge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhyZXMuZGF0YSk7XG5cdFx0XHR9KVxuXHRcdH0sXG5cdFx0ZmV0Y2hBbGw6ICgpID0+IHtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcGhvdG9zJylcblx0XHRcdC50aGVuKHJlcyA9PiB7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pXG5cdFx0fSxcblx0XHRmZXRjaFRlbjogKCkgPT4ge1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9waG90b3MvbGltaXQxMCcpXG5cdFx0XHQudGhlbihyZXMgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KVxuXHRcdH0sXG5cdFx0Z2V0RmlsZXM6ICgpID0+IHtcblx0XHRcdCRodHRwLmdldCgnL2FwaS9nZXRGaWxlcy9hbGJ1bUEnKVxuXHRcdFx0LnRoZW4ocmVzID0+IHtcblx0XHRcdFx0Y29uc29sZS5sb2coXCJSZXR1cm5lZDogXCIsIHJlcy5kYXRhKTtcblx0XHRcdH0pXG5cdFx0fSxcblx0XHR1cGRhdGVBbGw6ICgpID0+IHtcblx0XHRcdCRodHRwLnB1dCgnL2FwaS9waG90b3MvdXBkYXRlQWxsJykudGhlbihyZXMgPT4ge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhcInJlczogXCIsIHJlcy5kYXRhKTtcblx0XHRcdH0pXG5cdFx0fSxcblx0XHRnZXRSYW5kb206IChhbW91bnQpID0+IHtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcGhvdG9zL3JhbmRvbS8nICsgYW1vdW50KS50aGVuKHJlcyA9PiB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKFwicmVzOiBcIiwgcmVzLmRhdGEpO1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KVxuXHRcdH1cblx0fVxufSk7IiwiYXBwLmNvbnRyb2xsZXIoJ1VwbG9hZFBob3RvQ3RybCcsICgkc2NvcGUsICRzdGF0ZSwgUGhvdG9zRmFjdG9yeSwgQWxidW1GYWN0b3J5LCBGaWxlVXBsb2FkZXIpID0+IHtcblx0QWxidW1GYWN0b3J5LmZldGNoQWxsKCkudGhlbihhbGJ1bXMgPT4ge1xuICAgICAgICAkc2NvcGUuYWxidW1zID0gYWxidW1zO1xuICAgIH0pXG5cbiAgICAkc2NvcGUuY3JlYXRlQWxidW0gPSAoKSA9PiB7XG4gICAgICAgIGxldCBhbGJ1bSA9IHtcbiAgICAgICAgICAgIHRpdGxlOiAkc2NvcGUubmV3QWxidW1cbiAgICAgICAgfVxuICAgICAgICBBbGJ1bUZhY3RvcnkuY3JlYXRlQWxidW0oYWxidW0pLnRoZW4oYWxidW0gPT4ge1xuICAgICAgICAgICAgJHNjb3BlLmFsYnVtcy5wdXNoKGFsYnVtKTtcbiAgICAgICAgICAgICRzY29wZS5waG90b0FsYnVtID0gYWxidW0uX2lkO1xuICAgICAgICB9KVxuICAgIH1cblxuXG4gICAgdmFyIHVwbG9hZGVyID0gJHNjb3BlLnVwbG9hZGVyID0gbmV3IEZpbGVVcGxvYWRlcih7XG4gICAgICAgICAgICAgdXJsOiAnL2FwaS9waG90b3MvdXBsb2FkQVdTJ1xuICAgICAgICB9KTtcbiAgICAgICAgdXBsb2FkZXIuZmlsdGVycy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6ICdpbWFnZUZpbHRlcicsXG4gICAgICAgICAgICBmbjogZnVuY3Rpb24oaXRlbSAvKntGaWxlfEZpbGVMaWtlT2JqZWN0fSovICwgb3B0aW9ucykge1xuICAgICAgICAgICAgICAgIHZhciB0eXBlID0gJ3wnICsgaXRlbS50eXBlLnNsaWNlKGl0ZW0udHlwZS5sYXN0SW5kZXhPZignLycpICsgMSkgKyAnfCc7XG4gICAgICAgICAgICAgICAgcmV0dXJuICd8anBnfHBuZ3xqcGVnfGJtcHxnaWZ8Jy5pbmRleE9mKHR5cGUpICE9PSAtMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGxldCBjb3VudCA9IDE7XG4gICAgICAgIHVwbG9hZGVyLm9uV2hlbkFkZGluZ0ZpbGVGYWlsZWQgPSBmdW5jdGlvbihpdGVtIC8qe0ZpbGV8RmlsZUxpa2VPYmplY3R9Ki8gLCBmaWx0ZXIsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnb25XaGVuQWRkaW5nRmlsZUZhaWxlZCcsIGl0ZW0sIGZpbHRlciwgb3B0aW9ucyk7XG4gICAgICAgIH07XG4gICAgICAgIHVwbG9hZGVyLm9uQWZ0ZXJBZGRpbmdGaWxlID0gZnVuY3Rpb24oZmlsZUl0ZW0pIHtcbiAgICAgICAgICAgIC8vIGNvbnNvbGUuaW5mbygnb25BZnRlckFkZGluZ0ZpbGUnLCBmaWxlSXRlbSk7XG4gICAgICAgICAgICBsZXQgcGhvdG9JbmZvID0ge1xuICAgICAgICAgICAgICAgIHRpdGxlOiAkc2NvcGUudGl0bGUgKyAnLScgKyBjb3VudCxcbiAgICAgICAgICAgICAgICBhbGJ1bTogJHNjb3BlLnBob3RvQWxidW1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpbGVJdGVtLmZvcm1EYXRhLnB1c2gocGhvdG9JbmZvKTtcbiAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnZmlsZScsIGZpbGVJdGVtKTtcbiAgICAgICAgfTtcbiAgICAgICAgdXBsb2FkZXIub25BZnRlckFkZGluZ0FsbCA9IGZ1bmN0aW9uKGFkZGVkRmlsZUl0ZW1zKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ29uQWZ0ZXJBZGRpbmdBbGwnLCBhZGRlZEZpbGVJdGVtcyk7XG4gICAgICAgIH07XG4gICAgICAgIHVwbG9hZGVyLm9uQmVmb3JlVXBsb2FkSXRlbSA9IGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnb25CZWZvcmVVcGxvYWRJdGVtJywgaXRlbSk7XG4gICAgICAgIH07XG4gICAgICAgIHVwbG9hZGVyLm9uUHJvZ3Jlc3NJdGVtID0gZnVuY3Rpb24oZmlsZUl0ZW0sIHByb2dyZXNzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ29uUHJvZ3Jlc3NJdGVtJywgZmlsZUl0ZW0sIHByb2dyZXNzKTtcbiAgICAgICAgfTtcbiAgICAgICAgdXBsb2FkZXIub25Qcm9ncmVzc0FsbCA9IGZ1bmN0aW9uKHByb2dyZXNzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ29uUHJvZ3Jlc3NBbGwnLCBwcm9ncmVzcyk7XG4gICAgICAgIH07XG4gICAgICAgIHVwbG9hZGVyLm9uU3VjY2Vzc0l0ZW0gPSBmdW5jdGlvbihmaWxlSXRlbSwgcmVzcG9uc2UsIHN0YXR1cywgaGVhZGVycykge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdvblN1Y2Nlc3NJdGVtJywgZmlsZUl0ZW0sIHJlc3BvbnNlLCBzdGF0dXMsIGhlYWRlcnMpO1xuICAgICAgICB9O1xuICAgICAgICB1cGxvYWRlci5vbkVycm9ySXRlbSA9IGZ1bmN0aW9uKGZpbGVJdGVtLCByZXNwb25zZSwgc3RhdHVzLCBoZWFkZXJzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ29uRXJyb3JJdGVtJywgZmlsZUl0ZW0sIHJlc3BvbnNlLCBzdGF0dXMsIGhlYWRlcnMpO1xuICAgICAgICB9O1xuICAgICAgICB1cGxvYWRlci5vbkNhbmNlbEl0ZW0gPSBmdW5jdGlvbihmaWxlSXRlbSwgcmVzcG9uc2UsIHN0YXR1cywgaGVhZGVycykge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdvbkNhbmNlbEl0ZW0nLCBmaWxlSXRlbSwgcmVzcG9uc2UsIHN0YXR1cywgaGVhZGVycyk7XG4gICAgICAgIH07XG4gICAgICAgIHVwbG9hZGVyLm9uQ29tcGxldGVJdGVtID0gZnVuY3Rpb24oZmlsZUl0ZW0sIHJlc3BvbnNlLCBzdGF0dXMsIGhlYWRlcnMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnb25Db21wbGV0ZUl0ZW0nLCBmaWxlSXRlbSwgcmVzcG9uc2UsIHN0YXR1cywgaGVhZGVycyk7XG4gICAgICAgIH07XG4gICAgICAgIHVwbG9hZGVyLm9uQ29tcGxldGVBbGwgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnb25Db21wbGV0ZUFsbCcpO1xuICAgICAgICAgICAgLy8gJHNjb3BlLmZpbmlzaCgpO1xuICAgICAgICB9O1xufSk7IiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgncGhvdG9zJywge1xuICAgICAgICB1cmw6ICcvcGhvdG9zJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9waG90b3MvcGhvdG9zLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnUGhvdG9DdHJsJyxcbiAgICAgICAgcmVzb2x2ZToge1xuICAgICAgICAgICAgcGhvdG9zOiAoUGhvdG9zRmFjdG9yeSwgJHN0YXRlUGFyYW1zKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFBob3Rvc0ZhY3RvcnkuZmV0Y2hBbGwoKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59KTtcblxuYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnYWRkcGhvdG8nLCB7XG4gICAgICAgIHVybDogJy9waG90b3MnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL3Bob3Rvcy9waG90b3MtYWRkLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnUGhvdG9DdHJsJ1xuICAgIH0pO1xufSk7XG5cblxuYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgndXBsb2FkUGhvdG9zJywge1xuICAgICAgICB1cmw6ICcvdXBsb2FkUGhvdG9zJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9waG90b3MvcGhvdG9zLXVwbG9hZC5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ1VwbG9hZFBob3RvQ3RybCdcbiAgICB9KTtcbn0pO1xuXG4iLCJhcHAuY29udHJvbGxlcignU2lnbnVwQ3RybCcsICgkc2NvcGUsICRyb290U2NvcGUsIFVzZXJGYWN0b3J5KSA9PiB7XG5cdCRzY29wZS51c2VyID0ge307XG5cdCRzY29wZS5zdWJtaXQgPSAoKSA9PiB7XG5cdFx0VXNlckZhY3RvcnkuY3JlYXRlVXNlcigkc2NvcGUudXNlcilcblx0XHQudGhlbih1c2VyID0+IHtcblx0XHRcdCRyb290U2NvcGUudXNlciA9IHVzZXI7XG5cdFx0fSlcblx0fVxufSk7IiwiYXBwLmNvbmZpZygoJHN0YXRlUHJvdmlkZXIpID0+IHtcblx0JHN0YXRlUHJvdmlkZXIuc3RhdGUoJ3NpZ251cCcsIHtcblx0XHR1cmw6ICcvc2lnbnVwJyxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL3NpZ251cC9zaWdudXAuaHRtbCcsXG5cdFx0Y29udHJvbGxlcjogJ1NpZ251cEN0cmwnXG5cdH0pXG59KTsiLCJhcHAuY29udHJvbGxlcignVXBsb2FkQ3RybCcsICgkc2NvcGUsICRzdGF0ZSwgYWxidW1zLCBQaG90b3NGYWN0b3J5LCBBbGJ1bUZhY3RvcnksIEZpbGVVcGxvYWRlcikgPT4ge1xuXHQvLyBBbGJ1bUZhY3RvcnkuZmV0Y2hBbGwoKS50aGVuKGFsYnVtcyA9PiB7XG4gLy8gICAgICAgICRzY29wZS5hbGJ1bXMgPSBhbGJ1bXM7XG4gLy8gICAgfSlcbiAgbGV0IGFsYnVtQ3JlYXRlZCA9IGZhbHNlO1xuICBsZXQgYWRkVG9BbGJ1bTtcbiAgICBjb25zb2xlLmxvZyhcImFsYnVtczogXCIsIGFsYnVtcyk7XG4gICAgJHNjb3BlLm5ld0FsYnVtID0gZmFsc2U7XG4gICAgJHNjb3BlLnBob3RvQWxidW0gPSBudWxsO1xuICAgICRzY29wZS5hbGJ1bXMgPSBhbGJ1bXM7XG4gICAgJHNjb3BlLmNyZWF0ZUFsYnVtID0gKCkgPT4ge1xuICAgICAgICBsZXQgYWxidW0gPSB7XG4gICAgICAgICAgICB0aXRsZTogJHNjb3BlLm5ld0FsYnVtVGl0bGVcbiAgICAgICAgfVxuICAgICAgICBBbGJ1bUZhY3RvcnkuY3JlYXRlQWxidW0oYWxidW0pLnRoZW4oYWxidW0gPT4ge1xuICAgICAgICAgICAgJHNjb3BlLmFsYnVtcy5wdXNoKGFsYnVtKTtcbiAgICAgICAgICAgICRzY29wZS5waG90b0FsYnVtID0gYWxidW07XG4gICAgICAgICAgICBhbGJ1bUNyZWF0ZWQgPSBhbGJ1bTtcbiAgICAgICAgfSlcbiAgICB9XG4gICAgICAkc2NvcGUuY2hlY2tBbGJ1bSA9ICgpID0+IHtcbiAgICAgICAgaWYoYWxidW1DcmVhdGVkKSB7XG4gICAgICAgICAgYWRkVG9BbGJ1bSA9IGFsYnVtQ3JlYXRlZDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICBhZGRUb0FsYnVtID0gJHNjb3BlLnBob3RvQWxidW1cbiAgICAgICAgfVxuICAgICAgICAgIGNvbnNvbGUubG9nKFwicGhvdG8gYWxidW06IFwiLCBhZGRUb0FsYnVtKTtcbiAgICB9XG4gICAgLy8gdmFyIGdhbGxlcnlVcGxvYWRlciA9IG5ldyBxcS5GaW5lVXBsb2FkZXIoe1xuICAgIC8vICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmaW5lLXVwbG9hZGVyLWdhbGxlcnlcIiksXG4gICAgLy8gICAgICAgICB0ZW1wbGF0ZTogJ3FxLXRlbXBsYXRlLWdhbGxlcnknLFxuICAgIC8vICAgICAgICAgcmVxdWVzdDoge1xuICAgIC8vICAgICAgICAgICAgIGVuZHBvaW50OiAnL2FwaS91cGxvYWQvcGhvdG8nXG4gICAgLy8gICAgICAgICB9LFxuICAgIC8vICAgICAgICAgdGh1bWJuYWlsczoge1xuICAgIC8vICAgICAgICAgICAgIHBsYWNlaG9sZGVyczoge1xuICAgIC8vICAgICAgICAgICAgICAgICB3YWl0aW5nUGF0aDogJy9hc3NldHMvcGxhY2Vob2xkZXJzL3dhaXRpbmctZ2VuZXJpYy5wbmcnLFxuICAgIC8vICAgICAgICAgICAgICAgICBub3RBdmFpbGFibGVQYXRoOiAnL2Fzc2V0cy9wbGFjZWhvbGRlcnMvbm90X2F2YWlsYWJsZS1nZW5lcmljLnBuZydcbiAgICAvLyAgICAgICAgICAgICB9XG4gICAgLy8gICAgICAgICB9LFxuICAgIC8vICAgICAgICAgdmFsaWRhdGlvbjoge1xuICAgIC8vICAgICAgICAgICAgIGFsbG93ZWRFeHRlbnNpb25zOiBbJ2pwZWcnLCAnanBnJywgJ2dpZicsICdwbmcnXVxuICAgIC8vICAgICAgICAgfVxuICAgIC8vICAgICB9KTtcblxuXG59KTsiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCd1cGxvYWQnLCB7XG4gICAgICAgIHVybDogJy91cGxvYWQnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL3VwbG9hZC91cGxvYWQuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdVcGxvYWRDdHJsJyxcbiAgICAgICAgcmVzb2x2ZToge1xuICAgICAgICBcdGFsYnVtczogKEFsYnVtRmFjdG9yeSkgPT4ge1xuICAgICAgICBcdFx0cmV0dXJuIEFsYnVtRmFjdG9yeS5mZXRjaEFsbCgpLnRoZW4oYWxidW1zID0+IHtcbiAgICAgICAgXHRcdFx0cmV0dXJuIGFsYnVtcztcbiAgICAgICAgXHRcdH0pXG4gICAgICAgIFx0fVxuICAgICAgICB9XG4gICAgfSk7XG59KTsiLCJhcHAuZmFjdG9yeSgnRGlhbG9nRmFjdG9yeScsIGZ1bmN0aW9uKCRodHRwLCAkbWREaWFsb2csICR0aW1lb3V0KSB7IFxuXHRcblxuXHRsZXQgc2hvd0RpYWxvZyA9IChtZXNzYWdlKSA9PiB7XG5cdFx0dmFyIHBhcmVudEVsID0gYW5ndWxhci5lbGVtZW50KGRvY3VtZW50LmJvZHkpO1xuICAgICAgICRtZERpYWxvZy5zaG93KHtcbiAgICAgICAgIHBhcmVudDogcGFyZW50RWwsXG4gICAgICAgICB0ZW1wbGF0ZTpcbiAgICAgICAgICAgJzxtZC1kaWFsb2cgYXJpYS1sYWJlbD1cIkxpc3QgZGlhbG9nXCIgaWQ9XCJkaWFsb2dcIj4nICtcbiAgICAgICAgICAgJyAgPG1kLWRpYWxvZy1jb250ZW50PicrXG4gICAgICAgICAgIFx0bWVzc2FnZSArXG4gICAgICAgICAgICcgIDwvbWQtZGlhbG9nLWNvbnRlbnQ+JyArXG4gICAgICAgICAgICc8L21kLWRpYWxvZz4nXG4gICAgICB9KTtcblx0fVxuXG5cblx0cmV0dXJuIHtcblx0XHRkaXNwbGF5OiAobWVzc2FnZSwgdGltZW91dCkgPT4ge1xuXHRcdFx0c2hvd0RpYWxvZyhtZXNzYWdlKTtcblx0XHRcdCR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQkbWREaWFsb2cuaGlkZSgpO1xuXHRcdFx0fSwgdGltZW91dClcblx0XHR9XG5cdH1cblxuXG5cbn0pOyIsImFwcC5mYWN0b3J5KCdVc2VyRmFjdG9yeScsICgkaHR0cCwgJHJvb3RTY29wZSwgRGlhbG9nRmFjdG9yeSkgPT4ge1xuXHRyZXR1cm4ge1xuXHRcdGN1cnJlbnRVc2VyOiAoKSA9PiB7XG5cdFx0XHRsZXQgdXNlciA9IHtcblx0XHRcdFx0bmFtZTogJ0RhbmUnLFxuXHRcdFx0XHRwaWN0dXJlOiAnU29tZXRoaW5nJyxcblx0XHRcdFx0YWxidW1zOiBbJ09uZScsICdUd28nLCAnVGhyZWUnXVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVzZXJcblx0XHRcdC8vc2VuZCByZXF1ZXN0IGZvciBjdXJyZW50IGxvZ2dlZC1pbiB1c2VyXG5cdFx0fSxcblx0XHRjcmVhdGVVc2VyOiAodXNlcikgPT4ge1xuXHRcdFx0cmV0dXJuICRodHRwLnBvc3QoJy9hcGkvdXNlcnMvJywgdXNlcikudGhlbihyZXMgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KVxuXHRcdH0sXG5cdFx0Z2V0VXNlcjogKCkgPT4ge1xuXHRcdFx0bGV0IHVzZXJuYW1lID0gJ2RhbmV0b21zZXRoJztcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvdXNlcnMvJysgdXNlcm5hbWUpLnRoZW4ocmVzID0+IHtcblx0XHRcdFx0JHJvb3RTY29wZS51c2VyID0gcmVzLmRhdGFcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSk7XG5cdFx0fSxcblxuXHRcdC8vVXNlciBzZXR0aW5nc1xuXHRcdC8vIGZvbGxvd0FsYnVtOiAoYWxidW1JZCkgPT4ge1xuXHRcdC8vIFx0bGV0IGJvZHkgPSB7XG5cdFx0Ly8gXHRcdGFsYnVtSWQ6IGFsYnVtSWQsXG5cdFx0Ly8gXHRcdHVzZXJJZDogJHJvb3RTY29wZS51c2VyLl9pZFxuXHRcdC8vIFx0fVxuXHRcdC8vIFx0JGh0dHAucG9zdCgnL2FwaS91c2Vycy9hbGJ1bScsIGJvZHkpLnRoZW4ocmVzID0+IHtcblx0XHQvLyBcdFx0aWYocmVzLnN0YXR1cyA9PT0gMjAwKSB7XG5cdFx0Ly8gXHRcdFx0RGlhbG9nRmFjdG9yeS5kaXNwbGF5KCdBZGRlZCBUbyBBbGJ1bXMnLCAxMDAwKVxuXHRcdC8vIFx0XHR9XG5cdFx0Ly8gXHRcdGVsc2Uge1xuXHRcdC8vIFx0XHRcdERpYWxvZ0ZhY3RvcnkuZGlzcGxheSgnU3RhdHVzIG5vdCAyMDAnLCAxMDAwKVxuXHRcdC8vIFx0XHR9XG5cdFx0Ly8gXHR9KVxuXHRcdC8vIH1cblx0XHRmb2xsb3dBbGJ1bTogKGFsYnVtKSA9PiB7XG5cdFx0XHRsZXQgdXNlciA9ICRyb290U2NvcGUudXNlclxuXHRcdFx0aWYodXNlci5hbGJ1bXMuaW5kZXhPZigpICE9PSAtMSkge1xuXHRcdFx0XHRjb25zb2xlLmxvZygnYWxidW0gYWxyZWFkeSBleGlzdHMnKTtcblx0XHRcdH1cblx0XHRcdHVzZXIuYWxidW1zLnB1c2goYWxidW0pO1xuXG5cdFx0XHQkaHR0cC5wb3N0KCcvYXBpL3VzZXJzL3VwZGF0ZScsIHVzZXIpLnRoZW4ocmVzID0+IHtcblx0XHRcdFx0aWYocmVzLnN0YXR1cyA9PT0gMjAwKSB7XG5cdFx0XHRcdFx0RGlhbG9nRmFjdG9yeS5kaXNwbGF5KCdBZGRlZCBUbyBBbGJ1bXMnLCAxMDAwKVxuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdERpYWxvZ0ZhY3RvcnkuZGlzcGxheSgnU3RhdHVzIG5vdCAyMDAnLCAxMDAwKVxuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdH0sXG5cdFx0Zm9sbG93UGhvdG86IChwaG90bykgPT4ge1xuXHRcdFx0bGV0IHVzZXIgPSAkcm9vdFNjb3BlLnVzZXJcblx0XHRcdGlmKHVzZXIucGhvdG9zLmluZGV4T2YoKSAhPT0gLTEpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coJ1Bob3RvIGFscmVhZHkgZXhpc3RzJyk7XG5cdFx0XHR9XG5cdFx0XHR1c2VyLnBob3Rvcy5wdXNoKHBob3RvKTtcblxuXHRcdFx0JGh0dHAucG9zdCgnL2FwaS91c2Vycy91cGRhdGUnLCB1c2VyKS50aGVuKHJlcyA9PiB7XG5cdFx0XHRcdGlmKHJlcy5zdGF0dXMgPT09IDIwMCkge1xuXHRcdFx0XHRcdERpYWxvZ0ZhY3RvcnkuZGlzcGxheSgnQWRkZWQgVG8gUGhvdG9zJywgMTAwMClcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHREaWFsb2dGYWN0b3J5LmRpc3BsYXkoJ1N0YXR1cyBub3QgMjAwJywgMTAwMClcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHR9XG5cdH1cbn0pOyIsImFwcC5kaXJlY3RpdmUoJ3p0U2V0U2l6ZScsIGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4ge1xuXHRcdHJlc3RyaWN0OiAnQScsXG5cdFx0bGluazogKHNjb3BlLCBlbGVtZW50LCBhdHRyKSA9PiB7XG5cdFx0XHRjb25zb2xlLmxvZyhcImF0dHJpYnV0ZXM6IFwiLCBlbGVtZW50WzBdLmNsaWVudFdpZHRoKTtcblx0XHRcdGxldCB3aWR0aCA9IChlbGVtZW50WzBdLmNsaWVudFdpZHRoICogMC42NikgKyAncHgnO1xuXHRcdFx0ZWxlbWVudC5jc3Moe1xuXHRcdFx0XHRoZWlnaHQ6IHdpZHRoXG5cdFx0XHR9KVxuXHRcdH1cblx0fVxufSk7IiwiYXBwLmRpcmVjdGl2ZSgnYWxidW1DYXJkJywgKCRyb290U2NvcGUsICRzdGF0ZSkgPT4ge1xuXHRyZXR1cm4ge1xuXHRcdHJlc3RyaWN0OiAnRScsXG5cdFx0Y29udHJvbGxlcjogJ0FsYnVtc0N0cmwnLFxuXHRcdHNjb3BlOiB7XG5cdFx0XHRhbGJ1bTogJz0nXG5cdFx0fSxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2FsYnVtcy9hbGJ1bS1jYXJkLmh0bWwnLFxuXHRcdGxpbms6IChzY29wZSkgPT4ge1xuXHRcdFx0c2NvcGUuZWRpdEFsYnVtID0gKCkgPT4ge1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2VkaXRBbGJ1bScsIHthbGJ1bUlkOiBzY29wZS5hbGJ1bS5faWR9KTtcblx0XHRcdH1cblxuXHRcdFx0c2NvcGUudmlld0FsYnVtID0gKCkgPT4ge1xuXHRcdFx0XHQkc3RhdGUuZ28oJ3NpbmdsZUFsYnVtJywge2FsYnVtSWQ6IHNjb3BlLmFsYnVtLl9pZH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRzY29wZS5hZGRUb0Zhdm9yaXRlcyA9ICgpID0+IHtcblx0XHRcdFx0Y29uc29sZS5sb2coXCJjYWxsIHVzZXIgaGVyZVwiKTtcblx0XHRcdH1cblx0fVxufVxufSk7IiwiYXBwLmRpcmVjdGl2ZSgnc2VsZWN0QWxidW0nLCAoJHJvb3RTY29wZSkgPT4ge1xuXHRyZXR1cm4ge1xuXHRcdHJlc3RyaWN0OiAnRScsXG5cdFx0Y29udHJvbGxlcjogJ0FsYnVtc0N0cmwnLFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvYWxidW1zL2FsYnVtLmh0bWwnLFxuXHRcdGxpbms6IChzY29wZSkgPT4ge1xuXG5cdH1cbn1cbn0pOyIsImFwcC5kaXJlY3RpdmUoJ3VzZXJBbGJ1bXMnLCAoJHJvb3RTY29wZSwgJHN0YXRlKSA9PiB7XG5cdHJldHVybiB7XG5cdFx0cmVzdHJpY3Q6ICdFJyxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2FsYnVtcy91c2VyLWFsYnVtcy5odG1sJyxcblx0XHRsaW5rOiAoc2NvcGUpID0+IHtcblx0XHRcdHNjb3BlLmVkaXRBbGJ1bSA9ICgpID0+IHtcblx0XHRcdFx0JHN0YXRlLmdvKCdlZGl0QWxidW0nLCB7YWxidW1JZDogc2NvcGUuYWxidW0uX2lkfSk7XG5cdFx0XHR9XG5cblx0XHRcdHNjb3BlLmFkZFRvRmF2b3JpdGVzID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhcImNhbGwgdXNlciBoZXJlXCIpO1xuXHRcdFx0fVxuXHR9XG59XG59KTsiLCJhcHAuZGlyZWN0aXZlKCdiYW5uZXInLCAoJHJvb3RTY29wZSwgJHN0YXRlLCBTZXNzaW9uLCBVc2VyRmFjdG9yeSwgQWxidW1GYWN0b3J5LCBBdXRoU2VydmljZSkgPT4ge1xuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvYmFubmVyL2Jhbm5lci5odG1sJyxcbiAgICAgICAgbGluazogKHNjb3BlKSA9PiB7XG4gICAgICAgICAgICAvLyBVc2VyRmFjdG9yeS5nZXRVc2VyKCkudGhlbih1c2VyID0+IHtcbiAgICAgICAgICAgIC8vICAgICBzY29wZS51c2VyID0gdXNlcjtcbiAgICAgICAgICAgIC8vICAgICByZXR1cm4gQWxidW1GYWN0b3J5LmZpbmRVc2VyQWxidW1zKHVzZXIuX2lkKVxuICAgICAgICAgICAgLy8gfSkudGhlbihhbGJ1bXMgPT4ge1xuICAgICAgICAgICAgLy8gICAgIHNjb3BlLnVzZXIuYWxidW1zLnB1c2goYWxidW1zKTtcbiAgICAgICAgICAgIC8vICAgICBjb25zb2xlLmxvZyhzY29wZS51c2VyLmFsYnVtcyk7XG4gICAgICAgICAgICAvLyB9KVxuXG4gICAgICAgICAgICBVc2VyRmFjdG9yeS5nZXRVc2VyKCkudGhlbih1c2VyID0+IHtcbiAgICAgICAgICAgICAgICBzY29wZS51c2VyID0gdXNlcjtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhzY29wZS51c2VyKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBBbGJ1bUZhY3RvcnkuZmluZFVzZXJBbGJ1bXModXNlci5faWQpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oYWxidW1zID0+IHtcbiAgICAgICAgICAgICAgICBzY29wZS51c2VyQWxidW1zID0gYWxidW1zO1xuICAgICAgICAgICAgICAgIGlmKHNjb3BlLnVzZXIuYWxidW1zLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzY29wZS51c2VyQWxidW1zLnB1c2goc2NvcGUudXNlci5hbGJ1bXMpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHNjb3BlLnVzZXJBbGJ1bXMpO1xuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgLy8gQWxidW1GYWN0b3J5LmZpbmRVc2VyQWxidW1zKFNlc3Npb24udXNlci5faWQpXG4gICAgICAgICAgICAvLyAudGhlbihhbGJ1bXMgPT4ge1xuICAgICAgICAgICAgLy8gICAgIHNjb3BlLnVzZXJBbGJ1bXMgPSBhbGJ1bXM7XG4gICAgICAgICAgICAvLyAgICAgY29uc29sZS5sb2coc2NvcGUudXNlckFsYnVtcyk7XG4gICAgICAgICAgICAvLyB9KVxuXG4gICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKHVzZXIgPT4ge1xuICAgICAgICAgICAgICAgIGlmKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IHVzZXI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzY29wZS51c2VyID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgZmlyc3Q6ICdHdWVzdCcsXG4gICAgICAgICAgICAgICAgICAgICAgICBsYXN0OiAnJ1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIHNjb3BlLnNob3dBbGJ1bXMgPSBmYWxzZTtcbiAgICAgICAgICAgIHNjb3BlLnNob3dQaWN0dXJlcyA9IGZhbHNlO1xuXG4gICAgICAgICAgICBzY29wZS5hZGRBbGJ1bXMgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgc2NvcGUuc2hvd0FsYnVtcyA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNjb3BlLmFkZFBpY3R1cmVzID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIHNjb3BlLnNob3dQaWN0dXJlcyA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNjb3BlLnZpZXdBbGJ1bSA9IChhbGJ1bSkgPT4ge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbygnc2luZ2xlQWxidW0nLCB7XG4gICAgICAgICAgICAgICAgICAgIGFsYnVtSWQ6IGFsYnVtLl9pZFxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfVxuICAgIH1cbn0pOyIsImFwcC5kaXJlY3RpdmUoJ25hdmJhcicsIGZ1bmN0aW9uKCRyb290U2NvcGUsIEF1dGhTZXJ2aWNlLCBBVVRIX0VWRU5UUywgJHN0YXRlKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICBzY29wZToge30sXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5odG1sJyxcbiAgICAgICAgbGluazogZnVuY3Rpb24oc2NvcGUpIHtcblxuICAgICAgICAgICAgJHJvb3RTY29wZS4kb24oJyRzdGF0ZUNoYW5nZVN1Y2Nlc3MnLFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uKGV2ZW50LCB0b1N0YXRlLCB0b1BhcmFtcywgZnJvbVN0YXRlLCBmcm9tUGFyYW1zKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLmN1cnJlbnRQYWdlID0gdG9TdGF0ZS5uYW1lO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIClcblxuICAgICAgICAgICAgc2NvcGUuaXRlbXMgPSBbe1xuICAgICAgICAgICAgICAgICAgICBsYWJlbDogJ0hvbWUnLFxuICAgICAgICAgICAgICAgICAgICBzdGF0ZTogJ2hvbWUnXG4gICAgICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgICAgICBsYWJlbDogJ1Bob3RvcycsXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlOiAncGhvdG9zJ1xuICAgICAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6ICdBbGJ1bXMnLFxuICAgICAgICAgICAgICAgICAgICBzdGF0ZTogJ2FsYnVtcydcbiAgICAgICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgICAgIGxhYmVsOiAnVXBsb2FkJyxcbiAgICAgICAgICAgICAgICAgICAgc3RhdGU6ICd1cGxvYWQnXG4gICAgICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgICAgICBsYWJlbDogJ05ldyBBbGJ1bScsXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlOiAnbmV3QWxidW0nXG4gICAgICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6ICdBZG1pbicsXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlOiAnYWRtaW4nXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG5cbiAgICAgICAgICAgIHNjb3BlLmlzTG9nZ2VkSW4gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzY29wZS5sb2dvdXQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5sb2dvdXQoKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAkc3RhdGUuZ28oJ2hvbWUnKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH07XG5cblxuXG4gICAgICAgICAgICB2YXIgc2V0VXNlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpLnRoZW4oZnVuY3Rpb24odXNlcikge1xuICAgICAgICAgICAgICAgICAgICBzY29wZS51c2VyID0gdXNlcjtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciByZW1vdmVVc2VyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzZXRVc2VyKCk7XG5cbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcywgc2V0VXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzLCByZW1vdmVVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCByZW1vdmVVc2VyKTtcblxuICAgICAgICB9XG5cbiAgICB9O1xuXG59KTsiLCJhcHAuZGlyZWN0aXZlKCduZXdBbGJ1bVNlbGVjdCcsICgkcm9vdFNjb3BlKSA9PiB7XG5cdHJldHVybiB7XG5cdFx0cmVzdHJpY3Q6ICdFJyxcblx0XHRjb250cm9sbGVyOiAnTmV3QWxidW1DdHJsJyxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL3Bob3RvL25ldy1hbGJ1bS1zZWxlY3QuaHRtbCcsXG5cdFx0bGluazogKHNjb3BlKSA9PiB7XG5cdH1cbn1cbn0pOyIsImFwcC5kaXJlY3RpdmUoJ3Bob3RvRWRpdCcsIChQaG90b3NGYWN0b3J5KSA9PiB7XG5cdHJldHVybiB7XG5cdFx0cmVzdHJpY3Q6ICdFJyxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL3Bob3RvL3Bob3RvLWVkaXQuaHRtbCcsXG5cdFx0bGluazogKHNjb3BlLCBlbGVtLCBhdHRyKSA9PiB7XG5cdFx0XHRzY29wZS5zYXZlUGhvdG8gPSAoKSA9PiB7XG5cdFx0XHRcdFBob3Rvc0ZhY3Rvcnkuc2F2ZVBob3RvKHNjb3BlLnBob3RvKVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7IiwiYXBwLmRpcmVjdGl2ZSgncGhvdG9HcmlkJywgKCRyb290U2NvcGUpID0+IHtcblx0cmV0dXJuIHtcblx0XHRyZXN0cmljdDogJ0UnLFxuXHRcdHNjb3BlOiB7XG5cdFx0XHRncmlkUGhvdG9zOiAnPXBob3Rvcydcblx0XHR9LFxuXHRcdGNvbnRyb2xsZXI6ICdQaG90b0N0cmwnLFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvcGhvdG8vcGhvdG8tZ3JpZC5odG1sJyxcblx0XHRsaW5rOiAoc2NvcGUpID0+IHtcblx0XHRcdGNvbnNvbGUubG9nKHNjb3BlLmdyaWRQaG90b3MpO1xuXHR9XG59XG59KTsiLCJhcHAuZGlyZWN0aXZlKCdzZWxlY3RQaWN0dXJlcycsICgkcm9vdFNjb3BlKSA9PiB7XG5cdHJldHVybiB7XG5cdFx0cmVzdHJpY3Q6ICdFJyxcblx0XHRjb250cm9sbGVyOiAnUGhvdG9DdHJsJyxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL3Bob3RvL3NlbGVjdC1waG90by5odG1sJyxcblx0XHRsaW5rOiAoc2NvcGUpID0+IHtcblx0fVxufVxufSk7IiwiYXBwLmRpcmVjdGl2ZSgnc2luZ2xlUGhvdG8nLCAoJHJvb3RTY29wZSwgJHN0YXRlKSA9PiB7XG5cdHJldHVybiB7XG5cdFx0cmVzdHJpY3Q6ICdFJyxcblx0XHRzY29wZToge1xuXHRcdFx0cGhvdG86ICc9J1xuXHRcdH0sXG5cdFx0dGVtcGxhdGVVcmw6ICdqcy9jb21tb24vZGlyZWN0aXZlcy9waG90by9zaW5nbGUtcGhvdG8uaHRtbCcsXG5cdFx0bGluazogKHNjb3BlKSA9PiB7XG5cdFx0XHRzY29wZS52aWV3UGhvdG8gPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKHNjb3BlLnBob3RvKTtcblx0XHRcdFx0Ly8gJHN0YXRlLmdvKCdlZGl0cGhvdG8nLCB7cGhvdG9JZDogc2NvcGUucGhvdG8uX2lkfSk7XG5cdFx0XHR9XG5cblx0XHRcdFxuXHR9XG59XG59KTsiLCJhcHAuZGlyZWN0aXZlKCd1cGxvYWRlcicsIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvdXBsb2FkL3VwbG9hZC5odG1sJyxcbiAgICAgICAgbGluazogKHNjb3BlLCBlbGVtLCBhdHRyKSA9PiB7XG4gICAgICAgICAgICB2YXIgZ2FsbGVyeVVwbG9hZGVyID0gbmV3IHFxLkZpbmVVcGxvYWRlcih7XG4gICAgICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmaW5lLXVwbG9hZGVyLWdhbGxlcnlcIiksXG4gICAgICAgICAgICAgICAgdGVtcGxhdGU6ICdxcS10ZW1wbGF0ZS1nYWxsZXJ5JyxcbiAgICAgICAgICAgICAgICByZXF1ZXN0OiB7XG4gICAgICAgICAgICAgICAgICAgIGVuZHBvaW50OiAnL2FwaS91cGxvYWQvcGhvdG8nXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB0aHVtYm5haWxzOiB7XG4gICAgICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FpdGluZ1BhdGg6ICcvYXNzZXRzL3BsYWNlaG9sZGVycy93YWl0aW5nLWdlbmVyaWMucG5nJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vdEF2YWlsYWJsZVBhdGg6ICcvYXNzZXRzL3BsYWNlaG9sZGVycy9ub3RfYXZhaWxhYmxlLWdlbmVyaWMucG5nJ1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiB7XG4gICAgICAgICAgICAgICAgICAgIGFsbG93ZWRFeHRlbnNpb25zOiBbJ2pwZWcnLCAnanBnJywgJ2dpZicsICdwbmcnXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxufSk7Il0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9
