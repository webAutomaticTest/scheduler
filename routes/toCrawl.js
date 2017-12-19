const winston = require('winston');
const amqp = require('amqplib');
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;
const QUEUE_NAME = 'crawl_queue';

module.exports.init = function(serverNames, webServer) {
	const dbUrl = `mongodb://${serverNames.mongoServerName}:27018/wat_storage`;
	const rmqUrl = `amqp://${serverNames.rabbitServerName}`;
	webServer
	.get('/crawlNow/:crawlID', (req, res) => {
		crawlNow(req,res, req.params.crawlID);
	});


	function crawlNow(req, res, crawlID) {
		winston.info(`Crawl Now Request on ${dbUrl}`);
		MongoClient.connect(dbUrl)
		.then(db => {
			db.collection('crawlScenario',(err,crawlScenarioCollection) =>{
				if(err){
					winston.error(`Crawl Now Request Error : ${err}`);
					db.close();
					res.status(404).send(err).end();
				} else {
					winston.info(`Launch promise ${crawlID}`);
					var firstPromise = crawlScenarioCollection.find({_id:new ObjectID(crawlID)}).toArray();
					var secondPromise = amqp.connect(rmqUrl)
					.then( conn => {
						return conn.createConfirmChannel();
					})
					.catch( e=> {
						return Promise.reject(e);
					});

					Promise.all([firstPromise,secondPromise])
					.then(promizesResults => {
						winston.info('Crawl Now Request ');
						var scenarioToPlay = promizesResults[0][0];
						var channel = promizesResults[1];
						var msg = JSON.stringify(scenarioToPlay);
						winston.info(msg);
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
							db.close();
							res.status(200).send(`crawl request sent for scenario ${crawlID}`).end();
						})
						.catch ((err) =>{
							channel.close();
							db.close();
							winston.error(err);
							res.status(500).send(`crawl request cannot be sent : ${err}`);
						});
					})
					.catch(err => {
						db.close();
						res.status(500).send(err).end();
					});

				}

			});

		}).catch(err => {
			winston.info(err);
			res.send(err).status(500).end;
		});	


	}

};