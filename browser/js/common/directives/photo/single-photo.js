app.directive('singlePhoto', ($rootScope, $state) => {
	return {
		restrict: 'E',
		scope: {
			photo: '='
		},
		templateUrl: 'js/common/directives/photo/single-photo.html',
		link: (scope) => {
			scope.viewPhoto = () => {
				console.log(scope.photo);
				// $state.go('editphoto', {photoId: scope.photo._id});
			}

			
	}
}
});