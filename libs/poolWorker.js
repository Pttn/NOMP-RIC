var Stratum = require('stratum-pool');
var redis   = require('redis');
var net     = require('net');

var MposCompatibility = require('./mposCompatibility.js');
var ShareProcessor = require('./shareProcessor.js');

module.exports = function(logger){

    var _this = this;

    var poolConfigs  = JSON.parse(process.env.pools);
    var portalConfig = JSON.parse(process.env.portalConfig);

    var forkId = process.env.forkId;
    
    var pools = {};

    var proxySwitch = {};

    var redisClient = redis.createClient(portalConfig.redis.port, portalConfig.redis.host);

    //Handle messages from master process sent via IPC
    process.on('message', function(message) {
        switch(message.type){

            case 'banIP':
                for (var p in pools){
                    if (pools[p].stratumServer)
                        pools[p].stratumServer.addBannedIP(message.ip);
                }
                break;

            case 'blocknotify':

                var messageCoin = message.coin.toLowerCase();
                var poolTarget = Object.keys(pools).filter(function(p){
                    return p.toLowerCase() === messageCoin;
                })[0];

                if (poolTarget)
                    pools[poolTarget].processBlockNotify(message.hash, 'blocknotify script');

                break;
        }
    });


    Object.keys(poolConfigs).forEach(function(coin) {

        var poolOptions = poolConfigs[coin];

        var logSystem = 'Pool';
        var logComponent = coin;
        var logSubCat = 'Thread ' + (parseInt(forkId) + 1);

        var handlers = {
            auth: function(){},
            share: function(){},
            diff: function(){}
        };

        //Functions required for MPOS compatibility
        if (poolOptions.mposMode && poolOptions.mposMode.enabled){
            var mposCompat = new MposCompatibility(logger, poolOptions);

            handlers.auth = function(port, workerName, password, authCallback){
                mposCompat.handleAuth(workerName, password, authCallback);
            };

            handlers.share = function(isValidShare, isValidBlock, data){
                mposCompat.handleShare(isValidShare, isValidBlock, data);
            };

            handlers.diff = function(workerName, diff){
                mposCompat.handleDifficultyUpdate(workerName, diff);
            }
        }

        //Functions required for internal payment processing
        else{

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
                            var isValid = results.filter(function (r) {
                                return r.response.isvalid
                            }).length > 0;
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
            handlers.auth(port, workerName, password, function(authorized){

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
        pool.on('share', function(isValidShare, isValidBlock, data){

            var shareData = JSON.stringify(data);

            if (data.blockHash && !isValidBlock)
                logger.debug(logSystem, logComponent, logSubCat, 'We thought a block was found but it was rejected by the daemon, share data: ' + shareData);

            else if (isValidBlock)
                logger.debug(logSystem, logComponent, logSubCat, 'Block found: ' + data.blockHash + ' by ' + data.worker);

            if (isValidShare) {
                if(data.shareDiff > 1000000000)
                    logger.debug(logSystem, logComponent, logSubCat, 'Share was found with diff higher than 1.000.000.000!');
                else if(data.shareDiff > 1000000)
                    logger.debug(logSystem, logComponent, logSubCat, 'Share was found with diff higher than 1.000.000!');
                logger.debug(logSystem, logComponent, logSubCat, 'Share accepted at diff ' + data.difficulty + '/' + data.shareDiff + ' by ' + data.worker + ' [' + data.ip + ']' );

            } else if (!isValidShare)
                logger.debug(logSystem, logComponent, logSubCat, 'Share rejected: ' + shareData);

            handlers.share(isValidShare, isValidBlock, data)


        }).on('difficultyUpdate', function(workerName, diff){
            logger.debug(logSystem, logComponent, logSubCat, 'Difficulty update to diff ' + diff + ' workerName=' + JSON.stringify(workerName));
            handlers.diff(workerName, diff);
        }).on('log', function(severity, text) {
            logger[severity](logSystem, logComponent, logSubCat, text);
        }).on('banIP', function(ip, worker){
            process.send({type: 'banIP', ip: ip});
        }).on('started', function(){
        });

        pool.start();
        pools[poolOptions.coin.name] = pool;
    });


    if (portalConfig.switching) {

        var logSystem = 'Switching';
        var logComponent = 'Setup';
        var logSubCat = 'Thread ' + (parseInt(forkId) + 1);

        var proxyState = {};

        //
        // Load proxy state for each algorithm from redis which allows NOMP to resume operation
        // on the last pool it was using when reloaded or restarted
        //
        logger.debug(logSystem, logComponent, logSubCat, 'Loading last proxy state from redis');



        /*redisClient.on('error', function(err){
            logger.debug(logSystem, logComponent, logSubCat, 'Pool configuration failed: ' + err);
        });*/

        redisClient.hgetall("proxyState", function(error, obj) {
            if (!error && obj) {
                proxyState = obj;
                logger.debug(logSystem, logComponent, logSubCat, 'Last proxy state loaded from redis');
            }

            //
            // Setup proxySwitch object to control proxy operations from configuration and any restored
            // state.  Each algorithm has a listening port, current coin name, and an active pool to
            // which traffic is directed when activated in the config.
            //
            // In addition, the proxy config also takes diff and varDiff parmeters the override the
            // defaults for the standard config of the coin.
            //
            Object.keys(portalConfig.switching).forEach(function(switchName) {

                var algorithm = portalConfig.switching[switchName].algorithm;

                if (!portalConfig.switching[switchName].enabled) return;


                var initalPool = proxyState.hasOwnProperty(algorithm) ? proxyState[algorithm] : _this.getFirstPoolForAlgorithm(algorithm);
                proxySwitch[switchName] = {
                    algorithm: algorithm,
                    ports: portalConfig.switching[switchName].ports,
                    currentPool: initalPool,
                    servers: []
                };


                Object.keys(proxySwitch[switchName].ports).forEach(function(port){
                    var f = net.createServer(function(socket) {
                        var currentPool = proxySwitch[switchName].currentPool;

                        logger.debug(logSystem, 'Connect', logSubCat, 'Connection to '
                            + switchName + ' from '
                            + socket.remoteAddress + ' on '
                            + port + ' routing to ' + currentPool);
                        
                        if (pools[currentPool])
                            pools[currentPool].getStratumServer().handleNewClient(socket);
                        else
                            pools[initalPool].getStratumServer().handleNewClient(socket);

                    }).listen(parseInt(port), function() {
                        logger.debug(logSystem, logComponent, logSubCat, 'Switching "' + switchName
                            + '" listening for ' + algorithm
                            + ' on port ' + port
                            + ' into ' + proxySwitch[switchName].currentPool);
                    });
                    proxySwitch[switchName].servers.push(f);
                });

            });
        });
    }

    this.getFirstPoolForAlgorithm = function(algorithm) {
        var foundCoin = "";
        Object.keys(poolConfigs).forEach(function(coinName) {
            if (poolConfigs[coinName].coin.algorithm == algorithm) {
                if (foundCoin === "")
                    foundCoin = coinName;
            }
        });
        return foundCoin;
    };
};
