app.config(function ($stateProvider) {
    $stateProvider.state('home', {
        url: '/',
        templateUrl: '/js/home/home.html',
        controller: 'HomeCtrl', 
        resolve: {
        	homePhotos: (PhotosFactory) => {
        		return PhotosFactory.getRandom(10)
        	}
        }
        
    });
});