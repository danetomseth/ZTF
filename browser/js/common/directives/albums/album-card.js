app.directive('albumCard', ($rootScope, $state) => {
	return {
		restrict: 'E',
		controller: 'AlbumsCtrl',
		scope: {
			album: '='
		},
		templateUrl: 'js/common/directives/albums/album-card.html',
		link: (scope) => {
			scope.editAlbum = () => {
				$state.go('editAlbum', {albumId: scope.album._id});
			}

			scope.viewAlbum = () => {
				$state.go('singleAlbum', {albumId: scope.album._id});
			}

			scope.addToFavorites = () => {
				console.log("call user here");
			}
	}
}
});