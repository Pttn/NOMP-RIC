var net = require('net');
var events = require('events');
require('./algoProperties.js'); // Gives us global access to everything we need for each hashing algorithm
var pool = require('./pool.js');

exports.daemon = require('./daemon.js');
exports.createPool = function(poolOptions, authorizeFn) {
	var newPool = new pool(poolOptions, authorizeFn);
	return newPool;
};
