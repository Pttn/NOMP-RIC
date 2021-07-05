var pow = require('PoW');
var util = require('./util.js');

var algos = module.exports = global.algos = {
	stella: {
		hash: function() {
			return function() {return pow.stella.apply(this, arguments);}
		}
	}
};
