# BT_ChaincodeEvent

In this we will be using the generating the transaction by the Chaincode Event listner.

# Prerequisites:

Run Balance Transffer(BT) demo of Hyperledger Fabric.

# Why Chaincode Event Needed?

	When we need to monitor the events posted by the Chaincode. We uses Chaincode event listner.

# How this works?
	
	The client i.e. the NodeJS will get notified when a new block is added to the ledger. The 
	client then will be checking for the desired pattern in the Chaincode event name field. 

	channel_event_hub.registerChaincodeEvent(chaincode_id.toString(), 'evtsender',
        (event, block_num, txnid, status) => {});
	
	If the chaincode event name matches to the desired pattern then chaincode listner callback
	will get notified with the chaincode event,block number, transaction id and transaction status.
	The obtained block will consist of only event name. It does not contain the payload information.
	
	In case if the payload is required the below points should be required:

	1.	User must have access to the full block

	2.	The channel event hub must be connect(true) to receive the full block events from the 
		peer's channel-based event service.


# Changes the will be in (BT) demo app.
	
	1.	Replace invoke_transaction.js with shared file (invoke_trasaction.js)
	
	2. 	Replace example_cc.go with the shared file (example_cc.go)



