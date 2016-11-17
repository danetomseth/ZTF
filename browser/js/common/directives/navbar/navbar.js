app.directive('navbar', function($rootScope, AuthService, AUTH_EVENTS, $state) {

    return {
        restrict: 'E',
        scope: {},
        templateUrl: 'js/common/directives/navbar/navbar.html',
        link: function(scope) {

            $rootScope.$on('$stateChangeSuccess',
                function(event, toState, toParams, fromState, fromParams) {
                    scope.currentPage = toState.name;
                }
            )

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
                },

                {
                    label: 'Admin',
                    state: 'admin'
                }
            ];

            scope.user = null;

            scope.isLoggedIn = function() {
                return AuthService.isAuthenticated();
            };

            scope.logout = function() {
                AuthService.logout().then(function() {
                    $state.go('home');
                });
            };



            var setUser = function() {
                AuthService.getLoggedInUser().then(function(user) {
                    scope.user = user;
                });
            };

            var removeUser = function() {
                scope.user = null;
            };

            setUser();

            $rootScope.$on(AUTH_EVENTS.loginSuccess, setUser);
            $rootScope.$on(AUTH_EVENTS.logoutSuccess, removeUser);
            $rootScope.$on(AUTH_EVENTS.sessionTimeout, removeUser);

        }

    };

});