app.directive('uploader', function() {
    return {
        restrict: 'E',
        templateUrl: 'js/common/directives/upload/upload.html',
        link: (scope, elem, attr) => {
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
    }
});