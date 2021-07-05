var fs = require('fs');
var path = require('path');
var async = require('async');
var watch = require('node-watch');
var redis = require('redis');
var dot = require('dot');
var express = require('express');
var bodyParser = require('body-parser');
var compress = require('compression');
var Stratum = require('stratum-pool');
var util = require('stratum-pool/lib/util.js');
var api = require('./api.js');

module.exports = function(logger) {
	dot.templateSettings.strip = false;
	var portalConfig = JSON.parse(process.env.portalConfig);
	var poolConfigs = JSON.parse(process.env.pools);
	var websiteConfig = portalConfig.website;
	var portalApi = new api(logger, portalConfig, poolConfigs);
	var portalStats = portalApi.stats;
	var logSystem = 'Website';
	var pageFiles = {
		'index.html': 'index',
		'home.html': '',
		'stats.html': 'stats',
		'api.html': 'api',
	};
	
	var pageTemplates = {};
	var pageProcessed = {};
	var indexesProcessed = {};
	var keyScriptTemplate = '';
	var keyScriptProcessed = '';
	var processTemplates = function() {
		for (var pageName in pageTemplates) {
			if (pageName === 'index') continue;
			pageProcessed[pageName] = pageTemplates[pageName]({
				poolsConfigs: poolConfigs,
				stats: portalStats.stats,
				portalConfig: portalConfig
			});
			indexesProcessed[pageName] = pageTemplates.index({
				page: pageProcessed[pageName],
				selected: pageName,
				stats: portalStats.stats,
				poolConfigs: poolConfigs,
				portalConfig: portalConfig
			});
		}
	};
	
	var readPageFiles = function(files) {
		async.each(files, function(fileName, callback) {
			var filePath = 'website/' + (fileName === 'index.html' ? '' : 'pages/') + fileName;
			fs.readFile(filePath, 'utf8', function(err, data){
				var pTemp = dot.template(data);
				pageTemplates[pageFiles[fileName]] = pTemp
				callback();
			});
		}, function(err) {
			if (err){
				console.log('error reading files for creating dot templates: '+ JSON.stringify(err));
				return;
			}
			processTemplates();
		});
	};
	
	watch('website', function(evt, filename) { // If an html file was changed reload it
		var basename = path.basename(filename);
		if (basename in pageFiles){
			console.log(filename);
			readPageFiles([basename]);
			logger.debug(logSystem, 'Server', 'Reloaded file ' + basename);
		}
	});
	
	portalStats.getGlobalStats(function() {readPageFiles(Object.keys(pageFiles));});
	
	var buildUpdatedWebsite = function() {
		portalStats.getGlobalStats(function(){
			processTemplates();
			var statData = 'data: ' + JSON.stringify(portalStats.stats) + '\n\n';
			for (var uid in portalApi.liveStatConnections){
				var res = portalApi.liveStatConnections[uid];
				res.write(statData);
			}
		});
	};
	
	setInterval(buildUpdatedWebsite, websiteConfig.stats.updateInterval * 1000);
	var getPage = function(pageId){
		if (pageId in pageProcessed){
			var requestedPage = pageProcessed[pageId];
			return requestedPage;
		}
	};
	
	var route = function(req, res, next){
		var pageId = req.params.page || '';
		if (pageId in indexesProcessed) {
			res.header('Content-Type', 'text/html');
			res.end(indexesProcessed[pageId]);
		}
		else
			next();
	};
	
	var app = express();
	app.use(bodyParser.json());
	app.get('/get_page', function(req, res, next) {
		var requestedPage = getPage(req.query.id);
		if (requestedPage) {
			res.end(requestedPage);
			return;
		}
		next();
	});
	
	app.get('/:page', route);
	app.get('/', route);
	app.get('/api/:method', function(req, res, next){
		portalApi.handleApiRequest(req, res, next);
	});
	
	app.use(compress());
	app.use('/static', express.static('website/static'));
	app.use(function(err, req, res, next){
		console.error(err.stack);
		res.send(500, 'Something broke!');
	});
	
	try {
		app.listen(portalConfig.website.port, portalConfig.website.host, function () {
			logger.debug(logSystem, 'Server', 'Website started on ' + portalConfig.website.host + ':' + portalConfig.website.port);
		});
	}
	catch(e) {
		logger.error(logSystem, 'Server', 'Could not start website on ' + portalConfig.website.host + ':' + portalConfig.website.port +  ' - its either in use or you do not have permission');
	}
};
