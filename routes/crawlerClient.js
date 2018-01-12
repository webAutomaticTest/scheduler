const winston = require('winston');
const amqp = require('amqplib');
const wat_action = require('wat_action_nightmare');
const QUEUE_NAME = 'crawl_queue';

module.exports.init = function(serverNames, webServer) {
	const rmqUrl = `amqp://${serverNames.rabbitServerName}`;
	var corr = generateUuid();
	
	webServer
	.post('/crawlNow/', (req, res) => {
		var firstPromise = req.body;
		var secondPromise = amqp.connect(rmqUrl)
		.then( conn => {
			return conn.createConfirmChannel();
		})
		.catch( e=> {
			return Promise.reject(e);
		});

		Promise.all([firstPromise,secondPromise])
		.then(promizesResults => {
			var msg = JSON.stringify(promizesResults[0]);
			winston.info(`msg is ${msg}`);

			var channel = promizesResults[1];
			channel.assertQueue(QUEUE_NAME, { durable: true })
			.then(async (ok) => {
				if (ok) {
					await channel.consume(QUEUE_NAME, (msgFeedback) => {
						if (msgFeedback.properties.correlationId == corr) {
							setTimeout(function() { 
								channel.close();
								res.status(200).send(`play request sent for scenario finish? :${msgFeedback.content.toString()}`).end(); 
							}, 500);
						}
					}, {noAck: true});
					return channel.sendToQueue(QUEUE_NAME,new Buffer(msg),{ correlationId: corr, replyTo: QUEUE_NAME });
				} else {
					return Promise.reject(ok);
				}
			})
			.catch ((err) =>{
				channel.close();
				winston.error(err);
				res.status(500).send(`play request cannot be sent : ${err}`);
			});

		})
		.catch(err => {
			console.log(err);
			res.status(500).send(err).end();
		});
	});

	function generateUuid() {
		console.log("math random");
		return Math.random().toString() +
		Math.random().toString() +
		Math.random().toString();
	}

};