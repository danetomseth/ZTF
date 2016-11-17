app.controller('UploadCtrl', ($scope, $state, albums, PhotosFactory, AlbumFactory, FileUploader) => {
	// AlbumFactory.fetchAll().then(albums => {
 //        $scope.albums = albums;
 //    })
  let albumCreated = false;
  let addToAlbum;
    console.log("albums: ", albums);
    $scope.newAlbum = false;
    $scope.photoAlbum = null;
    $scope.albums = albums;
    $scope.createAlbum = () => {
        let album = {
            title: $scope.newAlbumTitle
        }
        AlbumFactory.createAlbum(album).then(album => {
            $scope.albums.push(album);
            $scope.photoAlbum = album;
            albumCreated = album;
        })
    }
      $scope.checkAlbum = () => {
        if(albumCreated) {
          addToAlbum = albumCreated;
        }
        else {
          addToAlbum = $scope.photoAlbum
        }
          console.log("photo album: ", addToAlbum);
    }
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