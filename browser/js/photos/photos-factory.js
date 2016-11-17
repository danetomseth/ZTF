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
		},
		getFiles: () => {
			$http.get('/api/getFiles/albumA')
			.then(res => {
				console.log("Returned: ", res.data);
			})
		},
		updateAll: () => {
			$http.put('/api/photos/updateAll').then(res => {
				console.log("res: ", res.data);
			})
		},
		getRandom: (amount) => {
			return $http.get('/api/photos/random/' + amount).then(res => {
				console.log("res: ", res.data);
				return res.data;
			})
		}
	}
});