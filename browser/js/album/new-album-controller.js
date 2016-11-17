app.controller('NewAlbumCtrl', ($scope, $state, AlbumFactory, PhotosFactory, Session, DialogFactory, AuthService) => {
	console.log('Session', Session);
	$scope.showPhotos = false;

	$scope.createAlbum = () => {
        if(Session.user) {
		  $scope.album.owner = Session.user._id;
        }
		console.log($scope.album);

        AlbumFactory.createAlbum($scope.album)
    }



    $scope.addToAlbum = (photo) => {
    	DialogFactory.display('Added', 750);
        $scope.album.photos.push(photo);
        $scope.album.cover = photo;
    }

    $scope.saveAlbum = () => {
    	AlbumFactory.updateAlbum($scope.album).then(album => {
    		$state.go('albums');
    	})
    }
});