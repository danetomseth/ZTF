app.factory('AlbumFactory', function($http, $state, $timeout, DialogFactory) {
    let success = (text) => {
        DialogFactory.display(text, 750);
    }
    return {
        createAlbum: (album) => {
            return $http.post('/api/albums/', album).then(res => {
                success("created");
                console.log("res", res);
                return res.data;
            })
            .catch(e => {
                console.error("error saving album", e);
            })

        },
        fetchAll: () => {
            return $http.get('/api/albums/')
            .then(res => {
                return res.data;
            })
        },
        updateAlbum: (album) => {
            return $http.post('/api/albums/update', album)
            .then(res => {
                return res.data;
            })
        },
        fetchOne: (albumId) => {
            return $http.get('/api/albums/'+ albumId)
            .then(res => {
                return res.data
            });
        },
        findUserAlbums: (userId) => {
            return $http.get('/api/albums/user/' + userId).then(res => {
                return res.data;
            })
        },
        addPhoto: (albumId, photoId) => {
            let obj = {};
            obj.albumId = albumId;
            obj.photoId = photoId;
            return $http.post('/api/albums/addPhoto', obj)
            .then(res => {
                return res.data
            });
        },
        deleteAlbum: (albumId) => {
            return $http.delete('/api/albums/'+ albumId)
        }, 
        fetchPhotosInAlbum: (albumId) => {
            return $http.get('/api/albums/photos/' + albumId).then(res => {
                console.log("res");
                return res.data
            });
        }
    }

})