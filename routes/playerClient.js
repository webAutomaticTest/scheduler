const winston = require('winston');
const amqp = require('amqplib');
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;
const Crontab = require('crontab');

const QUEUE_NAME = 'player_queue';

module.exports.init = function(serverNames, webServer) {
	const dbUrl = `mongodb://${serverNames.mongoServerName}:27018/wat_storage`;
	const rmqUrl = `amqp://${serverNames.rabbitServerName}`;
	

	webServer
	.get('/playNow/:sid', async (req, res) => {
		await playNow(req,res, req.params.sid);
	})
	.get('/playSchedule/:sid', (req, res) => {
		const options = {
			cron : '0 6 * * *',
			sid : req.params.sid
		};
		addCron(req,res, options);
	})

	function generateUuid() {
		console.log("math random");
		return Math.random().toString() +
		Math.random().toString() +
		Math.random().toString();
	}

	async function playNow(req, res, sid) {
		await winston.info(`Play Now Request on ${dbUrl}`);
		var corr = await generateUuid();
		await MongoClient.connect(dbUrl)
		.then( async (db) => {
			await db.collection('scenario', async (err, scenarioCollection) => {
				if (err) {
					winston.error(`Play Now Request Error : ${err}`);
					db.close();
					res.status(404).send(err).end();
				} else {
					await winston.info(`Launch promise ${sid}`);
					var firstPromise = scenarioCollection.find({_id:new ObjectID(sid)}).toArray();
					var secondPromise = amqp.connect(rmqUrl)
					.then( conn => {
						return conn.createConfirmChannel();
					})
					.catch( e=> {
						return Promise.reject(e);
					});
					await Promise.all([firstPromise,secondPromise])
					.then(async (promizesResults) => {
						winston.info('Play Now Request ');
						var scenarioToPlay = promizesResults[0][0];
						var channel = promizesResults[1];
						var msg = JSON.stringify(scenarioToPlay);
						winston.info(`msg is : ${msg}`);
						await channel.assertQueue(QUEUE_NAME, { durable: true })
						.then( async (ok) => {
							if (ok) {
								await channel.consume(QUEUE_NAME, (msgFeedback) => {
									if (msgFeedback.properties.correlationId == corr) {
										setTimeout(function() { 
											channel.close();
											db.close();
											res.status(200).send(msgFeedback.content.toString()).end(); 
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
							db.close();
							winston.error(err);
							res.status(500).send(`play request cannot be sent : ${err}`);
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

	function addCron(req, res, playOptions) {
		const cron = playOptions.cron;
		const comment = playOptions.sid;
		winston.info(`Add new cron for scenario (${playOptions.sid}) with cron ${cron}`);
		if (cron) {
			Crontab.load((err, ct) => {
				const NODE_BIN = '/usr/local/bin/node';
				const NODE_SCRIPT = '/tmp/scheduler/sendPlayMessage.js';
				const NODE_OPTIONS = `--mongo=mongo --rabbit=rabbit --sid=${playOptions.sid}`;
				const LOG = '>> /var/log/watcron.log 2>&1';
				ct.create(`${NODE_BIN} ${NODE_SCRIPT} ${NODE_OPTIONS} ${LOG}`, cron, comment);
				
				ct.save((err) => {
					if (err) {
						res.status(500).send(err).end();
					}
					else {
						res.status(200).send(`cron request sent for scenario ${playOptions.sid}`).end();
					}
				}); 
			});
		} else {
			res.status(500).send(`cron ${cron} is not valid`).end();
		}
	}

};