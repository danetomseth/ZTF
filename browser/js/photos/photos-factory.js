app.factory('PhotosFactory', ($http) => {
	return {
		addPhoto: (src) => {
			let photo = {
				src: src,
				name: 'test'
			}
			$http.post('/api/photos/add', photo)
			.then(res => {
			})
		},
		savePhoto: (photo) => {
			$http.post('/api/photos/update', photo).then(res => {
				console.log(res.data);
			})
		},
		fetchAll: () => {
			return $http.get('/api/photos')
			.then(res => {
				return res.data;
			})
		},
		fetchTen: () => {
			return $http.get('/api/photos/limit10')
			.then(res => {
				return res.data;
			})
		}
	}
});