app.config(($stateProvider) => {
	$stateProvider.state('editAlbum', {
		url: '/editAlbum/:albumId',
		templateUrl: 'js/album/edit-album.html',
		controller: 'EditAlbumCtrl',
		resolve: {
			album: (AlbumFactory, $stateParams) => {
				return AlbumFactory.fetchOne($stateParams.albumId)
			}
		}
	})
});


app.controller('EditAlbumCtrl', ($scope, AlbumFactory, PhotosFactory, DialogFactory, album) => {
	$scope.addingPictures = false;

	let setDate = () => {
		album.date = new Date(album.date);
		$scope.album = album;
	}
	setDate();

	$scope.saveAlbum =() => {
		AlbumFactory.updateAlbum($scope.album)
		.then(res => {
			$scope.album = res;
			$scope.selectingPictures = false;
			DialogFactory.display('Saved', 1000);
		})
	}

	$scope.addPhotos = () => {
		console.log('adding');
		PhotosFactory.fetchAll().then(photos => {
			console.log('photos', photos);
			$scope.selectingPictures = true;
			$scope.photos = photos;
		})
	}

	$scope.addToAlbum = (photo) => {
		console.log("added", photo);
        $scope.album.photos.push(photo._id);
        AlbumFactory.addPhoto(album._id, photo._id)
    }
})