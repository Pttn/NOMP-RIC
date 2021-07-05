var Stratum = require('stratum-pool');
var redis   = require('redis');
var net     = require('net');
var MposCompatibility = require('./mposCompatibility.js');
var ShareProcessor = require('./shareProcessor.js');

module.exports = function(logger) {
	var _this = this;
	var poolConfigs  = JSON.parse(process.env.pools);
	var portalConfig = JSON.parse(process.env.portalConfig);
	var forkId = process.env.forkId;
	var pools = {};
	var proxySwitch = {};
	var redisClient = redis.createClient(portalConfig.redis.port, portalConfig.redis.host);
	
	//Handle messages from master process sent via IPC
	process.on('message', function(message) {
		switch(message.type) {
			case 'banIP':
				for (var p in pools) {
					if (pools[p].stratumServer)
						pools[p].stratumServer.addBannedIP(message.ip);
				}
				break;
			case 'blocknotify':
				var messageCoin = message.coin;
				var poolTarget = Object.keys(pools).filter(function(p) {return p === messageCoin;})[0];
				if (poolTarget)
					pools[poolTarget].processBlockNotify(message.hash, 'blocknotify script');
				break;
		}
	});
	
	Object.keys(poolConfigs).forEach(function(coin) {
		var poolOptions = poolConfigs[coin];
		var logSystem = 'Pool';
		var logComponent = coin;
		var logSubCat = 'Thread ' + parseInt(forkId);
		var handlers = {
			auth: function(){},
			share: function(){},
			diff: function(){}
		};
		
		if (poolOptions.mposMode && poolOptions.mposMode.enabled) { // Functions required for MPOS compatibility
			var mposCompat = new MposCompatibility(logger, poolOptions);
			handlers.auth = function(port, workerName, password, authCallback) {mposCompat.handleAuth(workerName, password, authCallback);};
			handlers.share = function(isValidShare, isValidBlock, data) {mposCompat.handleShare(isValidShare, isValidBlock, data);};
			handlers.diff = function(workerName, diff) {mposCompat.handleDifficultyUpdate(workerName, diff);}
		}
		else { // Functions required for internal payment processing
			var shareProcessor = new ShareProcessor(logger, poolOptions);
			handlers.auth = function(port, workerName, password, authCallback){
				if (poolOptions.validateWorkerUsername !== true)
					authCallback(true);
				else {
					if (workerName.length === 40) {
						try {
							Buffer.from(workerName, 'hex');
							authCallback(true);
						}
						catch (e) {
							authCallback(false);
						}
					}
					else {
						pool.daemon.cmd('validateaddress', [workerName], function (results) {
							var isValid = results.filter(function (r) {return r.response.isvalid}).length > 0;
							authCallback(isValid);
						});
					}
				}
			};
			handlers.share = function(isValidShare, isValidBlock, data){
				shareProcessor.handleShare(isValidShare, isValidBlock, data);
			};
		}
		
		var authorizeFN = function (ip, port, workerName, password, callback) {
			handlers.auth(port, workerName, password, function(authorized) {
				var authString = authorized ? 'Authorized' : 'Unauthorized ';
				logger.debug(logSystem, logComponent, logSubCat, authString + ' ' + workerName + ':' + password + ' [' + ip + ']');
				callback({
					error: null,
					authorized: authorized,
					disconnect: false
				});
			});
		};
		
		var pool = Stratum.createPool(poolOptions, authorizeFN, logger);
		pool.on('share', function(isValidShare, isValidBlock, data) {
			var shareData = JSON.stringify(data);
			if (data.blockHash && !isValidBlock)
				logger.debug(logSystem, logComponent, logSubCat, 'We thought a block was found but it was rejected by the daemon, share data: ' + shareData);
			else if (isValidBlock)
				logger.debug(logSystem, logComponent, logSubCat, 'Block found: ' + data.blockHash + ' by ' + data.worker);
			if (isValidShare)
				logger.debug(logSystem, logComponent, logSubCat, data.shareDiff + '-share accepted (min ' + data.difficulty + '), ' + data.worker + ' [' + data.ip + ']' );
			else
				logger.debug(logSystem, logComponent, logSubCat, 'Share rejected: ' + shareData);
			handlers.share(isValidShare, isValidBlock, data)
		}).on('difficultyUpdate', function(workerName, diff) {
			logger.debug(logSystem, logComponent, logSubCat, 'Difficulty update to diff ' + diff + ' workerName=' + JSON.stringify(workerName));
			handlers.diff(workerName, diff);
		}).on('log', function(severity, text) {
			logger[severity](logSystem, logComponent, logSubCat, text);
		}).on('banIP', function(ip, worker) {
			process.send({type: 'banIP', ip: ip});
		}).on('started', function() {
		});
		pool.start();
		pools[poolOptions.coin.name] = pool;
	});
};
