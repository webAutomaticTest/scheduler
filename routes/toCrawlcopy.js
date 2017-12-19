const winston = require('winston');
const amqp = require('amqplib');
const QUEUE_NAME = 'crawl_queue';

module.exports.init = function(serverNames, webServer) {
	const rmqUrl = `amqp://${serverNames.rabbitServerName}`;
	webServer
	.get('/crawlNow/:scenarioActions', (req, res) => {
		crawlNow(req,res, req.params.scenarioActions);
	});


	function crawlNow(req, res, scenarioActions) {
		// winston.info(`Crawl Now Request on `);	

		// var firstPromise = scenarioActions.slice(0, i + 1);
		var firstPromise = scenarioActions;

		var secondPromise = amqp.connect(rmqUrl)
		.then( conn => {
			return conn.createConfirmChannel();
		})
		.catch( e=> {
			return Promise.reject(e);
		});

		Promise.all([firstPromise,secondPromise])
		.then(promizesResults => {
			var scenarioToCrawl = promizesResults[0];
			var msg = JSON.stringify(scenarioToCrawl);
			winston.info(`msg is ${scenarioToCrawl}`);

			var channel = promizesResults[1];
			channel.assertQueue(QUEUE_NAME, { durable: true })
			.then(ok => {
				if (ok) {
					return channel.sendToQueue(QUEUE_NAME, Buffer.from(msg), {persistent: true});
				} else {
					return Promise.reject(ok);
				}
			})
			.then(() => {
				channel.close();
			})
			.catch ((err) =>{
				channel.close();
				winston.error(err);
			});

		})
		.catch(err => {
			console.log(err);
		});

	}

};