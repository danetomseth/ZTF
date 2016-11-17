app.config(function ($stateProvider) {
    $stateProvider.state('upload', {
        url: '/upload',
        templateUrl: 'js/upload/upload.html',
        controller: 'UploadCtrl',
        resolve: {
        	albums: (AlbumFactory) => {
        		return AlbumFactory.fetchAll().then(albums => {
        			return albums;
        		})
        	}
        }
    });
});