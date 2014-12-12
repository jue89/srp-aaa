var exec = require( 'child_process' ).exec;
var spawn = require( 'child_process' ).spawn;
var path = require( 'path' );
var fs = require( 'fs' );
var async = require( 'async' );
var mqtt = require( 'mqtt' );
var ctrl = require( './lib/ctrl.js' );
var log = require( './lib/log.js' );

var fastd;

var cacheDir = path.resolve( __dirname, 'cache' );
var confFile = cacheDir + '/fastd.conf';
var peerPath = cacheDir + '/fastd-peers';
var errFile = fs.createWriteStream( cacheDir + '/fastd.log', { flags: 'a' } );


function Fastd() {}

Fastd.prototype = {
	// Starts FASTD
	start: function( config ) {
		var self = this;

		// Preparations for starting FASTD
		self.genConfig( config );

		// Spawn FASTD
		fastd = spawn( 'fastd', [
			'--config', confFile
		] );
		fastd.stderr.pipe( errFile );
		fastd.on( 'exit', function() {
			log.warn( "Errors occured and FASTD stopped" );
			fastd = null;
			errFile.end();
		} );
		log.debug1( "FASTD spwaned" );

		// Give FASTD some time to start
		setTimeout( function() { self.fetchPeers( config ); }, 500 );
	},

	// Stops FASTD
	stop: function( done ) {
		if( ! fastd ) return done();

		// Setup exit event
		fastd.removeAllListeners( 'exit' );
		fastd.on( 'exit', function() {
			log.debug1( "FASTD stopped" );
			fastd = null;
			errFile.end();
			done();
		} );
		
		// Send SIGTERM to fastd
		fastd.kill();
	},

	// Config generation
	genConfig: function( config ) {
		// Clear all existing peers
		fs.readdirSync( peerPath ).forEach( function( f ) {
			if( ! f[0] == "." ) fs.unlinkSync( peerPath + '/' + f );
		} );
		log.debug1( "Cleaned FASTD peer directory" );

		// Write config file
		fs.writeFileSync(
			confFile,
			 'secret "' + config.privateKey + '";\n'
			+'interface "aaa";\n'
			+'mtu 1426;\n'
			+'bind 0.0.0.0:1337;\n'
			+'method "xsalsa20-poly1305";\n'
			+'on up "ip link set dev $INTERFACE up; ip addr add ' + config.ipv6_addr + '/64 dev $INTERFACE";\n'
			+'on down "ip link set dev $INTERFACE down";\n'
			+'include peers from "fastd-peers";\n'
			+'log to stderr level debug2;\n'
		);
	},

	// Peer source
	fetchPeers: function( config ) {
		var self = this;

		// First: Start listener to MQTT
		// TODO: Add auth
		var mqttc = mqtt.createClient( config.mqtt.port, config.mqtt.host );
		// When connected subscribe to topic ap.
		mqttc.on( 'connect', function() {
			log.debug0( "Listing to peer updates" );
			mqttc.subscribe( 'ap/+' );
		} );
		// Arriving messages
		mqttc.on( 'message', function( topic, message ) {
			// Get sub-topic
			topic = topic.split('/');

			// Make sure it's an ap message
			if( topic[0] != "ap" ) return;

			// Parse message content from sting to object
			message = JSON.parse( message );

			// Interprete sub-topic and call function
			switch( topic[1] ) {
				case 'add': self.addPeers( message ); break;
				case 'remove': self.removePeers( message ); break;
				case 'update': self.modifyPeers( message ); break;
			}
		} );

		// Then: Get all already existing peers
		ctrl.get( 'aps?fields=public_key&limit=0', function( err, res ) {
			if( err ) throw err;

			// Add all Aps
			if( res.body.aps.length > 0 ) self.addPeers( res.body.aps );
		} );

	},

	// Adds peer
	addPeers: function( peers, done ) {
		// Skip when FASTD is down
		if( ! fastd ) return;
		
		// When peers is no array change that ...
		if( ! peers.length ) peers = [ peers ];

		// Iterate through all peers
		async.each( peers, function( peer, done ) {
			// Write config file for each one
			fs.writeFile(
				peerPath + '/' + peer.id,
				'key "' + peer.public_key + '";\n',
				function( err ) {
					if( err ) console.error( err );
					log.debug0( "New FASTD peer " + peer.id );
					done();
				}
			)
		}, function() {
			// When done inform FASTD about newly added peers
			fastd.kill( 'SIGHUP' );
			log.debug1( "Reloaded FASTD peer database" );
			if( done ) done();
		} );
	},

	// Removes peer
	removePeers: function( peers, done ) {
		// Skip when FASTD is down
		if( ! fastd ) return;
		
		// When peers is no array change that ...
		if( ! peers.length ) peers = [ peers ];

		// Iterate through all peers
		async.each( peers, function( peer, done ) {
			// Write config file for each one
			fs.unlink(
				peerPath + '/' + peer.id,
				function( err ) {
					if( err ) console.error( err );
					log.debug0( "Removed FASTD peer " + peer.id );
					done();
				}
			)
		}, function() {
			// When done inform FASTD about newly added peers
			fastd.kill( 'SIGHUP' );
			log.debug1( "Reloaded FASTD peer database" );
			if( done ) done();
		} );

	},

	// Modifies peer
	modifyPeers: function( peers, done ) {
		var self = this;
		
		// Modifying peers is just removing and adding peers ...
		self.removePeers( peers, function( ) {
			self.addPeers( peers, done );
		} );
	},

	// Generates key pair
	genKey: function( done ) {
		return exec( 'fastd --generate-key', function( err, stdout, stderr ) {
			if( err ) return done( err );

			// Get keys
			var regex = /^Secret: ([^n]*)\nPublic: ([^\n]*)\n$/im;
			var keys = regex.exec( stdout );

			// When groups are not available --> Something went wrong
			if( ! keys || ! keys[1] || ! keys[2] ) return done( new Error( "Something went wrong reading generated keys." ) );

			log.debug1( "Generated key pair" );

			done( null, {
				privateKey: keys[1],
				publicKey: keys[2]
			} );
		} );
	}
}

module.exports = new Fastd();
