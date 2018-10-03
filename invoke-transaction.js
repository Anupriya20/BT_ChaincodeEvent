/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
'use strict';
var path = require('path');
var fs = require('fs');
var util = require('util');
var hfc = require('fabric-client');
var helper = require('./helper.js');
var logger = helper.getLogger('invoke-chaincode');

var invokeChaincode = async function(peerNames, channelName, chaincodeName, fcn, args, username, org_name) {
	logger.debug(util.format('\n============ invoke transaction on channel %s ============\n', channelName));
	var error_message = null;
	var tx_id_string = null;
	try {
		// first setup the client for this org
		var client = await helper.getClientForOrg(org_name, username);
		logger.debug('Successfully got the fabric client for the organization "%s"', org_name);
		var channel = client.getChannel(channelName);
		if(!channel) {
			let message = util.format('Channel %s was not defined in the connection profile', channelName);
			logger.error(message);
			throw new Error(message);
		}
		var tx_id = client.newTransactionID();
		// will need the transaction ID string for the event registration later
		tx_id_string = tx_id.getTransactionID();
		
		// send proposal to endorser
		var request = {
			targets: peerNames,
			chaincodeId: chaincodeName,
			fcn: fcn,
			args: args,
			chainId: channelName,
			txId: tx_id
		};

		let results = await channel.sendTransactionProposal(request);
		// the returned object has both the endorsement results
		// and the actual proposal, the proposal will be needed
		// later when we send a transaction to the orderer
		var proposalResponses = results[0];
		var proposal = results[1];
               // logger.info(util.format('The proposal response----------%s',proposalResponses[0]));
               

                //to also send data to app.js with tx ID
                logger.info(util.format('The proposal response[0]----------%s',proposalResponses[0].payload));
                var returnProposal = proposalResponses[0].payload;
 
		// lets have a look at the responses to see if they are
		// all good, if good they will also include signatures
		// required to be committed
		var all_good = true;
		for (var i in proposalResponses) {
			let one_good = false;
			if (proposalResponses && proposalResponses[0].response &&
				proposalResponses[0].response.status === 200) {
				one_good = true;
				logger.info('invoke chaincode proposal was good');
			} else {
				logger.error('invoke chaincode proposal was bad');
			}
			all_good = all_good & one_good;
		}

		if (all_good) {
			logger.info(util.format(
				'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s',
				proposalResponses[0].response.status, proposalResponses[0].response.message,
				proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));

			// wait for the channel-based event hub to tell us
			// that the commit was good or bad on each peer in our organization
			var promises = [];
			let event_hubs = channel.getChannelEventHubsForOrg();
			event_hubs.forEach((eh) => {
                                let event_monitor_execute = new Promise((resolve, reject) => {
                                        let regid1 = null;
                                        let handle = setTimeout(() => {
                                                if (regid1) {
                                                         // might need to do the clean up this listener
                                                        eh.unregisterChaincodeEvent(regid1);
                                                        logger.info('Timeout - Failed to receive the chaincode event');
                                                }
                                           reject(new Error('Timed out waiting for chaincode event'));
                                        }, 50000);
                                        eh.connect(true);
                                        regid1 = eh.registerChaincodeEvent(chaincodeName,'evtsender',(event,block_num,tx,status) => {

                                                logger.info('Successfully got a chaincode event with transid:'+tx + ' with status:'+status);
                                                let event_payload = event.payload;
                                                logger.info('Successfully got a chaincode event with payload:'+ event_payload.toString('utf8'));
                                          //      if(event_payload.indexOf('CHAINCODE') > -1) {
                                                if(block_num){
                                                        clearTimeout(handle);
                                                        eh.unregisterChaincodeEvent(regid1);
                                                        logger.info('Successfully received the chaincode event on block number '+ block_num);
                                                        resolve('RECEIVED');
                                                } else {
                                                        logger.info('Successfully got chaincode event ... just not the one we are looking for on block number '+ block_num);
                                                }
                                        }, (error)=> {
                                                clearTimeout(handle);
                                                logger.info('Failed to receive the chaincode event ::'+error);
                                                reject(error);
                                        }
                                        );

                                });
				promises.push(event_monitor_execute);
			});

			var orderer_request = {
				txId: tx_id,
				proposalResponses: proposalResponses,
				proposal: proposal
			};
			var sendPromise = channel.sendTransaction(orderer_request);
			// put the send to the orderer last so that the events get registered and
			// are ready for the orderering and committing
			promises.push(sendPromise);
			let results = await Promise.all(promises);
			logger.debug(util.format('------->>> R E S P O N S E : %j', results));
			let response = results.pop(); //  orderer results are last in the results
			if (response.status === 'SUCCESS') {
				logger.info('Successfully sent transaction to the orderer.');
			} else {
				error_message = util.format('Failed to order the transaction. Error code: %s',response.status);
				logger.debug(error_message);
			}

			// now see what each of the event hubs reported
			for(let i in results) {
				let event_hub_result = results[i];
				let event_hub = event_hubs[i];
				logger.debug('Event results for event hub :%s',event_hub.getPeerAddr());
				if(typeof event_hub_result === 'string') {
					logger.debug("4343434343"+event_hub_result);
				} else {
					if(!error_message) error_message = event_hub_result.toString();
					logger.debug("4343434343434343"+event_hub_result.toString());
				}
			}
		} else {
			error_message = util.format('Failed to send Proposal and receive all good ProposalResponse');
			logger.debug(error_message);
		}
	} catch (error) {
		logger.error('Failed to invoke due to error: ' + error.stack ? error.stack : error);
		error_message = error.toString();
	}

	if (!error_message) {
		let message = util.format(
			'Successfully invoked the chaincode %s to the channel \'%s\' for transaction ID: %s',
			org_name, channelName, tx_id_string);
		logger.info(message);
                   
                //sending tx ID and result from chaincode
		return [tx_id_string, returnProposal] ;

	} else {
		let message = util.format('Failed to invoke chaincode. cause:%s',error_message);
		logger.error(message);
		throw new Error(message);
	}
};

exports.invokeChaincode = invokeChaincode;
