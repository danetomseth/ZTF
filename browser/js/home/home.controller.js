app.controller('HomeCtrl', function($scope, homePhotos, PhotosFactory) {
    $scope.updateAll = () => {
        PhotosFactory.updateAll()
    }

    $scope.getRandom = () => {
    }

    $scope.slidePhotos = homePhotos;


    $(document).ready(function() {

       $("#owl-demo").owlCarousel({

            autoPlay: 3000, //Set AutoPlay to 3 seconds

            items: 3,

        });

    });


})